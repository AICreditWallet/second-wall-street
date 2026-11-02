import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, attempt, createTestDb, createUser } from "./db";

const BUYER = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const RIVAL = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2";
const buyer = { role: "authenticated", uid: BUYER } as const;
const rival = { role: "authenticated", uid: RIVAL } as const;
let db: PGlite;
let premium: string[];

const service = <T,>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return tx.query<T>(sql, params);
  });
const start = (who: typeof buyer | typeof rival, office: string, kind = "monthly", org: [string, string] | null = null) =>
  as(db, who, (tx) => tx.query<{ r: { purchase_id: string; amount_minor: number } }>("select public.start_office_purchase($1, $2, $3, $4) r", [office, kind, org?.[0] ?? null, org?.[1] ?? null]));
const office = async (id: string) => (await db.query<{ status: string; organization_id: string | null }>("select status, organization_id from public.offices where id = $1", [id])).rows[0]!;
const purchase = async (id: string) => (await db.query<{ status: string }>("select status from public.office_purchases where id = $1", [id])).rows[0]!;

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, BUYER);
  await createUser(db, RIVAL);
  premium = (await db.query<{ id: string }>("select id from public.offices where status = 'available' and tier = 'premium' order by id limit 4")).rows.map((r) => r.id);
}, 60_000);

describe("plans", () => {
  it("free office: 1 agent; premium: £9.99/month or £59.99 once", async () => {
    const plans = await db.query<{ tier: string; monthly_price_minor: number | null; lifetime_price_minor: number | null; currency: string | null; max_agents: number; active: boolean }>(
      "select tier, monthly_price_minor, lifetime_price_minor, currency, max_agents, active from public.office_plans order by tier",
    );
    expect(plans.rows).toEqual([
      { tier: "standard", monthly_price_minor: null, lifetime_price_minor: null, currency: null, max_agents: 1, active: true },
      { tier: "premium", monthly_price_minor: 999, lifetime_price_minor: 5999, currency: "gbp", max_agents: 10, active: true },
      { tier: "landmark", monthly_price_minor: 999, lifetime_price_minor: 5999, currency: "gbp", max_agents: 25, active: true },
    ]);
  });

  it("a free office allows exactly one agent", async () => {
    const free = (await db.query<{ id: string }>("select id from public.offices where status = 'available' and tier = 'standard' order by id limit 1")).rows[0]!.id;
    await as(db, rival, (tx) => tx.query("select public.claim_office($1, 'Rival Co', 'rival-co')", [free]));
    const org = (await db.query<{ id: string }>("select id from public.organizations where slug = 'rival-co'")).rows[0]!.id;
    const add = (slug: string) => as(db, rival, (tx) => tx.query("insert into public.agents (slug, organization_id, name, category, summary) values ($1, $2, 'Agent', 'Research', 'Does research.')", [slug, org]));
    expect(await attempt(add("rival-one"))).toBe("ok");
    expect(await attempt(add("rival-two"))).toBe("agent_limit_reached");
  });
});

describe("buying a premium office", () => {
  let p1: string;

  it("free offices aren't for sale and visitors can't start checkouts", async () => {
    const free = (await db.query<{ id: string }>("select id from public.offices where status = 'available' and tier = 'standard' order by id limit 1")).rows[0]!.id;
    expect(await attempt(start(buyer, free, "monthly", ["Buyer Labs", "buyer-labs"]))).toBe("office_not_for_sale");
    expect(await attempt(as(db, { role: "anon" }, (tx) => tx.query("select public.start_office_purchase($1, 'monthly')", [premium[0]])))).toMatch(/permission denied/);
    expect(await attempt(start(buyer, premium[0]!, "free-please", ["Buyer Labs", "buyer-labs"]))).toBe("invalid_plan");
  });

  it("reserves the office at the plan's price; nobody else can take it meanwhile", async () => {
    const r = await start(buyer, premium[0]!, "monthly", ["Buyer Labs", "buyer-labs"]);
    p1 = r.rows[0]!.r.purchase_id;
    expect(r.rows[0]!.r.amount_minor).toBe(999);
    expect((await office(premium[0]!)).status).toBe("reserved");
    expect(await attempt(start(rival, premium[0]!))).toBe("office_unavailable");
  });

  it("people can't write purchases or mark themselves paid", async () => {
    expect(await attempt(as(db, buyer, (tx) => tx.query("update public.office_purchases set status = 'active' where id = $1", [p1])))).toMatch(/permission denied/);
    expect(await attempt(as(db, buyer, (tx) => tx.query("insert into public.office_purchases (office_id, kind, amount_minor, currency, expires_at) values ($1, 'lifetime', 0, 'gbp', now())", [premium[1]])))).toMatch(/permission denied/);
    expect(await attempt(as(db, buyer, (tx) => tx.query("select public.billing_activate('cs_test_x', null, null, null, null)")))).toMatch(/permission denied/);
    const theirs = await as(db, rival, (tx) => tx.query("select * from public.office_purchases"));
    expect(theirs.rows).toHaveLength(0);
    const mine = await as(db, buyer, (tx) => tx.query("select * from public.office_purchases"));
    expect(mine.rows).toHaveLength(1);
  });

  it("the verified webhook hands over the office, once", async () => {
    await service("select public.billing_attach_session($1, 'cs_test_one')", [p1]);
    const first = await service<{ s: string }>("select public.billing_activate('cs_test_one', 'cus_ABC', 'sub_ABC', null, now() + interval '1 month') s");
    const again = await service<{ s: string }>("select public.billing_activate('cs_test_one', 'cus_ABC', 'sub_ABC', null, now() + interval '1 month') s");
    expect([first.rows[0]!.s, again.rows[0]!.s]).toEqual(["active", "active"]);
    const o = await office(premium[0]!);
    expect(o.status).toBe("occupied");
    expect((await db.query("select 1 from public.office_claims where office_id = $1 and released_at is null", [premium[0]])).rows).toHaveLength(1);
  });

  it("duplicate Stripe events are recognised", async () => {
    const a = await service<{ ok: boolean }>("select public.billing_record_event('evt_1', 'checkout.session.completed') ok");
    const b = await service<{ ok: boolean }>("select public.billing_record_event('evt_1', 'checkout.session.completed') ok");
    expect([a.rows[0]!.ok, b.rows[0]!.ok]).toEqual([true, false]);
  });

  it("a paid office can't be released directly — only by ending the subscription", async () => {
    expect(await attempt(as(db, buyer, (tx) => tx.query("select public.release_office($1)", [premium[0]])))).toBe("paid_office_use_billing");
    await service("select public.billing_subscription_changed('sub_ABC', 'past_due', null, false)");
    expect((await purchase(p1)).status).toBe("past_due");
    expect((await office(premium[0]!)).status).toBe("occupied");
    await service("select public.billing_subscription_changed('sub_ABC', 'canceled', null, false)");
    expect((await purchase(p1)).status).toBe("canceled");
    expect(await office(premium[0]!)).toEqual({ status: "available", organization_id: null });
  });
});

describe("abandoned and late checkouts", () => {
  it("an expired checkout frees the office", async () => {
    const r = await start(buyer, premium[1]!, "lifetime");
    const id = r.rows[0]!.r.purchase_id;
    expect(r.rows[0]!.r.amount_minor).toBe(5999);
    await service("select public.billing_attach_session($1, 'cs_test_two')", [id]);
    await service("select public.billing_session_expired('cs_test_two')");
    expect((await purchase(id)).status).toBe("expired");
    expect((await office(premium[1]!)).status).toBe("available");
  });

  it("starting a new checkout abandons your previous one", async () => {
    const a = (await start(buyer, premium[2]!)).rows[0]!.r.purchase_id;
    await start(buyer, premium[3]!);
    expect((await purchase(a)).status).toBe("expired");
    expect((await office(premium[2]!)).status).toBe("available");
  });

  it("a payment that arrives after someone else took the office never takes it from them", async () => {
    const id = (await db.query<{ id: string }>("select id from public.office_purchases where office_id = $1 and status = 'pending'", [premium[3]])).rows[0]!.id;
    await service("select public.billing_attach_session($1, 'cs_test_late')", [id]);
    // The reservation lapses, then a rival reserves the same office.
    await db.query("update public.office_purchases set expires_at = now() - interval '1 minute' where id = $1", [id]);
    await start(rival, premium[3]!, "monthly");
    const s = await service<{ s: string }>("select public.billing_activate('cs_test_late', 'cus_ABC', null, 'pi_LATE', null) s");
    expect(s.rows[0]!.s).toBe("conflict");
    expect((await office(premium[3]!)).status).toBe("reserved");
  });

  it("a refunded one-time payment returns the office", async () => {
    const r = await start(buyer, premium[1]!, "lifetime");
    const id = r.rows[0]!.r.purchase_id;
    await service("select public.billing_attach_session($1, 'cs_test_life')", [id]);
    await service("select public.billing_activate('cs_test_life', 'cus_ABC', null, 'pi_LIFE', null)");
    expect((await office(premium[1]!)).status).toBe("occupied");
    await service("select public.billing_refunded('pi_LIFE')");
    expect((await purchase(id)).status).toBe("refunded");
    expect((await office(premium[1]!)).status).toBe("available");
  });
});
