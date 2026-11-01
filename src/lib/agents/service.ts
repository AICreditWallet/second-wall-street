import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { callAgent } from "./caller";
import { validateAgainst } from "./schemas";

export interface Connection {
  agent_id: string;
  endpoint_url: string;
  health_url: string | null;
  openapi_url: string | null;
  auth_scheme: "none" | "bearer";
  secret_id: string | null;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

/**
 * Loads a connection through the *user's* client. RLS only returns it to the
 * agent's owners, so a non-null result proves the caller may operate it.
 */
export async function ownedConnection(userDb: SupabaseClient, agentId: string): Promise<Connection | null> {
  const { data } = await userDb.from("agent_connections").select("*").eq("agent_id", agentId).maybeSingle();
  return (data as Connection | null) ?? null;
}

async function token(admin: SupabaseClient, c: Connection) {
  if (c.auth_scheme !== "bearer" || !c.secret_id) return null;
  const { data } = await admin.rpc("get_agent_secret", { p_agent_id: c.agent_id });
  return (data as string | null) ?? null;
}

async function recentChecks(admin: SupabaseClient, agentId: string) {
  const { count } = await admin
    .from("agent_health_checks")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .gt("checked_at", new Date(Date.now() - 60_000).toISOString());
  return count ?? 0;
}

export type HealthResult = { ok: boolean; status: number | null; latencyMs: number; error: string | null };

/** GET the health URL (or endpoint) and record the result. Max 3 checks per agent per minute. */
export async function runHealthCheck(c: Connection): Promise<HealthResult | { error: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Health checks aren't available in this environment." };
  if ((await recentChecks(admin, c.agent_id)) >= 3) return { error: "Please wait a minute before checking again." };
  const r = await callAgent(c.health_url ?? c.endpoint_url, { method: "GET", token: await token(admin, c) });
  await admin.from("agent_health_checks").insert({
    agent_id: c.agent_id,
    ok: r.ok,
    status_code: r.status,
    latency_ms: r.latencyMs,
    error: r.error?.slice(0, 300) ?? null,
  });
  return { ok: r.ok, status: r.status, latencyMs: r.latencyMs, error: r.error };
}

export type TestResult = { ok: boolean; latencyMs: number; output: string | null; problem: string | null };

/**
 * Sends a sample task: POST {endpoint} {"task_id","input","test":true} and
 * expects {"output": …} matching the output schema (protocol v0, see /developers).
 */
export async function runTest(c: Connection, input: unknown): Promise<TestResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, latencyMs: 0, output: null, problem: "Testing isn't available in this environment." };
  const inputProblem = validateAgainst(c.input_schema, input);
  if (inputProblem) return { ok: false, latencyMs: 0, output: null, problem: `Sample input: ${inputProblem}` };
  if ((await recentChecks(admin, c.agent_id)) >= 3) return { ok: false, latencyMs: 0, output: null, problem: "Please wait a minute before testing again." };
  const r = await callAgent(c.endpoint_url, {
    method: "POST",
    token: await token(admin, c),
    json: { task_id: crypto.randomUUID(), input, test: true, source: "second-wall-street" },
  });
  // A test run also counts as a health signal.
  await admin.from("agent_health_checks").insert({ agent_id: c.agent_id, ok: r.ok, status_code: r.status, latency_ms: r.latencyMs, error: r.error?.slice(0, 300) ?? null });
  if (!r.ok) return { ok: false, latencyMs: r.latencyMs, output: null, problem: r.error };
  const output = (r.body as { output?: unknown } | null)?.output;
  if (output === undefined) return { ok: false, latencyMs: r.latencyMs, output: null, problem: 'The response must be JSON with an "output" field.' };
  const outProblem = validateAgainst(c.output_schema, output);
  const shown = JSON.stringify(output, null, 2);
  return { ok: !outProblem, latencyMs: r.latencyMs, output: shown.length > 4000 ? `${shown.slice(0, 4000)}…` : shown, problem: outProblem ? `Output: ${outProblem}` : null };
}
