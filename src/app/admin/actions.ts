"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { revalidateCity } from "@/lib/revalidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Every action runs as the signed-in user; the database functions check the role again.
async function call(fn: string, args: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;
  const { error } = await supabase.rpc(fn, args);
  if (error) console.error("admin_action_failed", fn, error.message);
  revalidatePath("/admin");
}

export async function resolveReport(form: FormData) {
  const p = z.object({ id: z.string().uuid(), status: z.enum(["reviewing", "actioned", "dismissed"]) }).safeParse({ id: form.get("id"), status: form.get("status") });
  if (p.success) await call("resolve_report", { p_report: p.data.id, p_status: p.data.status });
}

export async function moderateReview(form: FormData) {
  const p = z.object({ id: z.string().uuid(), status: z.enum(["published", "hidden"]) }).safeParse({ id: form.get("id"), status: form.get("status") });
  if (p.success) await call("moderate_review", { p_review_id: p.data.id, p_status: p.data.status });
  revalidateCity();
}

export async function suspendAgent(form: FormData) {
  const p = z.object({ id: z.string().regex(/^agt-[a-z0-9-]{3,60}$/), suspend: z.enum(["1", "0"]) }).safeParse({ id: form.get("id"), suspend: form.get("suspend") });
  if (p.success) await call("set_agent_suspended", { p_agent: p.data.id, p_suspended: p.data.suspend === "1" });
  revalidateCity();
}
