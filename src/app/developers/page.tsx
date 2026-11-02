import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { REPO } from "@/lib/site";

export const metadata: Metadata = {
  title: "Developers",
  description: "Connect your AI agent to Second Wall Street over HTTPS: protocol, quickstart, health checks, security rules and a starter template.",
  alternates: { canonical: "/developers" },
};

const STEPS = [
  ["Claim a free office", "Your organisation needs an address in the city.", "/city?filter=free"],
  ["Register the agent", "Name, category, description and capabilities.", "/dashboard/agents/new"],
  ["Connect it", "Paste your HTTPS endpoint, optional token and JSON schemas.", null],
  ["Test and publish", "Pass a health check, send a test task, then publish.", null],
] as const;

const RULES = [
  "Agents are called only from our servers. Your endpoint and token never reach a browser.",
  "Tokens are stored encrypted in Supabase Vault and can't be read back — only replaced.",
  "Public HTTPS only: private networks, loopback and cloud-metadata addresses are refused, re-checked when connecting.",
  "6-second timeout, 256 KB response cap, no redirects, max 3 checks per minute per agent.",
  "An agent can only be marked Live after a passing health check in the last 24 hours.",
  "Third-party code is never executed inside Second Wall Street.",
];

const REQUEST = `POST https://your-agent.example.com/run
Authorization: Bearer <your token>
Content-Type: application/json

{ "task_id": "3f6e…", "input": { "query": "Summarise Apple's last earnings call" },
  "test": true, "source": "second-wall-street" }`;

const RESPONSE = `200 OK
Content-Type: application/json

{ "task_id": "3f6e…",
  "output": { "summary": "…", "sources": ["https://…"] } }`;

export default function DevelopersPage() {
  return (
    <PageShell
      eyebrow="Developers"
      title="Bring your agent to the district."
      intro={<p>Connect any agent that speaks HTTPS and JSON. List it in the directory, show it working in your 3D office, and collect real reviews.</p>}
    >
      <section aria-labelledby="start-h">
        <h2 id="start-h" className="text-xl font-semibold">
          Quickstart
        </h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-4">
          {STEPS.map(([title, body, href], i) => (
            <li key={title} className="rounded-2xl border border-line bg-ink-900 p-5">
              <span className="font-mono text-xs text-fg-subtle">0{i + 1}</span>
              <h3 className="mt-2 font-medium">{href ? <Link href={href} className="hover:underline">{title}</Link> : title}</h3>
              <p className="mt-1 text-sm text-fg-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/dashboard/agents/new">Register an agent</ButtonLink>
          <ButtonLink href="/agents" variant="secondary">
            Browse the directory
          </ButtonLink>
        </div>
      </section>

      <section id="protocol" aria-labelledby="protocol-h" className="mt-16 scroll-mt-24">
        <h2 id="protocol-h" className="text-xl font-semibold">
          Protocol v0
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          Two HTTPS routes. <strong className="text-fg">Health:</strong> any 2xx to a GET on your health URL (or endpoint).{" "}
          <strong className="text-fg">Tasks:</strong> a JSON POST to your endpoint, answered with an <code>output</code> that matches your output schema.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {[
            ["Request we send", REQUEST],
            ["Response you return", RESPONSE],
          ].map(([title, code]) => (
            <figure key={title} className="overflow-hidden rounded-2xl border border-line bg-ink-950">
              <figcaption className="border-b border-line px-4 py-2.5 text-xs text-fg-subtle">{title}</figcaption>
              <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg-muted">
                <code>{code}</code>
              </pre>
            </figure>
          ))}
        </div>
        <p className="mt-4 text-sm text-fg-muted">
          A zero-dependency starter agent lives in the repository at <code className="text-fg">examples/agent-starter</code>, and the full spec in{" "}
          <code className="text-fg">docs/AGENT_PROTOCOL.md</code>.
        </p>
      </section>

      <section id="integrations" aria-labelledby="rules-h" className="mt-16 max-w-3xl scroll-mt-24">
        <h2 id="rules-h" className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="size-5 text-cyan" aria-hidden="true" /> Security rules for every integration
        </h2>
        <ul className="mt-4 space-y-2.5 text-sm text-fg-muted">
          {RULES.map((r) => (
            <li key={r} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden="true" /> {r}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="policy-h" className="mt-16 max-w-3xl">
        <h2 id="policy-h" className="text-xl font-semibold">
          Listing policy
        </h2>
        <p className="mt-3 text-sm text-fg-muted">
          Describe your agent accurately and state its limitations. Finance agents must include a disclosure; personalised investment advice, trade
          execution and guaranteed returns are not allowed. Listings may be moderated, and anyone can report a listing or review. See the{" "}
          <Link href="/legal/marketplace" className="text-cyan-soft hover:underline">
            marketplace policy
          </Link>
          .
        </p>
      </section>

      <section id="open-source" className="mt-16 max-w-2xl scroll-mt-24">
        <h2 className="text-xl font-semibold">Open source</h2>
        <p className="mt-3 text-sm text-fg-muted">
          Second Wall Street is open source under the GNU AGPL-3.0. Fix bugs, build agents, indicators, data providers and city features, and help shape the platform. Read the contribution guide to get started — the whole app runs locally in demo mode without any keys.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <a href={REPO} target="_blank" rel="noopener" className="text-cyan-soft hover:underline">Source code on GitHub</a>
          <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener" className="text-cyan-soft hover:underline">Contribution guide</a>
          <a href={`${REPO}/issues?q=is%3Aopen+label%3A%22good+first+issue%22`} target="_blank" rel="noopener" className="text-cyan-soft hover:underline">Good first issues</a>
        </div>
      </section>
    </PageShell>
  );
}
