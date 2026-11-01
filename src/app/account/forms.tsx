"use client";

import { useActionState } from "react";
import { deleteAccount, updateDisplayName } from "./actions";
import { signOut } from "@/app/(auth)/actions";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form";

export function DisplayNameForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateDisplayName, null);
  return (
    <form action={action} className="space-y-4">
      <Field label="Display name" name="name" defaultValue={name} maxLength={60} required error={state?.errors?.name} />
      <FormAlert state={state} />
      <SubmitButton variant="secondary" pending="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccount, null);
  return (
    <form action={action} className="space-y-4">
      <Field label='Type "DELETE" to confirm' name="confirm" autoComplete="off" error={state?.errors?.confirm} />
      <FormAlert state={state} />
      <SubmitButton variant="secondary" pending="Deleting…" className="border-danger/40 text-danger">
        Permanently delete my account
      </SubmitButton>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <SubmitButton variant="secondary" pending="Signing out…">
        Sign out
      </SubmitButton>
    </form>
  );
}
