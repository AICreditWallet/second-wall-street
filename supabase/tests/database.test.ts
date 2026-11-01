import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, attempt, createTestDb, createUser } from "./db";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const UNVERIFIED = "33333333-3333-4333-8333-333333333333";
const alice = { role: "authenticated", uid: ALICE } as const;
const bob = { role: "authenticated", uid: BOB } as const;
const anon = { role: "anon" } as const;

let db: PGlite;
let freeOffices: string[];
let premiumOffice: string;

const claim = (who: typeof alice | typeof bob, office: string, org?: [string, string]) =>
  as(db, who, (tx) =>
    tx.query("select public.claim_office($1, $2, $3, $4) as r", [office, org?.[0] ?? null, org?.[1] ?? null, null]),
  );

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, ALICE, { meta: { full_name: "Alice", avatar_url: "javascript:alert(1)", user_name: "alice-dev" } });
  await createUser(db, BOB);
  await createUser(db, UNVERIFIED, { verified: false });
  const free = await db.query<{ id: string }>("select id from public.offices where status = 'available' and tier = 'standard' order by id limit 5");
  freeOffices = free.rows.map((r) => r.id);
  premiumOffice = (await db.query<{ id: string }>("select id from public.offices where status = 'available' and tier <> 'standard' limit 1")).rows[0]!.id;
}, 60_000);

describe("schema and seed", () => {
  it("loads the whole city", async () => {
    const r = await db.query<{ b: number; o: number }>("select (select count(*)::int from public.buildings) b, (select count(*)::int from public.offices) o");
    expect(r.rows[0]).toEqual({ b: 120, o: 179 });
  });

  it("creates a profile on sign-up and drops unsafe avatar urls", async () => {
    const p = await db.query<{ display_name: string; avatar_url: string | null; github_username: string }>("select * from public.profiles where id = $1", [ALICE]);
    expect(p.rows[0]).toMatchObject({ display_name: "Alice", avatar_url: null, github_username: "alice-dev" });
  });
});

describe("anonymous visitors", () => {
  it("can read the public city", async () => {
    const n = await as(db, anon, (tx) => tx.query<{ n: number }>("select count(*)::int n from public.offices"));
    expect(n.rows[0]!.n).toBe(179);
  });

  it("cannot read private tables, write data or call trusted functions", async () => {
    expect(await attempt(as(db, anon, (tx) => tx.query("select * from public.audit_logs")))).toMatch(/permission denied/);
    expect(await attempt(as(db, anon, (tx) => tx.query("update public.offices set status = 'reserved', organization_id = null")))).toMatch(/permission denied/);
    expect(await attempt(as(db, anon, (tx) => tx.query("select public.claim_office($1)", [freeOffices[0]])))).toMatch(/permission denied/);
  });
});

describe("claiming offices", () => {
  it("requires a verified email", async () => {
    const r = await attempt(as(db, { role: "authenticated", uid: UNVERIFIED }, (tx) => tx.query("select public.claim_office($1, 'X Org', 'x-org')", [freeOffices[0]])));
    expect(r).toBe("email_not_verified");
  });

  it("needs organisation details for a first claim", async () => {
    expect(await attempt(claim(alice, freeOffices[0]!))).toBe("organization_details_required");
  });

  it("rejects reserved and invalid slugs", async () => {
    expect(await attempt(claim(alice, freeOffices[0]!, ["Fake Platform", "open15-ai"]))).toBe("slug_reserved");
    expect(await attempt(claim(alice, freeOffices[0]!, ["Bad", "Has Spaces"]))).toBe("organization_invalid");
  });

  it("lets a verified user claim a free office and creates their organisation atomically", async () => {
    expect(await attempt(claim(alice, freeOffices[0]!, ["Alice Labs", "alice-labs"]))).toBe("ok");
    const o = await db.query<{ status: string; slug: string }>(
      "select f.status, g.slug from public.offices f join public.organizations g on g.id = f.organization_id where f.id = $1",
      [freeOffices[0]],
    );
    expect(o.rows[0]).toEqual({ status: "occupied", slug: "alice-labs" });
    const roles = await db.query("select role from public.user_roles where user_id = $1", [ALICE]);
    expect(roles.rows).toEqual([{ role: "office_owner" }]);
  });

  it("does not create an organisation when the claim is rejected", async () => {
    await attempt(claim(bob, premiumOffice, ["Bob Co", "bob-co"]));
    const r = await db.query("select 1 from public.organizations where slug = 'bob-co'");
    expect(r.rows).toHaveLength(0);
  });

  it("limits each owner to one free office", async () => {
    expect(await attempt(claim(alice, freeOffices[1]!))).toBe("free_office_limit");
  });

  it("never lets two organisations hold the same office", async () => {
    expect(await attempt(claim(bob, freeOffices[0]!, ["Bob Co", "bob-co"]))).toBe("office_unavailable");
    // Even a direct insert of a second active claim is rejected by the database.
    const aliceOrg = (await db.query<{ id: string }>("select id from public.organizations where slug = 'alice-labs'")).rows[0]!.id;
    expect(await attempt(db.query("insert into public.office_claims (office_id, organization_id) values ($1, $2)", [freeOffices[0], aliceOrg]))).toMatch(/duplicate key/);
  });

  it("keeps premium offices behind a subscription", async () => {
    expect(await attempt(claim(bob, premiumOffice, ["Bob Co", "bob-co"]))).toBe("premium_requires_subscription");
  });

  it("rejects a slug that is already taken", async () => {
    expect(await attempt(claim(bob, freeOffices[2]!, ["Copycat", "alice-labs"]))).toBe("slug_taken");
  });

  it("cannot claim platform offices", async () => {
    const platform = (await db.query<{ id: string }>("select id from public.offices where status = 'platform' limit 1")).rows[0]!.id;
    expect(await attempt(claim(bob, platform, ["Bob Co", "bob-co"]))).toBe("office_unavailable");
  });
});

describe("organisation permissions", () => {
  it("owners edit allowed fields only", async () => {
    const r = await as(db, alice, (tx) => tx.query("update public.organizations set tagline = 'Hello' where slug = 'alice-labs'"));
    expect(r.affectedRows).toBe(1);
    expect(await attempt(as(db, alice, (tx) => tx.query("update public.organizations set verified = true where slug = 'alice-labs'")))).toMatch(/permission denied/);
    expect(await attempt(as(db, alice, (tx) => tx.query("update public.organizations set operator = 'platform' where slug = 'alice-labs'")))).toMatch(/permission denied/);
  });

  it("other users cannot edit someone else's organisation or office", async () => {
    const r = await as(db, bob, (tx) => tx.query("update public.organizations set name = 'Hacked' where slug = 'alice-labs'"));
    expect(r.affectedRows).toBe(0);
    expect(await attempt(as(db, bob, (tx) => tx.query("update public.offices set organization_id = null, status = 'available' where id = $1", [freeOffices[0]])))).toMatch(/permission denied/);
    expect(await attempt(as(db, alice, (tx) => tx.query("insert into public.organization_members (organization_id, user_id, role) select id, $1, 'owner' from public.organizations where slug = 'second-wall-street'", [ALICE])))).toMatch(/permission denied/);
  });

  it("rejects non-https websites", async () => {
    expect(await attempt(as(db, alice, (tx) => tx.query("update public.organizations set website_url = 'javascript:alert(1)' where slug = 'alice-labs'")))).toMatch(/check constraint/);
  });

  it("claim history is private to the organisation", async () => {
    const mine = await as(db, alice, (tx) => tx.query("select * from public.office_claims"));
    const theirs = await as(db, bob, (tx) => tx.query("select * from public.office_claims"));
    expect(mine.rows).toHaveLength(1);
    expect(theirs.rows).toHaveLength(0);
  });
});

describe("storage", () => {
  it("only organisation owners can upload into its logo folder", async () => {
    const orgId = (await db.query<{ id: string }>("select id from public.organizations where slug = 'alice-labs'")).rows[0]!.id;
    const insert = (who: typeof alice | typeof bob, name: string) =>
      as(db, who, (tx) => tx.query("insert into storage.objects (bucket_id, name) values ('org-logos', $1)", [name]));
    expect(await attempt(insert(alice, `${orgId}/logo.png`))).toBe("ok");
    expect(await attempt(insert(bob, `${orgId}/logo.png`))).toMatch(/row-level security/);
    expect(await attempt(insert(alice, `${orgId}/../../evil.html`))).toMatch(/row-level security/);
  });
});

describe("releasing and account lifecycle", () => {
  it("only the owner can release an office", async () => {
    expect(await attempt(as(db, bob, (tx) => tx.query("select public.release_office($1)", [freeOffices[0]])))).toBe("not_office_owner");
    expect(await attempt(as(db, alice, (tx) => tx.query("select public.release_office($1)", [freeOffices[0]])))).toBe("ok");
    const o = await db.query("select status, organization_id from public.offices where id = $1", [freeOffices[0]]);
    expect(o.rows[0]).toEqual({ status: "available", organization_id: null });
  });

  it("rate-limits repeated claim/release cycles", async () => {
    let result = "ok";
    for (let i = 0; i < 12 && result === "ok"; i++) {
      result = await attempt(claim(alice, freeOffices[3]!));
      if (result === "ok") result = await attempt(as(db, alice, (tx) => tx.query("select public.release_office($1)", [freeOffices[3]])));
    }
    expect(result).toBe("rate_limited");
  });

  it("exports the user's data", async () => {
    const r = await as(db, alice, (tx) => tx.query<{ d: { profile: { id: string }; organizations: unknown[] } }>("select public.export_my_data() d"));
    expect(r.rows[0]!.d.profile.id).toBe(ALICE);
    expect(r.rows[0]!.d.organizations).toHaveLength(1);
  });

  it("frees offices and removes solely-owned organisations before account deletion", async () => {
    await db.query("delete from public.audit_logs where actor_id = $1", [BOB]);
    expect(await attempt(claim(bob, freeOffices[4]!, ["Bob Co", "bob-co"]))).toBe("ok");
    await as(db, bob, (tx) => tx.query("select public.prepare_account_deletion()"));
    const r = await db.query("select status from public.offices where id = $1", [freeOffices[4]]);
    expect(r.rows[0]).toEqual({ status: "available" });
    expect((await db.query("select 1 from public.organizations where slug = 'bob-co'")).rows).toHaveLength(0);
  });
});
