import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, attempt, createTestDb, createUser } from "./db";

const OWNER = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const owner = { role: "authenticated", uid: OWNER } as const;
const other = { role: "authenticated", uid: OTHER } as const;
let db: PGlite;
let office: string;
let agentId: string;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, OWNER);
  await createUser(db, OTHER);
  office = (await db.query<{ id: string }>("select id from public.offices where status = 'available' and tier = 'standard' order by id limit 1")).rows[0]!.id;
  await as(db, owner, (tx) => tx.query("select public.claim_office($1, 'Owner Labs', 'owner-labs')", [office]));
  const org = (await db.query<{ id: string }>("select id from public.organizations where slug = 'owner-labs'")).rows[0]!.id;
  agentId = (await db.query<{ id: string }>("insert into public.agents (slug, organization_id, name, category, published) values ('owner-bot', $1, 'Owner Bot', 'Research', true) returning id", [org])).rows[0]!.id;
}, 60_000);

describe("office interiors", () => {
  it("visitors can read interiors without signing in", async () => {
    const r = await attempt(as(db, { role: "anon" }, (tx) => tx.query("select * from public.office_interiors")));
    expect(r).toBe("ok");
  });

  it("owners can choose their layout; others cannot", async () => {
    expect(await attempt(as(db, owner, (tx) => tx.query("insert into public.office_interiors (office_id, template) values ($1, 'startup')", [office])))).toBe("ok");
    const r = await as(db, other, (tx) => tx.query("update public.office_interiors set template = 'research' where office_id = $1", [office]));
    expect(r.affectedRows).toBe(0);
    expect(await attempt(as(db, other, (tx) => tx.query("insert into public.office_interiors (office_id) values ($1)", [office])))).toMatch(/row-level security|duplicate/);
    expect(await attempt(as(db, owner, (tx) => tx.query("update public.office_interiors set template = 'mansion' where office_id = $1", [office])))).toMatch(/check constraint/);
  });

  it("nobody can configure a platform office or someone else's", async () => {
    const platform = (await db.query<{ id: string }>("select id from public.offices where status = 'platform' limit 1")).rows[0]!.id;
    expect(await attempt(as(db, owner, (tx) => tx.query("insert into public.office_interiors (office_id) values ($1)", [platform])))).toMatch(/row-level security/);
  });

  it("owners place only their own agents at their own desks", async () => {
    expect(await attempt(as(db, owner, (tx) => tx.query("insert into public.agent_workstations (office_id, slot, agent_id) values ($1, 0, $2)", [office, agentId])))).toBe("ok");
    const platformAgent = (await db.query<{ id: string }>("select id from public.agents where slug = 'open15-scanner'")).rows[0]!.id;
    expect(await attempt(as(db, owner, (tx) => tx.query("insert into public.agent_workstations (office_id, slot, agent_id) values ($1, 1, $2)", [office, platformAgent])))).toMatch(/row-level security/);
    expect(await attempt(as(db, other, (tx) => tx.query("delete from public.agent_workstations where office_id = $1", [office])))).toBe("ok");
    const still = await db.query("select 1 from public.agent_workstations where office_id = $1", [office]);
    expect(still.rows).toHaveLength(1);
  });

  it("an agent can only occupy one workstation", async () => {
    expect(await attempt(db.query("insert into public.agent_workstations (office_id, slot, agent_id) values ($1, 1, $2)", [office, agentId]))).toMatch(/duplicate/);
  });
});
