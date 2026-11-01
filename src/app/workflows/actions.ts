"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { makeContext } from "@/lib/firm/agents";
import { advance, approve, cancel, startRun } from "@/lib/firm/engine";
import { DbStore } from "@/lib/firm/server";
import { DAILY_RUN_QUOTA, workflowById } from "@/lib/firm/workflows";
import { latestCompletedSession } from "@/lib/market/calendar";
import { getProvider } from "@/lib/market/provider";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const startInput = z.object({ workflow: z.string().refine((w) => workflowById.has(w)), top: z.coerce.number().int().min(1).max(8) });
const runId = z.string().uuid();

async function setup(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const admin = createSupabaseAdminClient();
  if (!admin) redirect(`${next}?error=unavailable`);
  return { user, admin, store: new DbStore(admin) };
}

export async function startWorkflow(form: FormData) {
  const parsed = startInput.safeParse({ workflow: form.get("workflow"), top: form.get("top") });
  if (!parsed.success) redirect("/workflows?error=invalid");
  const { user, admin, store } = await setup("/workflows");
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const used = await admin.from("workflow_runs").select("id", { count: "exact", head: true }).eq("started_by", user.id).gte("created_at", since);
  if (used.error) redirect("/workflows?error=unavailable");
  if ((used.count ?? 0) >= DAILY_RUN_QUOTA) redirect("/workflows?error=quota");

  const def = workflowById.get(parsed.data.workflow)!;
  const session = latestCompletedSession(new Date());
  let id: string;
  try {
    const run = await startRun(store, def, { sessionDate: session, visibility: "private", startedBy: user.id, input: { top: parsed.data.top } });
    id = run.id;
    await advance(store, def, run.id, makeContext(getProvider(), session));
  } catch (e) {
    console.error("workflow_start_failed", (e as Error).message);
    redirect("/workflows?error=failed");
  }
  redirect(`/workflows/${id}`);
}

async function ownRun(form: FormData) {
  const id = runId.safeParse(form.get("run"));
  if (!id.success) redirect("/workflows?error=invalid");
  const ctx = await setup(`/workflows/${id.data}`);
  const run = await ctx.store.getRun(id.data);
  // Only the person who started a run may approve or cancel it.
  if (!run || run.startedBy !== ctx.user.id) redirect("/workflows?error=not-yours");
  return { ...ctx, run };
}

export async function approveRun(form: FormData) {
  const { store, run } = await ownRun(form);
  const def = workflowById.get(run.workflowId);
  if (!def) redirect("/workflows?error=invalid");
  try {
    await approve(store, def, run.id, "the run owner", makeContext(getProvider(), run.sessionDate));
  } catch (e) {
    if ((e as Error).message !== "not_awaiting_approval") console.error("workflow_approve_failed", (e as Error).message);
  }
  revalidatePath(`/workflows/${run.id}`);
  redirect(`/workflows/${run.id}`);
}

export async function cancelRun(form: FormData) {
  const { store, run, user } = await ownRun(form);
  try {
    await cancel(store, run.id, user.id === run.startedBy ? "the run owner" : "unknown");
  } catch {
    // Already finished: nothing to cancel.
  }
  revalidatePath(`/workflows/${run.id}`);
  redirect(`/workflows/${run.id}`);
}
