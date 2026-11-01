import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Info } from "lucide-react";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { floorDirectory } from "@/lib/city/interiors";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export const revalidate = 60;

const STATUS = { "in-development": "In development", preview: "Preview", live: "Live" } as const;
const NOTE = {
  "in-development": "This agent is not running yet.",
  preview: "Preview listing — the agent is not processing requests yet.",
  live: "This agent is available.",
} as const;

export async function generateStaticParams() {
  return (await getCitySnapshot()).agents.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = (await getCitySnapshot()).agents.find((x) => x.slug === slug);
  if (!a) return {};
  return { title: a.name, description: a.summary, alternates: { canonical: `/agents/${a.slug}` } };
}

export default async function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  const snapshot = await getCitySnapshot();
  const agent = snapshot.agents.find((a) => a.slug === slug);
  if (!agent) notFound();
  const org = snapshot.organizations.find((o) => o.id === agent.organizationId);
  const hq = floorDirectory(snapshot.offices.filter((o) => o.organizationId === agent.organizationId))[0];

  return (
    <PageShell eyebrow="AI agent" title={agent.name} intro={<p>{agent.summary}</p>}>
      <div className="flex flex-wrap gap-2">
        <Badge tone={agent.status === "live" ? "cyan" : "gold"}>{STATUS[agent.status]}</Badge>
        <Badge>{agent.category}</Badge>
      </div>
      <p className="mt-6 flex max-w-xl gap-2 rounded-2xl border border-line bg-ink-900 px-4 py-3 text-sm text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {NOTE[agent.status]}
      </p>
      {agent.capabilities.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Capabilities</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {agent.capabilities.map((c) => (
              <li key={c}>
                <Badge tone="cyan">{c}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Developer</h2>
        {org && (
          <Link href={`/orgs/${org.slug}`} className="mt-2 inline-flex items-center gap-2 text-cyan-soft hover:underline">
            <Bot className="size-4" aria-hidden="true" /> {org.name}
          </Link>
        )}
      </section>
      {agent.disclosure && <p className="mt-10 max-w-2xl border-t border-line pt-4 text-xs text-fg-subtle">{agent.disclosure}</p>}
      {hq && (
        <div className="mt-8">
          <ButtonLink href={`/city?b=${hq.buildingId}&office=${hq.id}`}>See its workstation in 3D</ButtonLink>
        </div>
      )}
    </PageShell>
  );
}
