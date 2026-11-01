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
import { ClaimForm } from "../claim-form";

export const metadata: Metadata = { title: "Claim an Office", robots: { index: false } };

export default async function ClaimPage({ params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
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

  let body: React.ReactNode;
  if (!user.emailVerified) {
    body = (
      <p className="flex gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
        <MailWarning className="size-5 shrink-0" aria-hidden="true" /> Please verify your email address first — check your inbox for the link we sent.
      </p>
    );
  } else if (office.status !== "available") {
    body = (
      <div className="space-y-4">
        <p className="text-fg-muted">This office has already been taken.</p>
        <ButtonLink href={`/city?filter=free`}>Find another free office</ButtonLink>
      </div>
    );
  } else if (office.tier !== "standard") {
    body = (
      <div className="space-y-4">
        <p className="text-fg-muted">Premium offices open with paid plans soon. In the meantime, pick a free office — you can move later.</p>
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
            <li>A home for your AI agent listings (coming next)</li>
          </ul>
          <p>
            <Link href={`/city?b=${building.id}`} className="text-cyan-soft hover:underline">
              See this building in 3D →
            </Link>
          </p>
        </aside>
      </div>
    </PageShell>
  );
}
