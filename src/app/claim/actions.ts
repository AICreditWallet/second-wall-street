"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { revalidateCity } from "@/lib/revalidate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, officeIdSchema, orgNameSchema, slugSchema, type FormState } from "@/lib/validation";

export async function claimOffice(_: FormState, formData: FormData): Promise<FormState> {
  const officeId = officeIdSchema.safeParse(formData.get("officeId"));
  if (!officeId.success) return { message: "That office doesn't exist." };
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!user || !supabase) return { message: "Please sign in to continue." };

  let org: { name: string; slug: string; tagline: string } | null = null;
  if (formData.get("newOrg") === "1") {
    const parsed = z
      .object({ name: orgNameSchema, slug: slugSchema, tagline: z.string().trim().max(120, "At most 120 characters.") })
      .safeParse({ name: formData.get("name"), slug: formData.get("slug"), tagline: formData.get("tagline") ?? "" });
    if (!parsed.success) return { errors: fieldErrors(parsed.error) };
    org = parsed.data;
  }

  const { data, error } = await supabase.rpc("claim_office", {
    p_office_id: officeId.data,
    p_org_name: org?.name ?? null,
    p_org_slug: org?.slug ?? null,
    p_org_tagline: org?.tagline ?? null,
  });
  if (error) {
    const message = friendlyError(error);
    if (error.message === "slug_taken" || error.message === "slug_reserved") return { errors: { slug: message } };
    return { message };
  }
  revalidateCity();
  redirect(`/dashboard?claimed=${encodeURIComponent((data as { office_id: string }).office_id)}`);
}
