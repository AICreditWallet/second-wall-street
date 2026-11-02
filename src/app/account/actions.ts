"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/billing/stripe";
import { getCurrentUser } from "@/lib/auth";
import { revalidateCity } from "@/lib/revalidate";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { displayNameSchema, type FormState } from "@/lib/validation";

export async function updateDisplayName(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = displayNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { errors: { name: parsed.error.issues[0]?.message ?? "Invalid name." } };
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!user || !supabase) return { message: "Please sign in to continue." };
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", user.id);
  return error ? { message: "Couldn't save your name." } : { ok: true, message: "Saved." };
}

export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirm") !== "DELETE") return { errors: { confirm: 'Type DELETE in capitals to confirm.' } };
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  if (!user || !supabase) return { message: "Please sign in to continue." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { message: "Account deletion isn't available in this environment yet. Contact support and we'll delete it for you." };

  // Stop any subscription first so a deleted account is never charged again.
  const { data: subs } = await supabase.from("office_purchases").select("stripe_subscription_id").in("status", ["active", "past_due"]).not("stripe_subscription_id", "is", null);
  if (subs?.length) {
    const stripe = getStripe();
    if (!stripe) return { message: "You have an active office subscription. Cancel it from your dashboard first, or contact support." };
    try {
      for (const s of subs) await stripe.subscriptions.cancel(s.stripe_subscription_id as string, { prorate: false });
    } catch {
      return { message: "We couldn't cancel your subscription. Please try again or contact support." };
    }
  }

  const { error: prepError } = await supabase.rpc("prepare_account_deletion");
  if (prepError) return { message: "We couldn't delete your account. Please try again." };
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { message: "We couldn't delete your account. Please try again." };
  await supabase.auth.signOut();
  revalidateCity();
  redirect("/?account=deleted");
}
