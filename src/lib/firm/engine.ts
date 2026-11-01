import { agentById, type AgentContext, type Workspace } from "./agents";

/**
 * A small, safe workflow engine. Each run is a fixed list of steps; agents can
 * only receive the workspace fields they declare (`accepts`), cannot start
 * other runs, and every step is bounded by a timeout, a retry limit and the
 * run's budget. Approval steps pause the run until a person approves it.
 */

export type RunStatus = "running" | "awaiting_approval" | "succeeded" | "failed" | "cancelled";
export type TaskStatus = "running" | "succeeded" | "failed" | "skipped";

export interface Step {
  key: string;
  kind: "agent" | "approval";
  agentId?: string;
  /** Human-readable reason shown on approval steps. */
  prompt?: string;
  timeoutMs?: number;
  retries?: number;
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  organizationSlug: string;
  steps: Step[];
  budgetUnits: number;
}

export interface Run {
  id: string;
  workflowId: string;
  status: RunStatus;
  sessionDate: string;
  visibility: "public" | "private";
  startedBy: string | null;
  budgetUnits: number;
  usedUnits: number;
  nextStep: number;
  workspace: Workspace;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface Task {
  id: string;
  runId: string;
  step: number;
  stepKey: string;
  agentId: string | null;
  status: TaskStatus;
  attempt: number;
  summary: string | null;
  output: unknown;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  units: number;
}

export interface Message {
  runId: string;
  fromAgent: string | null;
  toAgent: string | null;
  kind: "handoff" | "approval_request" | "approval";
  body: { fields?: string[]; note: string };
  createdAt: string;
}

export interface RunEvent {
  runId: string;
  type: string;
  detail: Record<string, unknown>;
  at: string;
}

export interface FirmStore {
  createRun(r: Omit<Run, "id" | "createdAt">): Promise<Run>;
  updateRun(id: string, patch: Partial<Run>): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  /** Atomically applies `patch` only if the run is still in status `from`; false if someone got there first. */
  transitionRun(id: string, from: RunStatus[], patch: Partial<Run>): Promise<boolean>;
  addTask(t: Omit<Task, "id">): Promise<string>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  addMessage(m: Message): Promise<void>;
  addEvent(e: RunEvent): Promise<void>;
}

export const MAX_STEPS = 12;

const now = () => new Date().toISOString();

function pick(ws: Workspace, keys: string[]): Workspace {
  return Object.fromEntries(keys.filter((k) => k in ws).map((k) => [k, ws[k]]));
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, rej) => (timer = setTimeout(() => rej(new Error("timeout")), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function startRun(
  store: FirmStore,
  def: WorkflowDef,
  opts: { sessionDate: string; visibility: "public" | "private"; startedBy: string | null; input: Workspace },
): Promise<Run> {
  if (def.steps.length > MAX_STEPS) throw new Error("workflow_too_long");
  const run = await store.createRun({
    workflowId: def.id,
    status: "running",
    sessionDate: opts.sessionDate,
    visibility: opts.visibility,
    startedBy: opts.startedBy,
    budgetUnits: def.budgetUnits,
    usedUnits: 0,
    nextStep: 0,
    workspace: { ...opts.input, sessionDate: opts.sessionDate },
    error: null,
    finishedAt: null,
  });
  await store.addEvent({ runId: run.id, type: "run.started", detail: { workflow: def.id, by: opts.startedBy ? "user" : "platform" }, at: now() });
  return run;
}

/** Executes steps from `run.nextStep` until the run finishes or reaches an approval gate. */
export async function advance(store: FirmStore, def: WorkflowDef, runId: string, ctx: AgentContext): Promise<Run> {
  const run = await store.getRun(runId);
  if (!run) throw new Error("run_not_found");
  if (run.status !== "running") return run;
  let { usedUnits, workspace } = run;
  let prevAgent: string | null = null;

  for (let i = run.nextStep; i < def.steps.length; i++) {
    const step = def.steps[i]!;
    if (step.kind === "approval") {
      await store.addMessage({ runId, fromAgent: prevAgent, toAgent: null, kind: "approval_request", body: { note: step.prompt ?? "Approval required to continue." }, createdAt: now() });
      await store.addEvent({ runId, type: "run.awaiting_approval", detail: { step: step.key }, at: now() });
      await store.updateRun(runId, { status: "awaiting_approval", nextStep: i, usedUnits, workspace });
      return { ...run, status: "awaiting_approval", nextStep: i, usedUnits, workspace };
    }

    const agent = step.agentId ? agentById.get(step.agentId) : undefined;
    if (!agent) return fail(store, run, i, usedUnits, workspace, "unknown_agent");
    if (usedUnits + agent.units > run.budgetUnits) return fail(store, run, i, usedUnits, workspace, "budget_exceeded");

    const input = pick(workspace, agent.accepts);
    if (prevAgent) {
      await store.addMessage({ runId, fromAgent: prevAgent, toAgent: agent.id, kind: "handoff", body: { fields: Object.keys(input), note: `Handed ${Object.keys(input).join(", ") || "nothing"} to ${agent.name}` }, createdAt: now() });
    }

    const retries = Math.min(step.retries ?? 1, 2);
    let done = false;
    for (let attempt = 1; attempt <= retries + 1 && !done; attempt++) {
      const started = Date.now();
      const taskId = await store.addTask({ runId, step: i, stepKey: step.key, agentId: agent.id, status: "running", attempt, summary: null, output: null, error: null, startedAt: new Date(started).toISOString(), finishedAt: null, durationMs: null, units: agent.units });
      try {
        const res = await withTimeout(agent.run(input, ctx), step.timeoutMs ?? 8000);
        const finished = Date.now();
        await store.updateTask(taskId, { status: "succeeded", summary: res.summary, output: res.output, finishedAt: new Date(finished).toISOString(), durationMs: finished - started });
        workspace = { ...workspace, [agent.produces]: res.output, ...(agent.produces === "candidates" ? (res.output as Workspace) : {}) };
        usedUnits += agent.units;
        await store.addEvent({ runId, type: "task.succeeded", detail: { step: step.key, agent: agent.id, attempt }, at: now() });
        done = true;
      } catch (e) {
        const msg = (e as Error).message === "timeout" ? "timed_out" : "agent_error";
        const finished = Date.now();
        await store.updateTask(taskId, { status: "failed", error: msg, finishedAt: new Date(finished).toISOString(), durationMs: finished - started });
        await store.addEvent({ runId, type: "task.failed", detail: { step: step.key, agent: agent.id, attempt, error: msg }, at: now() });
      }
    }
    if (!done) return fail(store, run, i, usedUnits, workspace, "step_failed");
    prevAgent = agent.id;
    await store.updateRun(runId, { nextStep: i + 1, usedUnits, workspace });
  }

  const finishedAt = now();
  await store.updateRun(runId, { status: "succeeded", nextStep: def.steps.length, usedUnits, workspace, finishedAt });
  await store.addEvent({ runId, type: "run.succeeded", detail: { usedUnits }, at: finishedAt });
  return { ...run, status: "succeeded", usedUnits, workspace, finishedAt, nextStep: def.steps.length };
}

async function fail(store: FirmStore, run: Run, step: number, usedUnits: number, workspace: Workspace, error: string): Promise<Run> {
  const finishedAt = now();
  await store.updateRun(run.id, { status: "failed", nextStep: step, usedUnits, workspace, error, finishedAt });
  await store.addEvent({ runId: run.id, type: "run.failed", detail: { step, error }, at: finishedAt });
  return { ...run, status: "failed", error, usedUnits, workspace, finishedAt };
}

/** A person approves a paused run; the engine then continues. */
export async function approve(store: FirmStore, def: WorkflowDef, runId: string, approver: string, ctx: AgentContext): Promise<Run> {
  const run = await store.getRun(runId);
  if (!run) throw new Error("run_not_found");
  if (run.status !== "awaiting_approval") throw new Error("not_awaiting_approval");
  // Claim the gate first so a double click can't run the remaining steps twice.
  if (!(await store.transitionRun(runId, ["awaiting_approval"], { status: "running", nextStep: run.nextStep + 1 }))) throw new Error("not_awaiting_approval");
  await store.addMessage({ runId, fromAgent: null, toAgent: null, kind: "approval", body: { note: `Approved by ${approver}` }, createdAt: now() });
  await store.addEvent({ runId, type: "run.approved", detail: { step: def.steps[run.nextStep]?.key, approver }, at: now() });
  return advance(store, def, runId, ctx);
}

export async function cancel(store: FirmStore, runId: string, by: string): Promise<void> {
  if (!(await store.transitionRun(runId, ["awaiting_approval", "running"], { status: "cancelled", finishedAt: now() }))) throw new Error("cannot_cancel");
  await store.addEvent({ runId, type: "run.cancelled", detail: { by }, at: now() });
}

/** In-memory store: tests and local demo mode (no database). */
export class MemoryStore implements FirmStore {
  runs = new Map<string, Run>();
  tasks: Task[] = [];
  messages: Message[] = [];
  events: RunEvent[] = [];
  private n = 0;
  async createRun(r: Omit<Run, "id" | "createdAt">) {
    const run = { ...r, id: `mem-${++this.n}-${Math.random().toString(36).slice(2, 8)}`, createdAt: now() };
    this.runs.set(run.id, run);
    return run;
  }
  async updateRun(id: string, patch: Partial<Run>) {
    const r = this.runs.get(id);
    if (r) this.runs.set(id, { ...r, ...patch });
  }
  async getRun(id: string) {
    return this.runs.get(id) ?? null;
  }
  async transitionRun(id: string, from: RunStatus[], patch: Partial<Run>) {
    const r = this.runs.get(id);
    if (!r || !from.includes(r.status)) return false;
    this.runs.set(id, { ...r, ...patch });
    return true;
  }
  async addTask(t: Omit<Task, "id">) {
    const id = `task-${++this.n}`;
    this.tasks.push({ ...t, id });
    return id;
  }
  async updateTask(id: string, patch: Partial<Task>) {
    const i = this.tasks.findIndex((t) => t.id === id);
    if (i >= 0) this.tasks[i] = { ...this.tasks[i]!, ...patch };
  }
  async addMessage(m: Message) {
    this.messages.push(m);
  }
  async addEvent(e: RunEvent) {
    this.events.push(e);
  }
}
