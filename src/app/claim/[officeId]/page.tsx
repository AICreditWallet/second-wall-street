import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, MailWarning } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { getMyOrganizations } from "@/lib/data/my-organization";
import { TIER_LABEL } from "@/lib/city/queries";
import { SITE } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { officeIdSchema } from "@/lib/validation";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { CheckoutForm, ClaimForm } from "../claim-form";
import { cancelCheckout } from "../../billing/actions";
import { AGENT_LIMITS } from "@/lib/billing/plans";
import { getStripe, sellingEnabled, stripeMode } from "@/lib/billing/stripe";
import { PRICE_NOTE } from "@/lib/seller";
import { SubmitButton } from "@/components/ui/form";

export const metadata: Metadata = { title: "Claim an Office", robots: { index: false } };

export default async function ClaimPage({ params, searchParams }: { params: Promise<{ officeId: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { officeId } = await params;
  const { checkout } = await searchParams;
  if (!officeIdSchema.safeParse(officeId).success) notFound();
  const user = await requireUser(`/claim/${officeId}`);
  const snapshot = await getCitySnapshot();
  const office = snapshot.offices.find((o) => o.id === officeId);
  const building = office && snapshot.buildings.find((b) => b.id === office.buildingId);
  if (!office || !building) notFound();
  const district = snapshot.districts.find((d) => d.id === building.districtId);

  const supabase = await createSupabaseServerClient();
  const mine = supabase ? await getMyOrganizations(supabase, user.id) : [];
  const owned = mine.find((m) => m.role === "owner");
  const holdsFree = mine.some((m) => m.role === "owner" && m.offices.some((o) => o.tier === "standard"));
  // A checkout this person started for this office and hasn't finished.
  const { data: pending } = supabase
    ? await supabase.from("office_purchases").select("id, stripe_checkout_session_id, expires_at").eq("office_id", officeId).eq("status", "pending").gt("expires_at", new Date().toISOString()).maybeSingle()
    : { data: null };
  let resumeUrl: string | null = null;
  const stripe = getStripe();
  if (pending?.stripe_checkout_session_id && stripe) {
    const session = await stripe.checkout.sessions.retrieve(pending.stripe_checkout_session_id).catch(() => null);
    if (session?.status === "open") resumeUrl = session.url;
  }

  let body: React.ReactNode;
  if (!user.emailVerified) {
    body = (
      <p className="flex gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
        <MailWarning className="size-5 shrink-0" aria-hidden="true" /> Please verify your email address first — check your inbox for the link we sent.
      </p>
    );
  } else if (pending) {
    body = (
      <div className="space-y-4">
        <p className="text-fg-muted">
          {checkout === "cancelled" ? "You left the payment page. " : ""}This office is held for you until{" "}
          {new Date(pending.expires_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} (UK time). Nothing has been charged.
        </p>
        <div className="flex flex-wrap gap-3">
          {resumeUrl && <ButtonLink href={resumeUrl}>Continue to payment</ButtonLink>}
          <form action={cancelCheckout}>
            <input type="hidden" name="purchase" value={pending.id} />
            <input type="hidden" name="officeId" value={office.id} />
            <SubmitButton variant="secondary" pending="Releasing…">
              Release the office
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  } else if (office.status !== "available") {
    body = (
      <div className="space-y-4">
        <p className="text-fg-muted">This office has already been taken.</p>
        <ButtonLink href={`/city?filter=free`}>Find another free office</ButtonLink>
      </div>
    );
  } else if (office.tier !== "standard") {
    body = sellingEnabled ? (
      <CheckoutForm officeId={office.id} existingOrgName={owned?.org.name ?? null} siteHost={new URL(SITE.url).host} agentLimit={AGENT_LIMITS[office.tier]} testMode={stripeMode === "test"} priceNote={PRICE_NOTE} />
    ) : (
      <div className="space-y-4">
        <p className="text-fg-muted">Premium offices open for payment shortly. In the meantime, pick a free office — you can move later.</p>
        <ButtonLink href={`/city?filter=free`}>Find a free office</ButtonLink>
      </div>
    );
  } else if (holdsFree) {
    body = (
      <div className="space-y-4">
        <p className="text-fg-muted">You already have a free office. Release it from your dashboard first if you&apos;d like to move here.</p>
        <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
      </div>
    );
  } else {
    body = <ClaimForm officeId={office.id} existingOrgName={owned?.org.name ?? null} siteHost={new URL(SITE.url).host} />;
  }

  return (
    <PageShell eyebrow="Claim an office" title={`${building.name} · ${office.label}`} intro={<p>{district?.name} · {TIER_LABEL[office.tier]}</p>}>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="max-w-md rounded-3xl border border-line bg-ink-900 p-6">{body}</div>
        <aside className="space-y-3 text-sm text-fg-muted">
          <p className="flex items-center gap-2 font-medium text-fg">
            <Building2 className="size-4 text-cyan" aria-hidden="true" /> What you get
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Your organisation&apos;s name shown on this building in the 3D city</li>
            <li>A public organisation page</li>
            <li>
              {office.tier === "standard" ? "1 AI agent listed and shown working in your office" : `Up to ${AGENT_LIMITS[office.tier]} AI agents listed and shown working in your office`}
            </li>
            {office.tier !== "standard" && <li>A premium location with more visibility</li>}
            <li>
              <Link href="/pricing" className="text-cyan-soft hover:underline">Compare plans</Link>
            </li>
          </ul>
          <p>
            <Link prefetch={false} href={`/city?b=${building.id}`} className="text-cyan-soft hover:underline">
              See this building in 3D →
            </Link>
          </p>
        </aside>
      </div>
    </PageShell>
  );
}
