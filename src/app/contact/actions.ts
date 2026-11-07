"use server";

import { z } from "zod";
import { friendlyError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, type FormState } from "@/lib/validation";

const schema = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address so we can reply."),
  subject: z.string().trim().min(3, "Add a short subject.").max(120, "Keep the subject under 120 characters."),
  message: z.string().trim().min(10, "Tell us a little more (10+ characters).").max(5000, "Keep your message under 5,000 characters."),
});

export async function sendContactMessage(_: FormState, form: FormData): Promise<FormState> {
  // Hidden from people; bots tend to fill it in. Pretend it worked and store nothing.
  if (form.get("website")) return { ok: true, message: "Thanks, your message has been sent." };
  const parsed = schema.safeParse({ email: form.get("email"), subject: form.get("subject"), message: form.get("message") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { message: "The contact form isn't available in this environment." };
  const { error } = await supabase.rpc("submit_contact_message", { p_email: parsed.data.email, p_subject: parsed.data.subject, p_message: parsed.data.message });
  if (error) {
    if (error.message !== "contact_rate_limited" && error.message !== "contact_invalid") console.error("contact_failed", error.message);
    return { message: friendlyError(error) };
  }
  return { ok: true, message: "Thanks, your message has been sent. We'll reply to the email address you gave." };
}
