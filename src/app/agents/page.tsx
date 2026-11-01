import type { Metadata } from "next";
import Link from "next/link";
import { Bot } from "lucide-react";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";

// Re-render at most once a minute (and immediately after claims via revalidatePath).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "AI Agents",
  description: "Browse AI agents in Second Wall Street: research, analysis, education and developer tools.",
  alternates: { canonical: "/agents" },
};

export default async function AgentsPage() {
  const snapshot = await getCitySnapshot();
  const orgs = new Map(snapshot.organizations.map((o) => [o.id, o]));
  return (
    <PageShell
      eyebrow="AI agents"
      title="The agent directory"
      intro={<p>The first agents are operated by the platform and still in development. Community agents will be listed here as developers publish them.</p>}
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.agents.map((a) => {
          const org = orgs.get(a.organizationId);
          return (
            <li key={a.id} className="flex flex-col rounded-2xl border border-line bg-ink-900 p-5">
              <div className="flex items-center justify-between">
                <Bot className="size-5 text-cyan" aria-hidden="true" />
                <Badge>{a.status === "in-development" ? "In development" : a.status === "preview" ? "Preview" : "Live"}</Badge>
              </div>
              <h2 className="mt-4 font-medium">
                <Link href={`/agents/${a.slug}`} className="hover:underline">
                  {a.name}
                </Link>
              </h2>
              {org && (
                <Link href={`/orgs/${org.slug}`} className="text-xs text-fg-subtle hover:text-fg">
                  {org.name}
                </Link>
              )}
              <p className="mt-2 flex-1 text-sm text-fg-muted">{a.summary}</p>
              <p className="mt-3 text-xs text-fg-subtle">{a.category}</p>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
