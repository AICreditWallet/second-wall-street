import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MyAgent {
  id: string;
  slug: string;
  name: string;
  category: string;
  summary: string;
  capabilities: string[];
  disclosure: string | null;
  status: "in-development" | "preview" | "live" | "suspended";
  published: boolean;
  organization_id: string;
}

export interface HealthCheck {
  agent_id: string;
  checked_at: string;
  ok: boolean;
  status_code: number | null;
  latency_ms: number | null;
  error: string | null;
}

const COLS = "id, slug, name, category, summary, capabilities, disclosure, status, published, organization_id";

/** Agents of the given organisations (RLS returns unpublished ones only to members) with their latest health check. */
export async function getMyAgents(db: SupabaseClient, orgIds: string[]) {
  if (orgIds.length === 0) return [];
  const { data: agents } = await db.from("agents").select(COLS).in("organization_id", orgIds).order("created_at");
  const list = (agents ?? []) as MyAgent[];
  if (list.length === 0) return [];
  const { data: checks } = await db
    .from("agent_health_checks")
    .select("agent_id, checked_at, ok, status_code, latency_ms, error")
    .in("agent_id", list.map((a) => a.id))
    .order("checked_at", { ascending: false })
    .limit(200);
  const latest = new Map<string, HealthCheck>();
  for (const c of (checks ?? []) as HealthCheck[]) if (!latest.has(c.agent_id)) latest.set(c.agent_id, c);
  return list.map((a) => ({ ...a, health: latest.get(a.id) ?? null }));
}

export async function getMyAgent(db: SupabaseClient, id: string) {
  const { data: agent } = await db.from("agents").select(COLS).eq("id", id).maybeSingle();
  if (!agent) return null;
  const [{ data: connection }, { data: checks }] = await Promise.all([
    db.from("agent_connections").select("agent_id, endpoint_url, health_url, openapi_url, auth_scheme, secret_id, input_schema, output_schema").eq("agent_id", id).maybeSingle(),
    db.from("agent_health_checks").select("agent_id, checked_at, ok, status_code, latency_ms, error").eq("agent_id", id).order("checked_at", { ascending: false }).limit(5),
  ]);
  return { agent: agent as MyAgent, connection, checks: (checks ?? []) as HealthCheck[] };
}

/** Mirrors the database rule: "Live" needs a passing check within the last 24 hours. */
export function isRecentlyHealthy(check: HealthCheck | undefined, now = Date.now()) {
  return Boolean(check?.ok && now - new Date(check.checked_at).getTime() < 24 * 3600 * 1000);
}
