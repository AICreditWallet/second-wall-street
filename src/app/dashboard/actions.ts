"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { revalidateCity } from "@/lib/revalidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, officeIdSchema, orgProfileSchema, type FormState } from "@/lib/validation";

const uuid = z.string().uuid();

export async function releaseOffice(_: FormState, formData: FormData): Promise<FormState> {
  const officeId = officeIdSchema.safeParse(formData.get("officeId"));
  if (!officeId.success) return { message: "That office doesn't exist." };
  if (formData.get("confirm") !== "on") return { message: "Tick the box to confirm." };
  const supabase = await createSupabaseServerClient();
  if (!supabase || !(await getCurrentUser())) return { message: "Please sign in to continue." };
  const { error } = await supabase.rpc("release_office", { p_office_id: officeId.data });
  if (error) return { message: friendlyError(error) };
  revalidateCity();
  redirect("/dashboard?released=1");
}

export async function updateOrganization(_: FormState, formData: FormData): Promise<FormState> {
  const orgId = uuid.safeParse(formData.get("orgId"));
  if (!orgId.success) return { message: "Organisation not found." };
  const parsed = orgProfileSchema.safeParse({
    name: formData.get("name"),
    tagline: formData.get("tagline") ?? "",
    description: formData.get("description") ?? "",
    website_url: formData.get("website_url") ?? "",
    github_url: formData.get("github_url") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  if (!supabase || !(await getCurrentUser())) return { message: "Please sign in to continue." };

  // RLS + column grants decide what can change; zero rows means "not allowed".
  const { data, error } = await supabase.from("organizations").update(parsed.data).eq("id", orgId.data).select("slug");
  if (error) return { message: "Couldn't save. Please check the fields and try again." };
  if (!data?.length) return { message: "You don't have permission to edit this organisation." };
  revalidateCity();
  return { ok: true, message: "Saved. Your public page is updated." };
}

const LOGO_TYPES: Record<string, { ext: string; magic: number[] }> = {
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/webp": { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] },
};
const MAX_LOGO_BYTES = 512 * 1024;

export async function uploadLogo(_: FormState, formData: FormData): Promise<FormState> {
  const orgId = uuid.safeParse(formData.get("orgId"));
  const file = formData.get("logo");
  if (!orgId.success || !(file instanceof File) || file.size === 0) return { message: "Choose an image to upload." };
  if (file.size > MAX_LOGO_BYTES) return { message: "Logo must be 512 KB or smaller." };
  const type = LOGO_TYPES[file.type];
  if (!type) return { message: "Use a PNG, JPEG or WebP image." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Check the file really is the image type it claims to be (no SVG/HTML smuggling).
  if (!type.magic.every((b, i) => bytes[i] === b)) return { message: "That file doesn't look like a valid image." };

  const supabase = await createSupabaseServerClient();
  if (!supabase || !(await getCurrentUser())) return { message: "Please sign in to continue." };
  const { data: org } = await supabase.from("organizations").select("logo_path").eq("id", orgId.data).maybeSingle();
  const path = `${orgId.data}/logo.${type.ext}`;
  const { error: upErr } = await supabase.storage.from("org-logos").upload(path, bytes, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (upErr) return { message: "Upload failed. Only organisation owners can change the logo." };
  if (org?.logo_path && org.logo_path !== path) await supabase.storage.from("org-logos").remove([org.logo_path]);
  const { data, error } = await supabase.from("organizations").update({ logo_path: path }).eq("id", orgId.data).select("id");
  if (error || !data?.length) return { message: "Couldn't save the logo." };
  revalidateCity();
  return { ok: true, message: "Logo updated." };
}
