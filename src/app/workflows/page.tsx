import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/page-shell";
import { SubmitButton } from "@/components/ui/form";
import { RunStatusBadge } from "@/components/research/RunStatus";
import { getCurrentUser } from "@/lib/auth";
import { agentById } from "@/lib/firm/agents";
import { ensurePlatformRuns, listRuns } from "@/lib/firm/server";
import { DAILY_RUN_QUOTA, WORKFLOWS, workflowById } from "@/lib/firm/workflows";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startWorkflow } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent workflows",
  description: "Watch Second Wall Street's research agents hand work to each other, step by step, with budgets, approvals and a full event log.",
  alternates: { canonical: "/workflows" },
};

const ERRORS: Record<string, string> = {
  quota: `You can start ${DAILY_RUN_QUOTA} runs per 24 hours. Try again later.`,
  invalid: "That request wasn't valid. Please try again.",
  "not-yours": "Only the person who started a run can approve or cancel it.",
  failed: "The run couldn't start. Please try again.",
  unavailable: "Workflows are unavailable right now. Please try again shortly.",
};

const when = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  try {
    await ensurePlatformRuns();
  } catch (e) {
    console.error("platform_runs_failed", (e as Error).message);
  }
  const [user, db] = await Promise.all([getCurrentUser(), createSupabaseServerClient()]);
  const runs = await listRuns(db, user?.id ?? null, 20);

  return (
    <PageShell
      eyebrow="Multi-agent research firm"
      title="Watch the agents work together"
      intro={<p>Each workflow is a fixed chain of built-in agents. Every agent only sees the data it is allowed to, every step has a time limit and a cost budget, and risky steps wait for a person to approve them.</p>}
    >
      {error && ERRORS[error] && (
        <p role="alert" className="mb-6 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">{ERRORS[error]}</p>
      )}

      <section aria-labelledby="available" className="grid gap-4 md:grid-cols-2">
        <h2 id="available" className="sr-only">Available workflows</h2>
        {WORKFLOWS.map((w) => (
          <article key={w.id} className="rounded-2xl border border-line bg-ink-900 p-5">
            <h3 className="font-semibold">{w.name}</h3>
            <p className="mt-1 text-sm text-fg-muted">{w.description}</p>
            <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
              {w.steps.map((s, i) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span className={`rounded-full border px-2.5 py-1 ${s.kind === "approval" ? "border-gold/40 text-gold" : "border-line text-fg-muted"}`}>
                    {s.kind === "approval" ? "Your approval" : agentById.get(s.agentId!)?.name}
                  </span>
                  {i < w.steps.length - 1 && <span aria-hidden="true" className="text-fg-subtle">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-fg-subtle">Budget: {w.budgetUnits} units · free to run</p>
            {user ? (
              <form action={startWorkflow} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="workflow" value={w.id} />
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-fg-muted">Candidates to analyse</span>
                  <select name="top" defaultValue="5" className="min-h-11 rounded-xl border border-line bg-ink-850 px-3 text-sm">
                    {[3, 5, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <SubmitButton pending="Agents working…">Run privately</SubmitButton>
              </form>
            ) : (
              <p className="mt-4 text-sm">
                <Link href="/sign-in?next=/workflows" className="text-cyan-soft underline">Sign in</Link> to start your own private run.
              </p>
            )}
          </article>
        ))}
      </section>

      <section aria-labelledby="recent" className="mt-12">
        <h2 id="recent" className="text-lg font-semibold">Recent runs</h2>
        <p className="mt-1 text-sm text-fg-muted">The platform runs each workflow once per trading day, in public. Runs you start are visible only to you.</p>
        {runs.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">No runs yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-ink-900">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/workflows/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm hover:bg-white/5">
                  <span>
                    <span className="font-medium">{workflowById.get(r.workflowId)?.name ?? r.workflowId}</span>
                    <span className="block text-xs text-fg-subtle">
                      Session {r.sessionDate} · {r.mine ? "Your private run" : r.visibility === "public" ? "Platform run (public)" : "Private"} · {when.format(new Date(r.createdAt))}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-fg-subtle tabular-nums">{r.usedUnits}/{r.budgetUnits} units</span>
                    <RunStatusBadge status={r.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
