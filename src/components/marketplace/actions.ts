"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation";

const target = z.string().regex(/^(agent:[a-z0-9-]{5,64}|organization:[0-9a-f-]{36})$/);
const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choose a rating.").max(5),
  body: z.string().trim().min(10, "Write at least 10 characters.").max(2000),
});

function refresh(path: string | null) {
  if (path && /^\/(agents|orgs)\/[a-z0-9-]+$/.test(path)) revalidatePath(path);
  revalidatePath("/agents");
  revalidatePath("/city");
}

export async function submitReview(_: FormState, fd: FormData): Promise<FormState> {
  const t = target.safeParse(fd.get("target"));
  const parsed = reviewSchema.safeParse({ rating: fd.get("rating"), body: fd.get("body") });
  if (!t.success) return { message: "Something went wrong." };
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const user = await getCurrentUser();
  const db = await createSupabaseServerClient();
  if (!user || !db) return { message: "Please sign in to write a review." };
  const [kind, id] = t.data.split(":");
  const reviewId = z.string().uuid().safeParse(fd.get("reviewId"));
  const { error } = reviewId.success
    ? await db.from("reviews").update(parsed.data).eq("id", reviewId.data).eq("author_id", user.id)
    : await db.from("reviews").insert({ ...parsed.data, ...(kind === "agent" ? { agent_id: id } : { organization_id: id }) });
  if (error) return { message: error.code === "23505" ? "You've already reviewed this." : friendlyError(error) };
  refresh(String(fd.get("path") ?? ""));
  return { ok: true, message: reviewId.success ? "Review updated." : "Thanks — your review is published." };
}

export async function deleteReview(_: FormState, fd: FormData): Promise<FormState> {
  const id = z.string().uuid().safeParse(fd.get("reviewId"));
  const user = await getCurrentUser();
  const db = await createSupabaseServerClient();
  if (!id.success || !user || !db) return { message: "Please sign in." };
  await db.from("reviews").delete().eq("id", id.data).eq("author_id", user.id);
  refresh(String(fd.get("path") ?? ""));
  return { ok: true, message: "Review deleted." };
}

export async function respondToReview(_: FormState, fd: FormData): Promise<FormState> {
  const id = z.string().uuid().safeParse(fd.get("reviewId"));
  const text = z.string().trim().max(1000).safeParse(fd.get("response"));
  const db = await createSupabaseServerClient();
  if (!id.success || !text.success || !db) return { message: "Please sign in." };
  const { error } = await db.rpc("respond_to_review", { p_review_id: id.data, p_response: text.data });
  if (error) return { message: friendlyError(error) };
  refresh(String(fd.get("path") ?? ""));
  return { ok: true, message: "Response posted." };
}

export async function reportContent(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z
    .object({
      target_type: z.enum(["review", "agent", "organization"]),
      target_id: z.string().min(3).max(80),
      reason: z.string().trim().min(5, "Tell us briefly what's wrong (5+ characters).").max(1000),
    })
    .safeParse({ target_type: fd.get("targetType"), target_id: fd.get("targetId"), reason: fd.get("reason") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const user = await getCurrentUser();
  const db = await createSupabaseServerClient();
  if (!user || !db) return { message: "Please sign in to report content." };
  const { error } = await db.from("moderation_reports").insert({ ...parsed.data, reporter_id: user.id });
  return error ? { message: "Couldn't send the report." } : { ok: true, message: "Thanks — our moderators will review it." };
}
