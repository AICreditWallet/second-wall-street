import { describe, expect, it } from "vitest";
import { simulatedProvider as P } from "@/lib/market/provider";
import { AGENTS, makeContext } from "./agents";
import { advance, approve, cancel, MemoryStore, startRun, type WorkflowDef } from "./engine";
import { workflowById } from "./workflows";

const DATE = "2026-10-30";
const ctx = () => makeContext(P, DATE, new Date("2026-10-30T14:00:00Z"));

async function run(def: WorkflowDef, store = new MemoryStore()) {
  const r = await startRun(store, def, { sessionDate: DATE, visibility: "public", startedBy: null, input: { top: 4 } });
  return { store, run: await advance(store, def, r.id, ctx()) };
}

describe("workflow engine", () => {
  it("runs the Open15 session workflow end to end", async () => {
    const { store, run: r } = await run(workflowById.get("open15-session")!);
    expect(r.status).toBe("succeeded");
    expect(store.tasks.map((t) => [t.agentId, t.status])).toEqual([
      ["agt-open15-scanner", "succeeded"],
      ["agt-open15-orb", "succeeded"],
      ["agt-lab-report-agent", "succeeded"],
    ]);
    const report = r.workspace.report as { title: string; sections: { heading: string }[]; disclaimer: string };
    expect(report.title).toContain(DATE);
    expect(report.sections.map((s) => s.heading)).toContain("Opening ranges");
    expect(report.disclaimer).toMatch(/Not investment advice/);
    expect(store.messages.filter((m) => m.kind === "handoff")).toHaveLength(2);
  });

  it("pauses the research firm for human approval, then finishes", async () => {
    const def = workflowById.get("research-firm")!;
    const { store, run: paused } = await run(def);
    expect(paused.status).toBe("awaiting_approval");
    expect(store.tasks.map((t) => t.agentId)).not.toContain("agt-lab-portfolio-research");
    const done = await approve(store, def, paused.id, "tester", ctx());
    expect(done.status).toBe("succeeded");
    expect(store.events.map((e) => e.type)).toEqual(expect.arrayContaining(["run.awaiting_approval", "run.approved", "run.succeeded"]));
    const risk = done.workspace.risk as { hypothetical: boolean; positions: unknown[] };
    expect(risk.hypothetical).toBe(true);
    expect(risk.positions).toHaveLength(4);
  });

  it("only hands agents the fields they are allowed to see", async () => {
    const { store } = await run(workflowById.get("research-firm")!);
    const toRisk = store.messages.find((m) => m.toAgent === "agt-lab-risk-analyst")!;
    expect(toRisk.body.fields?.every((f) => ["symbols", "technical", "research"].includes(f))).toBe(true);
    const toResearch = store.messages.find((m) => m.toAgent === "agt-lab-research-analyst")!;
    expect(toResearch.body.fields).toEqual(["symbols"]);
  });

  it("stops when the budget runs out", async () => {
    const def = { ...workflowById.get("research-firm")!, budgetUnits: 18 };
    const { run: r } = await run(def);
    expect(r.status).toBe("failed");
    expect(r.error).toBe("budget_exceeded");
  });

  it("retries a failing step, then fails the run with an event log", async () => {
    const flaky = { id: "agt-test-broken", name: "Broken", units: 1, accepts: [], produces: "x", run: async () => Promise.reject(new Error("boom")) };
    AGENTS.push(flaky);
    const { agentById } = await import("./agents");
    agentById.set(flaky.id, flaky);
    const def: WorkflowDef = { id: "t", name: "t", description: "", organizationSlug: "x", budgetUnits: 10, steps: [{ key: "b", kind: "agent", agentId: flaky.id, retries: 1 }] };
    const { store, run: r } = await run(def);
    expect(r.status).toBe("failed");
    expect(store.tasks.map((t) => t.attempt)).toEqual([1, 2]);
    expect(store.events.filter((e) => e.type === "task.failed")).toHaveLength(2);
    AGENTS.pop();
    agentById.delete(flaky.id);
  });

  it("times out slow agents", async () => {
    const slow = { id: "agt-test-slow", name: "Slow", units: 1, accepts: [], produces: "x", run: () => new Promise<never>(() => {}) };
    const { agentById } = await import("./agents");
    agentById.set(slow.id, slow as never);
    const def: WorkflowDef = { id: "t2", name: "t", description: "", organizationSlug: "x", budgetUnits: 10, steps: [{ key: "s", kind: "agent", agentId: slow.id, timeoutMs: 50, retries: 0 }] };
    const { store, run: r } = await run(def);
    expect(r.status).toBe("failed");
    expect(store.tasks[0]!.error).toBe("timed_out");
    agentById.delete(slow.id);
  });
  it("an approval gate can only be passed once, and finished runs can't be cancelled", async () => {
    const store = new MemoryStore();
    const def = workflowById.get("research-firm")!;
    const run = await startRun(store, def, { sessionDate: DATE, visibility: "private", startedBy: "u1", input: { top: 3 } });
    const paused = await advance(store, def, run.id, ctx());
    const results = await Promise.allSettled([approve(store, def, paused.id, "a", ctx()), approve(store, def, paused.id, "b", ctx())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(store.tasks.filter((t) => t.stepKey === "report")).toHaveLength(1);
    await expect(cancel(store, run.id, "u1")).rejects.toThrow("cannot_cancel");
  });
});
