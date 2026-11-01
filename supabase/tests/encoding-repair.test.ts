import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { as, createTestDb, createUser } from "./db";

// Reproduces the original incident: UTF-8 text read back as Mac Roman.
const garble = (s: string) => new TextDecoder("macintosh").decode(new TextEncoder().encode(s));

describe("text encoding repair", () => {
  it("restores garbled seed text without touching ownership", async () => {
    const db = await createTestDb();
    const uid = "66666666-6666-4666-8666-666666666666";
    await createUser(db, uid);
    const office = (await db.query<{ id: string }>("select id from public.offices where status = 'available' and tier = 'standard' order by id limit 1")).rows[0]!.id;
    await as(db, { role: "authenticated", uid }, (tx) => tx.query("select public.claim_office($1, 'Keeper Co', 'keeper-co')", [office]));

    // Garble every non-ASCII text value, as the bad paste did.
    for (const [table, col] of [["offices", "label"], ["organizations", "description"], ["agents", "summary"]] as const) {
      const rows = await db.query<{ id: string; v: string }>(`select id::text, ${col} as v from public.${table}`);
      for (const r of rows.rows) await db.query(`update public.${table} set ${col} = $1 where id::text = $2`, [garble(r.v), r.id]);
    }
    expect(garble("Floors 22–27")).toBe("Floors 22‚Äì27");
    expect((await db.query("select 1 from public.offices where label like '%‚Ä%'")).rows.length).toBeGreaterThan(0);
    const before = await db.query("select id, status, organization_id from public.offices order by id");

    await db.exec(readFileSync(new URL("../repairs/20261101_fix_text_encoding.sql", import.meta.url), "utf8"));

    expect((await db.query("select 1 from public.offices where label like '%‚Ä%'")).rows).toHaveLength(0);
    expect((await db.query<{ label: string }>("select label from public.offices where id = 'ofc-ex-010-4'")).rows[0]!.label).toBe("Floors 22–27");
    expect((await db.query<{ d: string }>("select description d from public.organizations where slug = 'open15-ai'")).rows[0]!.d).toContain("9:30–9:45");
    // Ownership, status and community organisations are untouched.
    expect((await db.query("select id, status, organization_id from public.offices order by id")).rows).toEqual(before.rows);
    expect((await db.query<{ name: string }>("select name from public.organizations where slug = 'keeper-co'")).rows[0]!.name).toBe("Keeper Co");
  }, 60_000);
});
