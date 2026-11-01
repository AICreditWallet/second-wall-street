import type { Metadata } from "next";
import Link from "next/link";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { AGENT_CATEGORIES } from "@/lib/agents/catalog";
import { PageShell } from "@/components/site/page-shell";
import { AgentDirectory, type DirectoryAgent } from "@/components/marketplace/AgentDirectory";

// Re-render at most once a minute (and immediately after changes via revalidatePath).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "AI Agents",
  description: "Browse AI agents in Second Wall Street: research, analysis, education and developer tools — with ratings and live health status.",
  alternates: { canonical: "/agents" },
};

export default async function AgentsPage() {
  const snapshot = await getCitySnapshot();
  const orgs = new Map(snapshot.organizations.map((o) => [o.id, o]));
  const agents: DirectoryAgent[] = snapshot.agents.flatMap((a) => {
    const org = orgs.get(a.organizationId);
    if (!org) return [];
    return [
      {
        id: a.id,
        slug: a.slug,
        name: a.name,
        summary: a.summary,
        category: a.category,
        status: a.status,
        orgName: org.name,
        orgSlug: org.slug,
        community: org.operator === "community",
        rating: snapshot.ratings?.[a.id],
        health: snapshot.health?.[a.id],
      },
    ];
  });

  return (
    <PageShell
      eyebrow="AI agents"
      title="The agent directory"
      intro={
        <p>
          Agents built by organisations in the district. Health checks and reviews are real; statuses say honestly whether an agent is live.{" "}
          <Link href="/developers" className="text-cyan-soft hover:underline">
            List your own agent →
          </Link>
        </p>
      }
    >
      <AgentDirectory agents={agents} categories={[...AGENT_CATEGORIES]} />
    </PageShell>
  );
}
