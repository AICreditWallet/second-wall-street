import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, attempt, createTestDb, createUser } from "./db";

const A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let db: PGlite;
const service = <T,>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return tx.query<T>(sql, params);
  });

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, A);
  await createUser(db, B);
}, 60_000);

describe("research and workflow runs", () => {
  it("platform agents are live after the migration", async () => {
    const r = await db.query<{ status: string }>("select distinct status from public.agents where id like 'agt-%'");
    expect(r.rows).toEqual([{ status: "live" }]);
  });

  it("only the server writes research; everyone reads it", async () => {
    expect(await attempt(as(db, { role: "authenticated", uid: A }, (tx) => tx.query("insert into public.research_runs (session_date, provider, data_freshness, report) values ('2026-10-30', 'simulated', 'simulated', '{}')")))).toMatch(/permission denied/);
    const run = await service<{ id: string }>("insert into public.research_runs (session_date, provider, data_freshness, report) values ('2026-10-30', 'simulated', 'simulated', '{}') returning id");
    await service("insert into public.research_signals (run_id, rank, symbol, score, direction) values ($1, 1, 'SIM:CHIP', 72.5, 'up')", [run.rows[0]!.id]);
    const anon = await as(db, { role: "anon" }, (tx) => tx.query("select * from public.research_signals"));
    expect(anon.rows).toHaveLength(1);
    expect(await attempt(service("insert into public.research_runs (session_date, provider, data_freshness, report) values ('2026-10-30', 'simulated', 'simulated', '{}')"))).toMatch(/duplicate/);
  });

  it("private runs are visible only to the person who started them", async () => {
    const priv = await service<{ id: string }>("insert into public.workflow_runs (workflow_id, status, session_date, visibility, started_by, budget_units) values ('research-firm', 'awaiting_approval', '2026-10-30', 'private', $1, 60) returning id", [A]);
    const id = priv.rows[0]!.id;
    await service("insert into public.agent_tasks (run_id, step, step_key, agent_id, status) values ($1, 0, 'scan', 'agt-open15-scanner', 'succeeded')", [id]);
    await service("insert into public.agent_messages (run_id, from_agent, to_agent, kind, body) values ($1, 'agt-open15-scanner', 'agt-lab-research-analyst', 'handoff', '{}')", [id]);
    const mine = await as(db, { role: "authenticated", uid: A }, (tx) => tx.query("select * from public.agent_tasks where run_id = $1", [id]));
    const theirs = await as(db, { role: "authenticated", uid: B }, (tx) => tx.query("select * from public.agent_tasks where run_id = $1", [id]));
    const anon = await as(db, { role: "anon" }, (tx) => tx.query("select * from public.workflow_runs where id = $1", [id]));
    expect(mine.rows).toHaveLength(1);
    expect(theirs.rows).toHaveLength(0);
    expect(anon.rows).toHaveLength(0);
  });

  it("users cannot forge or edit runs", async () => {
    expect(await attempt(as(db, { role: "authenticated", uid: B }, (tx) => tx.query("insert into public.workflow_runs (workflow_id, status, session_date, visibility, started_by, budget_units) values ('research-firm', 'succeeded', '2026-10-30', 'public', $1, 60)", [B])))).toMatch(/permission denied/);
    expect(await attempt(as(db, { role: "authenticated", uid: A }, (tx) => tx.query("update public.workflow_runs set status = 'succeeded'")))).toMatch(/permission denied/);
  });

  it("allows one platform run per workflow per session", async () => {
    const q = "insert into public.workflow_runs (workflow_id, status, session_date, visibility, budget_units) values ('open15-session', 'succeeded', '2026-10-30', 'public', 30)";
    expect(await attempt(service(q))).toBe("ok");
    expect(await attempt(service(q))).toMatch(/duplicate/);
    expect(await attempt(service("insert into public.workflow_runs (workflow_id, status, session_date, visibility, budget_units) values ('open15-session', 'succeeded', '2026-10-31', 'private', 30)"))).toMatch(/check constraint/);
  });
});
