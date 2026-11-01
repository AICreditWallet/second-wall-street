import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, attempt, createTestDb, createUser } from "./db";

const OWNER = "77777777-7777-4777-8777-777777777777";
const STRANGER = "88888888-8888-4888-8888-888888888888";
const REVIEWER = "99999999-9999-4999-8999-999999999999";
const UNVERIFIED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner = { role: "authenticated", uid: OWNER } as const;
const stranger = { role: "authenticated", uid: STRANGER } as const;
const reviewer = { role: "authenticated", uid: REVIEWER } as const;

let db: PGlite;
let org: string;

const addAgent = (who: typeof owner | typeof stranger, slug: string, extra = "") =>
  as(db, who, (tx) => tx.query(`insert into public.agents (slug, organization_id, name, category, summary${extra ? ", status" : ""}) values ($1, $2, $3, 'Research', 'Does research.'${extra ? `, '${extra}'` : ""}) returning id`, [slug, org, `Agent ${slug}`]));
const idOf = async (slug: string) => (await db.query<{ id: string }>("select id from public.agents where slug = $1", [slug])).rows[0]!.id;
const asService = <T,>(fn: (tx: Parameters<Parameters<PGlite["transaction"]>[0]>[0]) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return fn(tx);
  });

beforeAll(async () => {
  db = await createTestDb();
  for (const u of [OWNER, STRANGER, REVIEWER]) await createUser(db, u);
  await createUser(db, UNVERIFIED, { verified: false });
  const office = (await db.query<{ id: string }>("select id from public.offices where status = 'available' and tier = 'standard' order by id limit 1")).rows[0]!.id;
  await as(db, owner, (tx) => tx.query("select public.claim_office($1, 'Builder Labs', 'builder-labs')", [office]));
  org = (await db.query<{ id: string }>("select id from public.organizations where slug = 'builder-labs'")).rows[0]!.id;
}, 60_000);

describe("registering agents", () => {
  it("owners add agents to their organisation; strangers cannot", async () => {
    expect(await attempt(addAgent(owner, "builder-one"))).toBe("ok");
    expect(await attempt(addAgent(stranger, "sneaky-one"))).toMatch(/row-level security/);
  });

  it("enforces the plan's agent limit", async () => {
    expect(await attempt(addAgent(owner, "builder-two"))).toBe("ok");
    expect(await attempt(addAgent(owner, "builder-three"))).toBe("ok");
    expect(await attempt(addAgent(owner, "builder-four"))).toBe("agent_limit_reached");
  });

  it("cannot be marked live without a recent passing health check", async () => {
    const id = await idOf("builder-one");
    const setLive = () => as(db, owner, (tx) => tx.query("update public.agents set status = 'live' where id = $1", [id]));
    expect(await attempt(setLive())).toBe("health_check_required");
    expect(await attempt(as(db, owner, (tx) => tx.query("insert into public.agent_health_checks (agent_id, ok) values ($1, true)", [id])))).toMatch(/permission denied/);
    await asService((tx) => tx.query("insert into public.agent_health_checks (agent_id, ok, status_code, latency_ms) values ($1, false, 500, 30)", [id]));
    expect(await attempt(setLive())).toBe("health_check_required");
    await asService((tx) => tx.query("insert into public.agent_health_checks (agent_id, ok, status_code, latency_ms) values ($1, true, 200, 40)", [id]));
    expect(await attempt(setLive())).toBe("ok");
  });

  it("owners cannot suspend/unsuspend or move agents", async () => {
    const id = await idOf("builder-two");
    expect(await attempt(as(db, owner, (tx) => tx.query("update public.agents set status = 'suspended' where id = $1", [id])))).toBe("agent_suspended");
    expect(await attempt(as(db, owner, (tx) => tx.query("update public.agents set slug = 'renamed' where id = $1", [id])))).toMatch(/permission denied/);
    expect(await attempt(as(db, owner, (tx) => tx.query("update public.agents set organization_id = gen_random_uuid() where id = $1", [id])))).toMatch(/permission denied/);
  });

  it("strangers cannot edit or delete someone else's agent", async () => {
    const id = await idOf("builder-two");
    const r = await as(db, stranger, (tx) => tx.query("update public.agents set name = 'Hacked' where id = $1", [id]));
    expect(r.affectedRows).toBe(0);
    const d = await as(db, stranger, (tx) => tx.query("delete from public.agents where id = $1", [id]));
    expect(d.affectedRows).toBe(0);
  });
});

describe("connections and secrets", () => {
  it("stores HTTPS endpoints privately", async () => {
    const id = await idOf("builder-one");
    expect(await attempt(as(db, owner, (tx) => tx.query("insert into public.agent_connections (agent_id, endpoint_url) values ($1, 'http://insecure.example.com')", [id])))).toMatch(/check constraint/);
    expect(await attempt(as(db, owner, (tx) => tx.query("insert into public.agent_connections (agent_id, endpoint_url) values ($1, 'https://user:pass@evil.example')", [id])))).toMatch(/check constraint/);
    expect(await attempt(as(db, owner, (tx) => tx.query("insert into public.agent_connections (agent_id, endpoint_url) values ($1, 'https://agent.example.com/run')", [id])))).toBe("ok");
    const theirs = await as(db, stranger, (tx) => tx.query("select * from public.agent_connections"));
    expect(theirs.rows).toHaveLength(0);
    expect(await attempt(as(db, { role: "anon" }, (tx) => tx.query("select * from public.agent_connections")))).toMatch(/permission denied/);
  });

  it("keeps tokens in the vault, readable only by the server", async () => {
    const id = await idOf("builder-one");
    expect(await attempt(as(db, owner, (tx) => tx.query("select public.set_agent_secret($1, 'sk-test-supersecret')", [id])))).toBe("ok");
    const row = await db.query<Record<string, unknown>>("select * from public.agent_connections where agent_id = $1", [id]);
    expect(JSON.stringify(row.rows[0])).not.toContain("supersecret");
    expect(await attempt(as(db, stranger, (tx) => tx.query("select public.set_agent_secret($1, 'attacker-token')", [id])))).toBe("not_agent_owner");
    expect(await attempt(as(db, owner, (tx) => tx.query("select public.get_agent_secret($1)", [id])))).toMatch(/permission denied/);
    expect(await attempt(as(db, owner, (tx) => tx.query("select * from vault.decrypted_secrets")))).toMatch(/permission denied/);
    const s = await asService((tx) => tx.query<{ s: string }>("select public.get_agent_secret($1) s", [id]));
    expect(s.rows[0]!.s).toBe("sk-test-supersecret");
  });
});

describe("reviews", () => {
  let agentId: string;
  beforeAll(async () => {
    agentId = await idOf("builder-one");
    await as(db, owner, (tx) => tx.query("update public.agents set published = true where id = $1", [agentId]));
  });

  const review = (who: { role: "authenticated"; uid: string }, target: string, rating = 5, body = "Clear, sourced and useful.") =>
    as(db, who, (tx) => tx.query("insert into public.reviews (agent_id, rating, body) values ($1, $2, $3)", [target, rating, body]));

  it("lets a verified user review a published agent once", async () => {
    expect(await attempt(review(reviewer, agentId, 4))).toBe("ok");
    expect(await attempt(review(reviewer, agentId, 5))).toMatch(/duplicate/);
  });

  it("blocks self-reviews, unverified users, unpublished targets and junk", async () => {
    expect(await attempt(review(owner, agentId))).toBe("cannot_review_own");
    expect(await attempt(review({ role: "authenticated", uid: UNVERIFIED }, agentId))).toBe("email_not_verified");
    expect(await attempt(review(stranger, await idOf("builder-two")))).toBe("review_target_unavailable");
    expect(await attempt(review(stranger, agentId, 6))).toMatch(/check constraint/);
    expect(await attempt(review(stranger, agentId, 5, "ok"))).toMatch(/check constraint/);
  });

  it("cannot forge the author or the moderation state", async () => {
    expect(await attempt(as(db, stranger, (tx) => tx.query("insert into public.reviews (agent_id, rating, body, author_id) values ($1, 5, 'Pretending to be someone else', $2)", [agentId, REVIEWER])))).toMatch(/permission denied/);
    expect(await attempt(as(db, reviewer, (tx) => tx.query("update public.reviews set status = 'hidden' where agent_id = $1", [agentId])))).toMatch(/permission denied/);
    expect(await attempt(as(db, reviewer, (tx) => tx.query("update public.reviews set owner_response = 'fake' where agent_id = $1", [agentId])))).toMatch(/permission denied/);
  });

  it("owners respond; strangers cannot; moderation is staff-only", async () => {
    const id = (await db.query<{ id: string }>("select id from public.reviews where agent_id = $1", [agentId])).rows[0]!.id;
    expect(await attempt(as(db, owner, (tx) => tx.query("select public.respond_to_review($1, 'Thanks for the feedback!')", [id])))).toBe("ok");
    expect(await attempt(as(db, stranger, (tx) => tx.query("select public.respond_to_review($1, 'Spam')", [id])))).toBe("not_review_target_owner");
    expect(await attempt(as(db, owner, (tx) => tx.query("select public.moderate_review($1, 'hidden')", [id])))).toBe("not_moderator");
  });

  it("publishes aggregate ratings to visitors", async () => {
    expect(await attempt(review(stranger, agentId, 2, "Too slow for my needs."))).toBe("ok");
    const r = await as(db, { role: "anon" }, (tx) => tx.query<{ review_count: number; average_rating: string }>("select review_count, average_rating from public.review_stats where target_id = $1", [agentId]));
    expect(r.rows[0]).toEqual({ review_count: 2, average_rating: "3.00" });
  });
});
