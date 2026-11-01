import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { runHealthCheck, type Connection } from "@/lib/agents/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily health check of every connected agent (Vercel Cron sends Authorization: Bearer $CRON_SECRET). */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data } = await admin.from("agent_connections").select("*").order("updated_at", { ascending: true }).limit(40);
  const results = await Promise.all(((data ?? []) as Connection[]).map(async (c) => ({ agent: c.agent_id, result: await runHealthCheck(c) })));
  return NextResponse.json({ checked: results.length, healthy: results.filter((r) => "ok" in r.result && r.result.ok).length });
}
