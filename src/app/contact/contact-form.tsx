"use client";

import { useActionState } from "react";
import { Field, FormAlert, SubmitButton, TextArea } from "@/components/ui/form";
import { sendContactMessage } from "./actions";

export function ContactForm({ email }: { email: string | null }) {
  const [state, action] = useActionState(sendContactMessage, null);
  if (state?.ok) return <FormAlert state={state} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <Field label="Your email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={email ?? ""} error={state?.errors?.email} hint="We'll only use this to reply to you." />
      <Field label="Subject" name="subject" required maxLength={120} error={state?.errors?.subject} />
      <TextArea label="Message" name="message" required rows={7} maxLength={5000} error={state?.errors?.message} />
      {/* Left empty by people: the field is invisible and skipped by keyboard and screen readers. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <FormAlert state={state} />
      <SubmitButton pending="Sending…">Send message</SubmitButton>
    </form>
  );
}
