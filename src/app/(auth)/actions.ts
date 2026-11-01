"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { displayNameSchema, emailSchema, fieldErrors, passwordSchema, type FormState } from "@/lib/validation";

const NOT_CONFIGURED: FormState = { message: "Accounts are not switched on in this environment yet." };

// Callback URLs are built from the configured site URL, never from request
// headers, so a spoofed Host header cannot redirect users elsewhere.
const callback = (next: string) => `${SITE.url}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;

export async function signInWithGitHub(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!supabase) redirect(`/sign-in?error=not_configured`);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: callback(next), scopes: "read:user user:email" },
  });
  if (error || !data.url) redirect(`/sign-in?error=oauth`);
  redirect(data.url);
}

export async function signInWithPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(72) }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return { message: "Please verify your email first — check your inbox for the link." };
    // Same message for unknown email and wrong password (no account enumeration).
    return { message: "Email or password is incorrect." };
  }
  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ name: displayNameSchema, email: emailSchema, password: passwordSchema, terms: z.literal("on", { message: "Please accept the terms to continue." }) })
    .safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password"), terms: formData.get("terms") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.name }, emailRedirectTo: callback(String(formData.get("next") ?? "/dashboard")) },
  });
  if (error && error.code === "weak_password") return { errors: { password: "Choose a stronger password." } };
  if (error && error.status === 429) return { message: "Too many attempts. Please wait a minute and try again." };
  // Shown even if the email already exists, so sign-up cannot reveal who has an account.
  return { ok: true, message: "Check your inbox — we've sent a link to verify your email." };
}

export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { errors: { email: "Enter a valid email address." } };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: callback("/account/update-password") });
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { errors: { password: parsed.error.issues[0]?.message ?? "Invalid password." } };
  if (formData.get("password") !== formData.get("confirm")) return { errors: { confirm: "Passwords don't match." } };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { message: error.code === "same_password" ? "Choose a password you haven't used here before." : "Your reset link has expired. Request a new one." };
  return { ok: true, message: "Password updated." };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/");
}
