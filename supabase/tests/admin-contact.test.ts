import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, attempt, createTestDb, createUser } from "./db";

const ADMIN = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const USER = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const MOD = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const admin = { role: "authenticated", uid: ADMIN } as const;
const user = { role: "authenticated", uid: USER } as const;
const mod = { role: "authenticated", uid: MOD } as const;
const anon = { role: "anon" } as const;
let db: PGlite;

type Who = typeof admin | typeof user | typeof mod | typeof anon;
const send = (who: Who, email: string, subject = "A question", message = "Hello, I have a question.") =>
  as(db, who, (tx) => tx.query("select public.submit_contact_message($1, $2, $3)", [email, subject, message]));

beforeAll(async () => {
  db = await createTestDb();
  for (const id of [ADMIN, USER, MOD]) await createUser(db, id);
  await db.query("insert into public.user_roles (user_id, role) values ($1, 'admin'), ($2, 'moderator')", [ADMIN, MOD]);
}, 60_000);

describe("contact messages", () => {
  it("anyone can send one, but only through the validated function", async () => {
    expect(await attempt(send(anon, "visitor@example.test"))).toBe("ok");
    expect(await attempt(as(db, anon, (tx) => tx.query("insert into public.contact_messages (email, subject, message) values ('a@b.co', 'Subject', 'Long enough text')")))).toMatch(/permission denied/);
    expect(await attempt(as(db, user, (tx) => tx.query("insert into public.contact_messages (email, subject, message) values ('a@b.co', 'Subject', 'Long enough text')")))).toMatch(/permission denied/);
  });

  it("rejects bad input", async () => {
    expect(await attempt(send(anon, "not-an-email"))).toBe("contact_invalid");
    expect(await attempt(send(anon, "x@example.test", "Hi", "Hello, I have a question."))).toBe("contact_invalid");
    expect(await attempt(send(anon, "x@example.test", "A question", "short"))).toBe("contact_invalid");
    expect(await attempt(send(anon, "x\n@example.test"))).toBe("contact_invalid");
  });

  it("limits one address to 3 messages an hour, whatever the capitalisation", async () => {
    for (let i = 0; i < 3; i++) expect(await attempt(send(anon, "busy@example.test"))).toBe("ok");
    expect(await attempt(send(anon, "BUSY@example.test"))).toBe("contact_rate_limited");
  });

  it("marks the address verified only when it is the sender's own account", async () => {
    const own = (await db.query<{ email: string }>("select email from auth.users where id = $1", [USER])).rows[0]!.email;
    await send(user, own);
    await send(user, "someone-else@example.test");
    const rows = await db.query<{ email: string; email_verified: boolean; user_id: string }>("select email, email_verified, user_id from public.contact_messages where user_id = $1 order by email", [USER]);
    expect(rows.rows.find((r) => r.email === own)?.email_verified).toBe(true);
    expect(rows.rows.find((r) => r.email !== own)?.email_verified).toBe(false);
    const visitor = await db.query<{ email_verified: boolean }>("select email_verified from public.contact_messages where email = 'visitor@example.test'");
    expect(visitor.rows[0]!.email_verified).toBe(false);
  });

  it("only admins can read them or change their status", async () => {
    expect(await attempt(as(db, anon, (tx) => tx.query("select * from public.contact_messages")))).toMatch(/permission denied/);
    for (const who of [user, mod]) {
      expect((await as(db, who, (tx) => tx.query("select * from public.contact_messages"))).rows).toHaveLength(0);
    }
    const rows = await as(db, admin, (tx) => tx.query<{ id: string }>("select id from public.contact_messages"));
    expect(rows.rows.length).toBeGreaterThan(0);
    const id = rows.rows[0]!.id;
    expect(await attempt(as(db, user, (tx) => tx.query("select public.set_contact_message_status($1, 'handled')", [id])))).toBe("not_admin");
    expect(await attempt(as(db, anon, (tx) => tx.query("select public.set_contact_message_status($1, 'handled')", [id])))).toMatch(/permission denied/);
    expect(await attempt(as(db, admin, (tx) => tx.query("select public.set_contact_message_status($1, 'handled')", [id])))).toBe("ok");
    expect(await attempt(as(db, admin, (tx) => tx.query("update public.contact_messages set status = 'new'")))).toMatch(/permission denied/);
  });

  it("appears in the sender's data export and survives account deletion without the link", async () => {
    const r = await as(db, user, (tx) => tx.query<{ d: { contact_messages: unknown[] } }>("select public.export_my_data() d"));
    expect(r.rows[0]!.d.contact_messages).toHaveLength(2);
    await createUser(db, "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4");
    await send({ role: "authenticated", uid: "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4" } as unknown as typeof user, "leaver@example.test");
    await db.query("delete from auth.users where id = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4'");
    const m = await db.query<{ user_id: string | null }>("select user_id from public.contact_messages where email = 'leaver@example.test'");
    expect(m.rows[0]!.user_id).toBeNull();
  });
});

describe("admin user list", () => {
  it("shows emails to admins only", async () => {
    const rows = await as(db, admin, (tx) => tx.query<{ email: string; joined_at: string }>("select * from public.admin_list_users()"));
    expect(rows.rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.rows[0]!.email).toContain("@");
    expect(await attempt(as(db, user, (tx) => tx.query("select * from public.admin_list_users()")))).toBe("not_admin");
    expect(await attempt(as(db, mod, (tx) => tx.query("select * from public.admin_list_users()")))).toBe("not_admin");
    expect(await attempt(as(db, anon, (tx) => tx.query("select * from public.admin_list_users()")))).toMatch(/permission denied/);
  });
});
