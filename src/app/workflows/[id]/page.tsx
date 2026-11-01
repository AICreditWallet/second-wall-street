import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, CircleDashed, Hand, Loader2, X } from "lucide-react";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/form";
import { DataNotice } from "@/components/research/DataNotice";
import { RunStatusBadge } from "@/components/research/RunStatus";
import { getCurrentUser } from "@/lib/auth";
import { agentById } from "@/lib/firm/agents";
import type { Task } from "@/lib/firm/engine";
import { getRunDetail } from "@/lib/firm/server";
import { workflowById } from "@/lib/firm/workflows";
import { getProvider } from "@/lib/market/provider";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { approveRun, cancelRun } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workflow run", robots: { index: false } };

const time = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });

type Report = { title: string; sections: { heading: string; bullets: string[] }[]; sources: string[]; disclaimer: string };
const isReport = (o: unknown): o is Report => Boolean(o && typeof o === "object" && "sections" in o && Array.isArray((o as Report).sections));

function StepIcon({ state }: { state: Task["status"] | "pending" | "approval" | "approved" }) {
  const cls = "size-4";
  if (state === "succeeded" || state === "approved") return <Check className={`${cls} text-cyan`} aria-hidden="true" />;
  if (state === "failed") return <X className={`${cls} text-danger`} aria-hidden="true" />;
  if (state === "running") return <Loader2 className={`${cls} animate-spin text-cyan`} aria-hidden="true" />;
  if (state === "approval") return <Hand className={`${cls} text-gold`} aria-hidden="true" />;
  return <CircleDashed className={`${cls} text-fg-subtle`} aria-hidden="true" />;
}

const STATE_TEXT = { succeeded: "Done", failed: "Failed", running: "Running", skipped: "Skipped", pending: "Not started", approval: "Waiting for approval", approved: "Approved" } as const;

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{3,64}$/.test(id)) notFound();
  const [user, db] = await Promise.all([getCurrentUser(), createSupabaseServerClient()]);
  const detail = await getRunDetail(db, id);
  if (!detail) notFound();
  const { run, tasks, messages, events } = detail;
  const def = workflowById.get(run.workflowId);
  if (!def) notFound();
  const owner = Boolean(user && run.startedBy === user.id);
  const report = [...tasks].reverse().find((t) => t.agentId === "agt-lab-report-agent" && t.status === "succeeded")?.output;
  const approval = messages.find((m) => m.kind === "approval");
  const p = getProvider();

  return (
    <PageShell
      eyebrow={run.startedBy ? (owner ? "Your private run" : "Private run") : "Platform run · public"}
      title={def.name}
      intro={<p>Session {run.sessionDate} · {run.usedUnits} of {run.budgetUnits} budget units used</p>}
    >
      <div className="flex flex-wrap items-center gap-3">
        <RunStatusBadge status={run.status} />
        {run.error && <Badge>Stopped: {run.error.replaceAll("_", " ")}</Badge>}
        {approval && <Badge tone="gold">{approval.body.note}</Badge>}
      </div>

      <section aria-labelledby="pipeline" className="mt-8">
        <h2 id="pipeline" className="text-lg font-semibold">Pipeline</h2>
        <ol className="mt-4 space-y-0">
          {def.steps.map((s, i) => {
            const attempts = tasks.filter((t) => t.step === i);
            const last = attempts[attempts.length - 1];
            const agent = s.agentId ? agentById.get(s.agentId) : undefined;
            const state =
              s.kind === "approval"
                ? run.status === "awaiting_approval" && run.nextStep === i
                  ? "approval"
                  : run.nextStep > i
                    ? "approved"
                    : "pending"
                : (last?.status ?? "pending");
            const handoff = messages.find((m) => m.kind === "handoff" && m.toAgent === s.agentId);
            return (
              <li key={s.key} className="relative border-l border-line pb-6 pl-8 last:pb-0">
                <span className="absolute -left-3 top-0 grid size-6 place-items-center rounded-full border border-line bg-ink-900">
                  <StepIcon state={state} />
                </span>
                <div className="rounded-2xl border border-line bg-ink-900 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">{s.kind === "approval" ? "Human approval" : agent?.name ?? s.agentId}</h3>
                    <span className="text-xs text-fg-subtle">
                      {STATE_TEXT[state]}
                      {last?.durationMs != null && ` · ${last.durationMs} ms`}
                      {attempts.length > 1 && ` · ${attempts.length} attempts`}
                      {agent && ` · ${agent.units} units`}
                    </span>
                  </div>
                  {s.kind === "approval" && <p className="mt-1 text-sm text-fg-muted">{s.prompt}</p>}
                  {handoff && <p className="mt-1 text-xs text-fg-subtle">Received: {handoff.body.fields?.join(", ") || "nothing"}</p>}
                  {last?.summary && <p className="mt-2 text-sm text-fg-muted">{last.summary}</p>}
                  {last?.error && <p className="mt-2 text-sm text-danger">Error: {last.error.replaceAll("_", " ")}</p>}
                  {state === "approval" && owner && (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <form action={approveRun}>
                        <input type="hidden" name="run" value={run.id} />
                        <SubmitButton pending="Continuing…">Approve and continue</SubmitButton>
                      </form>
                      <form action={cancelRun}>
                        <input type="hidden" name="run" value={run.id} />
                        <SubmitButton variant="secondary" pending="Cancelling…">Cancel run</SubmitButton>
                      </form>
                    </div>
                  )}
                  {state === "approval" && !owner && <p className="mt-3 text-xs text-fg-subtle">Only the person who started this run can approve it.</p>}
                  {last?.output != null && s.agentId !== "agt-lab-report-agent" && (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-cyan-soft">Show output data</summary>
                      <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-ink-950 p-3 text-fg-muted">{JSON.stringify(last.output, null, 2)}</pre>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {isReport(report) && (
        <section aria-labelledby="report" className="mt-12 rounded-2xl border border-cyan/30 bg-ink-900 p-6">
          <h2 id="report" className="text-lg font-semibold">{report.title}</h2>
          <div className="mt-4"><DataNotice freshness={p.freshness} note={p.licenseNote} /></div>
          {report.sections.map((sec) => (
            <div key={sec.heading} className="mt-5">
              <h3 className="font-medium">{sec.heading}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">{sec.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          ))}
          <p className="mt-5 text-xs text-fg-subtle">Sources: {report.sources.join(" · ")}</p>
          <p className="mt-1 text-xs text-fg-subtle">{report.disclaimer}</p>
        </section>
      )}

      <section aria-labelledby="log" className="mt-12">
        <h2 id="log" className="text-lg font-semibold">Event log</h2>
        <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-ink-900 font-mono text-xs">
          {events.map((e, i) => (
            <li key={i} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
              <time dateTime={e.at} className="text-fg-subtle">{time.format(new Date(e.at))}</time>
              <span className="text-cyan-soft">{e.type}</span>
              <span className="text-fg-muted">{Object.entries(e.detail).map(([k, v]) => `${k}=${String(v)}`).join(" ")}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="mt-8 text-sm"><Link href="/workflows" className="text-cyan-soft underline">← All workflows</Link></p>
    </PageShell>
  );
}
