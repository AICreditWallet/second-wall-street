import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, MailWarning, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMyOrganizations } from "@/lib/data/my-organization";
import { TIER_LABEL } from "@/lib/city/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReleaseOfficeForm } from "./forms";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ claimed?: string; released?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser("/dashboard");
  const supabase = await createSupabaseServerClient();
  const mine = supabase ? await getMyOrganizations(supabase, user.id) : [];
  const primary = mine.find((m) => m.role === "owner") ?? mine[0];
  const offices = mine.flatMap((m) => m.offices.map((o) => ({ ...o, org: m.org, role: m.role })));
  const profileDone = Boolean(primary && primary.org.description && primary.org.logoUrl);

  const steps = [
    { done: user.emailVerified, label: "Verify your email" },
    { done: offices.length > 0, label: "Claim a free office", href: "/city?filter=free" },
    { done: profileDone, label: "Add a description and logo", href: "/dashboard/organization" },
    { done: false, label: "Publish your first AI agent", soon: true },
  ];

  return (
    <PageShell eyebrow="Dashboard" title={primary ? primary.org.name : "Welcome to the district"}>
      {sp.claimed && (
        <p role="status" className="mb-8 rounded-2xl border border-cyan/30 bg-cyan/10 px-4 py-3 text-sm text-cyan-soft">
          🎉 Your office is yours. It now shows your organisation in the 3D city.
        </p>
      )}
      {sp.released && (
        <p role="status" className="mb-8 rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm text-fg-muted">
          Office released. It&apos;s now available to others.
        </p>
      )}
      {!user.emailVerified && (
        <p className="mb-8 flex gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          <MailWarning className="size-5 shrink-0" aria-hidden="true" /> Verify your email to claim an office — we sent a link to {user.email}.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="offices-h" className="space-y-4">
          <h2 id="offices-h" className="text-lg font-semibold">
            Your offices
          </h2>
          {offices.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-line-strong p-8 text-center">
              <p className="text-fg-muted">You don&apos;t have an office yet. Pick any free office in the city — it takes a minute.</p>
              <ButtonLink href="/city?filter=free" className="mt-5">
                Find a free office
              </ButtonLink>
            </div>
          ) : (
            <ul className="space-y-3">
              {offices.map((o) => (
                <li key={o.id} className="rounded-3xl border border-line bg-ink-900 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {o.buildingName} · {o.label}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
                        <MapPin className="size-3.5" aria-hidden="true" /> {o.districtName}
                      </p>
                    </div>
                    <Badge tone={o.tier === "standard" ? "cyan" : "gold"}>{TIER_LABEL[o.tier]}</Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <ButtonLink href={`/city?b=${o.buildingId}`} variant="secondary" className="min-h-10">
                      View in city
                    </ButtonLink>
                    <ButtonLink href={`/orgs/${o.org.slug}`} variant="secondary" className="min-h-10">
                      Public page
                    </ButtonLink>
                    {o.role !== "member" && <ReleaseOfficeForm officeId={o.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {primary && (
            <div className="rounded-3xl border border-line bg-ink-900 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-medium">Organisation profile</h2>
                  <p className="text-sm text-fg-muted">{primary.org.tagline || "Add a tagline so visitors know what you do."}</p>
                </div>
                {primary.role !== "member" && (
                  <ButtonLink href="/dashboard/organization" variant="secondary" className="min-h-10">
                    Edit profile
                  </ButtonLink>
                )}
              </div>
            </div>
          )}
        </section>

        <aside aria-labelledby="steps-h" className="h-fit rounded-3xl border border-line bg-ink-900 p-5">
          <h2 id="steps-h" className="font-medium">
            Getting started
          </h2>
          <ol className="mt-4 space-y-3">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-sm">
                {s.done ? <CheckCircle2 className="size-5 text-cyan" aria-label="Done" /> : <Circle className="size-5 text-fg-subtle" aria-label="Not done" />}
                {s.href && !s.done ? (
                  <Link href={s.href} className="hover:underline">
                    {s.label}
                  </Link>
                ) : (
                  <span className={s.done ? "text-fg-muted line-through" : ""}>{s.label}</span>
                )}
                {s.soon && <span className="ml-auto text-xs text-fg-subtle">Soon</span>}
              </li>
            ))}
          </ol>
          <div className="mt-6 border-t border-line pt-4 text-sm">
            <Link href="/account" className="text-fg-muted hover:text-fg">
              Account settings →
            </Link>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
