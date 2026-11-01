import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { latestCompletedSession, type ISODate } from "@/lib/market/calendar";
import { getProvider } from "@/lib/market/provider";
import { runBacktests, type BacktestReport } from "@/lib/research/backtest";
import { runOpen15, type Open15Report } from "@/lib/research/open15";
import type { CityActivity } from "@/lib/city/types";
import { createSupabaseAdminClient, createSupabasePublicClient } from "@/lib/supabase/server";
import { makeContext } from "./agents";
import { advance, approve, MemoryStore, startRun, type FirmStore, type Message, type Run, type RunEvent, type Task } from "./engine";
import { WORKFLOWS, workflowById } from "./workflows";

/**
 * Server side of Phases 4–5. Nothing here runs on a schedule: the first visit
 * after a session's 9:30–9:45 window computes that session's research and the
 * platform workflow runs once, and stores them (unique constraints make it
 * idempotent). No paid data or AI APIs are involved.
 *
 * Writes use the service role and only ever contain engine output; reads go
 * through RLS with the public or signed-in client.
 */

/** Platform runs pass their approval gate under a stated policy, recorded in the run. */
export const PLATFORM_APPROVER = "platform policy (automatic for the daily public run)";
const DUPLICATE = "23505";

// ---------------------------------------------------------------- demo mode (no database)
const demo = { open15: new Map<string, Open15Report>(), backtests: new Map<string, BacktestReport>(), store: new MemoryStore() };

// ---------------------------------------------------------------- research
export async function getOpen15(session: ISODate = latestCompletedSession(new Date())): Promise<{ report: Open15Report; id: string | null }> {
  const p = getProvider();
  const read = createSupabasePublicClient();
  const admin = createSupabaseAdminClient();
  if (!read || !admin) {
    const report = demo.open15.get(session) ?? runOpen15(p, session);
    demo.open15.set(session, report);
    return { report, id: null };
  }
  const found = await read.from("research_runs").select("id, report").eq("kind", "open15").eq("session_date", session).eq("provider", p.id).maybeSingle();
  if (found.data) return { report: found.data.report as Open15Report, id: found.data.id as string };

  const report = runOpen15(p, session);
  const ins = await admin
    .from("research_runs")
    .insert({ kind: "open15", session_date: session, provider: p.id, data_freshness: p.freshness, report })
    .select("id")
    .single();
  if (ins.error) {
    if (ins.error.code !== DUPLICATE) throw new Error(`research_store_failed: ${ins.error.message}`);
    const again = await read.from("research_runs").select("id, report").eq("kind", "open15").eq("session_date", session).eq("provider", p.id).single();
    return { report: again.data!.report as Open15Report, id: again.data!.id as string };
  }
  const signals = report.candidates.map((c) => ({ run_id: ins.data.id, rank: c.rank, symbol: c.symbol, score: c.score, direction: c.direction, evidence: c.evidence }));
  if (signals.length) await admin.from("research_signals").insert(signals);
  return { report, id: ins.data.id as string };
}

export interface HistoryItem {
  sessionDate: ISODate;
  top: { symbol: string; direction: string; score: number }[];
}

export async function getOpen15History(limit = 10): Promise<HistoryItem[]> {
  const read = createSupabasePublicClient();
  if (!read) return [];
  const runs = await read.from("research_runs").select("id, session_date").eq("kind", "open15").order("session_date", { ascending: false }).limit(limit);
  if (runs.error || !runs.data.length) return [];
  const sig = await read.from("research_signals").select("run_id, rank, symbol, direction, score").in("run_id", runs.data.map((r) => r.id)).lte("rank", 3).order("rank");
  return runs.data.map((r) => ({
    sessionDate: r.session_date as string,
    top: (sig.data ?? []).filter((s) => s.run_id === r.id).map((s) => ({ symbol: s.symbol as string, direction: s.direction as string, score: Number(s.score) })),
  }));
}

export async function getBacktest(endDate: ISODate = latestCompletedSession(new Date())): Promise<BacktestReport> {
  const p = getProvider();
  const read = createSupabasePublicClient();
  const admin = createSupabaseAdminClient();
  if (!read || !admin) {
    const report = demo.backtests.get(endDate) ?? runBacktests(p, endDate);
    demo.backtests.set(endDate, report);
    return report;
  }
  const found = await read.from("backtest_runs").select("report").eq("end_date", endDate).eq("provider", p.id).maybeSingle();
  if (found.data) return found.data.report as BacktestReport;
  const report = runBacktests(p, endDate);
  const ins = await admin.from("backtest_runs").insert({ end_date: endDate, provider: p.id, config: report.config, report });
  if (ins.error && ins.error.code !== DUPLICATE) throw new Error(`backtest_store_failed: ${ins.error.message}`);
  return report;
}

// ---------------------------------------------------------------- database store
type Row = Record<string, unknown>;

const runToRow = (r: Partial<Run>): Row => {
  const m: Record<string, string> = { workflowId: "workflow_id", status: "status", sessionDate: "session_date", visibility: "visibility", startedBy: "started_by", budgetUnits: "budget_units", usedUnits: "used_units", nextStep: "next_step", workspace: "workspace", error: "error", createdAt: "created_at", finishedAt: "finished_at" };
  return Object.fromEntries(Object.entries(r).filter(([k]) => k in m).map(([k, v]) => [m[k]!, v]));
};
const rowToRun = (r: Row): Run => ({
  id: r.id as string,
  workflowId: r.workflow_id as string,
  status: r.status as Run["status"],
  sessionDate: r.session_date as string,
  visibility: r.visibility as Run["visibility"],
  startedBy: (r.started_by as string | null) ?? null,
  budgetUnits: r.budget_units as number,
  usedUnits: r.used_units as number,
  nextStep: r.next_step as number,
  workspace: (r.workspace as Run["workspace"]) ?? {},
  error: (r.error as string | null) ?? null,
  createdAt: r.created_at as string,
  finishedAt: (r.finished_at as string | null) ?? null,
});
const taskToRow = (t: Partial<Task>): Row => {
  const m: Record<string, string> = { runId: "run_id", step: "step", stepKey: "step_key", agentId: "agent_id", status: "status", attempt: "attempt", summary: "summary", output: "output", error: "error", startedAt: "started_at", finishedAt: "finished_at", durationMs: "duration_ms", units: "units" };
  return Object.fromEntries(Object.entries(t).filter(([k]) => k in m).map(([k, v]) => [m[k]!, v]));
};
const rowToTask = (r: Row): Task => ({
  id: r.id as string,
  runId: r.run_id as string,
  step: r.step as number,
  stepKey: r.step_key as string,
  agentId: (r.agent_id as string | null) ?? null,
  status: r.status as Task["status"],
  attempt: r.attempt as number,
  summary: (r.summary as string | null) ?? null,
  output: r.output,
  error: (r.error as string | null) ?? null,
  startedAt: r.started_at as string,
  finishedAt: (r.finished_at as string | null) ?? null,
  durationMs: (r.duration_ms as number | null) ?? null,
  units: r.units as number,
});
const msgToRow = (m: Message): Row => ({ run_id: m.runId, from_agent: m.fromAgent, to_agent: m.toAgent, kind: m.kind, body: m.body, created_at: m.createdAt });
const eventToRow = (e: RunEvent): Row => ({ run_id: e.runId, type: e.type, detail: e.detail, at: e.at });

function must<T extends { error: { message: string } | null }>(res: T, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res;
}

/** Live store for user-started runs (which can pause for approval). Service role; server only. */
export class DbStore implements FirmStore {
  constructor(private db: SupabaseClient) {}
  async createRun(r: Omit<Run, "id" | "createdAt">) {
    const res = must(await this.db.from("workflow_runs").insert(runToRow(r)).select("*").single(), "create_run");
    return rowToRun(res.data as Row);
  }
  async updateRun(id: string, patch: Partial<Run>) {
    must(await this.db.from("workflow_runs").update(runToRow(patch)).eq("id", id), "update_run");
  }
  async getRun(id: string) {
    const res = await this.db.from("workflow_runs").select("*").eq("id", id).maybeSingle();
    return res.data ? rowToRun(res.data as Row) : null;
  }
  async transitionRun(id: string, from: Run["status"][], patch: Partial<Run>) {
    const res = must(await this.db.from("workflow_runs").update(runToRow(patch)).eq("id", id).in("status", from).select("id"), "transition_run");
    return (res.data?.length ?? 0) > 0;
  }
  async addTask(t: Omit<Task, "id">) {
    const res = must(await this.db.from("agent_tasks").insert(taskToRow(t)).select("id").single(), "add_task");
    return (res.data as Row).id as string;
  }
  async updateTask(id: string, patch: Partial<Task>) {
    must(await this.db.from("agent_tasks").update(taskToRow(patch)).eq("id", id), "update_task");
  }
  async addMessage(m: Message) {
    must(await this.db.from("agent_messages").insert(msgToRow(m)), "add_message");
  }
  async addEvent(e: RunEvent) {
    must(await this.db.from("workflow_events").insert(eventToRow(e)), "add_event");
  }
}

// ---------------------------------------------------------------- platform daily runs
async function runToCompletion(store: FirmStore, workflowId: string, session: ISODate) {
  const def = workflowById.get(workflowId)!;
  const ctx = makeContext(getProvider(), session);
  let run = await startRun(store, def, { sessionDate: session, visibility: "public", startedBy: null, input: { top: 5 } });
  run = await advance(store, def, run.id, ctx);
  if (run.status === "awaiting_approval") run = await approve(store, def, run.id, PLATFORM_APPROVER, ctx);
  return run;
}

/** Runs each platform workflow once per session and stores the result (run, tasks, messages, events). */
export async function ensurePlatformRuns(session: ISODate = latestCompletedSession(new Date())): Promise<void> {
  const read = createSupabasePublicClient();
  const admin = createSupabaseAdminClient();
  if (!read || !admin) {
    for (const w of WORKFLOWS) {
      const exists = [...demo.store.runs.values()].some((r) => r.workflowId === w.id && r.sessionDate === session && !r.startedBy);
      if (!exists) await runToCompletion(demo.store, w.id, session);
    }
    return;
  }
  const existing = await read.from("workflow_runs").select("workflow_id").eq("session_date", session).is("started_by", null);
  if (existing.error) throw new Error(`runs_unavailable: ${existing.error.message}`);
  const have = new Set(existing.data.map((r) => r.workflow_id as string));
  for (const w of WORKFLOWS.filter((w) => !have.has(w.id))) {
    // Execute in memory first, then persist the finished run in one go, so a
    // concurrent visitor can't leave a half-written run behind.
    const mem = new MemoryStore();
    const run = await runToCompletion(mem, w.id, session);
    const { id: _id, ...rest } = run;
    void _id;
    const ins = await admin.from("workflow_runs").insert(runToRow(rest)).select("id").single();
    if (ins.error) {
      if (ins.error.code === DUPLICATE) continue;
      throw new Error(`run_store_failed: ${ins.error.message}`);
    }
    const runId = ins.data.id as string;
    const tasks = mem.tasks.map(({ id: _t, ...t }) => (void _t, taskToRow({ ...t, runId })));
    if (tasks.length) must(await admin.from("agent_tasks").insert(tasks), "store_tasks");
    if (mem.messages.length) must(await admin.from("agent_messages").insert(mem.messages.map((m) => msgToRow({ ...m, runId }))), "store_messages");
    if (mem.events.length) must(await admin.from("workflow_events").insert(mem.events.map((e) => eventToRow({ ...e, runId }))), "store_events");
  }
}

// ---------------------------------------------------------------- reads
export interface RunDetail {
  run: Run;
  tasks: Task[];
  messages: Message[];
  events: RunEvent[];
}

/** Reads a run through the given client so RLS decides visibility (private runs: owner only). */
export async function getRunDetail(db: SupabaseClient | null, id: string): Promise<RunDetail | null> {
  if (!db) {
    const run = await demo.store.getRun(id);
    if (!run) return null;
    return { run, tasks: demo.store.tasks.filter((t) => t.runId === id), messages: demo.store.messages.filter((m) => m.runId === id), events: demo.store.events.filter((e) => e.runId === id) };
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const run = await db.from("workflow_runs").select("*").eq("id", id).maybeSingle();
  if (!run.data) return null;
  const [tasks, messages, events] = await Promise.all([
    db.from("agent_tasks").select("*").eq("run_id", id).order("step").order("attempt"),
    db.from("agent_messages").select("*").eq("run_id", id).order("id"),
    db.from("workflow_events").select("*").eq("run_id", id).order("id"),
  ]);
  return {
    run: rowToRun(run.data as Row),
    tasks: (tasks.data ?? []).map((t) => rowToTask(t as Row)),
    messages: (messages.data ?? []).map((m) => ({ runId: id, fromAgent: m.from_agent, toAgent: m.to_agent, kind: m.kind, body: m.body, createdAt: m.created_at })),
    events: (events.data ?? []).map((e) => ({ runId: id, type: e.type, detail: e.detail, at: e.at })),
  };
}

export interface RunSummary {
  id: string;
  workflowId: string;
  status: Run["status"];
  sessionDate: string;
  visibility: Run["visibility"];
  mine: boolean;
  createdAt: string;
  usedUnits: number;
  budgetUnits: number;
}

export async function listRuns(db: SupabaseClient | null, userId: string | null, limit = 20): Promise<RunSummary[]> {
  const map = (r: Run): RunSummary => ({ id: r.id, workflowId: r.workflowId, status: r.status, sessionDate: r.sessionDate, visibility: r.visibility, mine: Boolean(userId && r.startedBy === userId), createdAt: r.createdAt, usedUnits: r.usedUnits, budgetUnits: r.budgetUnits });
  if (!db) return [...demo.store.runs.values()].reverse().slice(0, limit).map(map);
  const res = await db.from("workflow_runs").select("*").order("created_at", { ascending: false }).limit(limit);
  return (res.data ?? []).map((r) => map(rowToRun(r as Row)));
}

// ---------------------------------------------------------------- map activity

/**
 * What platform agents did in the latest session, for the 3D map. Makes sure
 * the day's runs exist first; returns null rather than failing the city.
 */
export async function getCityActivity(): Promise<CityActivity | null> {
  const session = latestCompletedSession(new Date());
  try {
    await ensurePlatformRuns(session);
  } catch (e) {
    console.error("platform_runs_failed", (e as Error).message);
  }
  const orgOf = new Map(WORKFLOWS.map((w) => [w.id, w.organizationSlug]));
  const out: CityActivity = { sessionDate: session, runs: {}, tasks: {} };
  const read = createSupabasePublicClient();
  let runs: Run[] = [];
  let tasks: Task[] = [];
  if (!read) {
    runs = [...demo.store.runs.values()].filter((r) => r.visibility === "public");
    tasks = demo.store.tasks.filter((t) => runs.some((r) => r.id === t.runId));
  } else {
    const r = await read.from("workflow_runs").select("*").eq("visibility", "public").order("created_at", { ascending: false }).limit(10);
    if (r.error) return null;
    runs = r.data.map((x) => rowToRun(x as Row));
    if (runs.length) {
      const t = await read.from("agent_tasks").select("*").in("run_id", runs.map((x) => x.id)).order("started_at", { ascending: false }).limit(200);
      tasks = (t.data ?? []).map((x) => rowToTask(x as Row));
    }
  }
  const newestFirst = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const r of newestFirst) {
    const org = orgOf.get(r.workflowId);
    if (org && !out.runs[org]) out.runs[org] = { runId: r.id, workflowId: r.workflowId, status: r.status, finishedAt: r.finishedAt };
  }
  for (const t of [...tasks].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    if (t.agentId && !out.tasks[t.agentId]) out.tasks[t.agentId] = { runId: t.runId, status: t.status, summary: t.summary, at: t.finishedAt ?? t.startedAt };
  }
  return out;
}
