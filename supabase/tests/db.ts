import { readFileSync, readdirSync } from "node:fs";
import { PGlite, type Transaction } from "@electric-sql/pglite";

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

/** Fresh Postgres with the Supabase shim, all migrations and the seed applied. */
export async function createTestDb() {
  const db = await PGlite.create();
  await db.exec(read("tests/supabase-shim.sql"));
  for (const file of readdirSync(new URL("migrations/", root)).sort()) {
    await db.exec(read(`migrations/${file}`));
  }
  await db.exec(read("seed.sql"));
  return db;
}

export async function createUser(db: PGlite, id: string, opts: { verified?: boolean; meta?: object } = {}) {
  await db.query(
    "insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)",
    [id, `${id.slice(0, 8)}@example.test`, opts.verified === false ? null : new Date().toISOString(), JSON.stringify(opts.meta ?? {})],
  );
}

type Who = { role: "anon" } | { role: "authenticated"; uid: string };

/** Runs fn exactly as Supabase's API would for that caller (role + JWT claims), then rolls back if it throws. */
export async function as<T>(db: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${who.role}`);
    const claims = who.role === "authenticated" ? JSON.stringify({ sub: who.uid, role: "authenticated" }) : "{}";
    await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    return fn(tx);
  });
}

/** Resolves to the Postgres error message, or "ok". */
export async function attempt(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as Error).message;
  }
}
