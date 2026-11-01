import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, Bot, ExternalLink } from "lucide-react";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ReviewSection } from "@/components/marketplace/ReviewSection";

export const revalidate = 60;

export async function generateStaticParams() {
  const s = await getCitySnapshot();
  return s.organizations.map((o) => ({ slug: o.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const org = (await getCitySnapshot()).organizations.find((o) => o.slug === slug);
  if (!org) return {};
  return { title: org.name, description: org.tagline, alternates: { canonical: `/orgs/${org.slug}` } };
}

export default async function OrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) notFound();
  const snapshot = await getCitySnapshot();
  const org = snapshot.organizations.find((o) => o.slug === slug);
  if (!org) notFound();
  // Community links are user-supplied: never pass ranking or referrer to them.
  const rel = org.operator === "platform" ? "noopener" : "nofollow ugc noopener noreferrer";
  const links = [
    org.website && { href: org.website, label: new URL(org.website).host },
    org.githubUrl && { href: org.githubUrl, label: "GitHub" },
  ].filter(Boolean) as { href: string; label: string }[];
  const agents = snapshot.agents.filter((a) => a.organizationId === org.id);
  const office = snapshot.offices.find((o) => o.organizationId === org.id);

  return (
    <PageShell
      eyebrow={org.operator === "platform" ? "Platform office" : "Organisation"}
      title={org.name}
      intro={
        <div className="space-y-3">
          {org.tagline && <p className="text-lg text-fg">{org.tagline}</p>}
          {org.description && <p className="whitespace-pre-line">{org.description}</p>}
        </div>
      }
    >
      {org.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={org.logoUrl} alt={`${org.name} logo`} width={72} height={72} className="mb-6 size-18 rounded-2xl border border-line object-cover" />
      )}
      <div className="flex flex-wrap gap-2">
        {org.verified && (
          <Badge tone="violet">
            <BadgeCheck className="size-3.5" aria-hidden="true" /> {org.operator === "platform" ? "Operated by Second Wall Street" : "Verified"}
          </Badge>
        )}
        {org.isDemo && <Badge tone="gold">Demo · simulated data only</Badge>}
      </div>
      {links.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-4 text-sm">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel={rel} className="inline-flex items-center gap-1 text-cyan-soft hover:underline">
                {l.label} <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {office && (
        <div className="mt-6">
          <ButtonLink href={`/city?b=${office.buildingId}`}>Visit the office in 3D</ButtonLink>
        </div>
      )}
      <h2 className="mt-12 text-lg font-semibold">Agents</h2>
      {agents.length === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">No agents listed yet.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <li key={a.id} className="rounded-2xl border border-line bg-ink-900 p-5">
              <div className="flex items-center justify-between">
                <Bot className="size-5 text-cyan" aria-hidden="true" />
                <Badge>{a.status === "in-development" ? "In development" : a.status === "preview" ? "Preview" : "Live"}</Badge>
              </div>
              <h3 className="mt-4 font-medium">
                <a href={`/agents/${a.slug}`} className="hover:underline">
                  {a.name}
                </a>
              </h3>
              <p className="text-xs text-fg-subtle">{a.category}</p>
              <p className="mt-2 text-sm text-fg-muted">{a.summary}</p>
              {a.disclosure && <p className="mt-3 border-t border-line pt-3 text-xs text-fg-subtle">{a.disclosure}</p>}
            </li>
          ))}
        </ul>
      )}
      {snapshot.source === "database" ? (
        <ReviewSection target={`organization:${org.id}`} path={`/orgs/${org.slug}`} average={snapshot.ratings?.[org.id]?.average} count={snapshot.ratings?.[org.id]?.count} />
      ) : (
        <>
          <h2 className="mt-12 text-lg font-semibold">Ratings & reviews</h2>
          <p className="mt-2 text-sm text-fg-muted">No reviews yet.</p>
        </>
      )}
    </PageShell>
  );
}
