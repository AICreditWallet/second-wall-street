"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, signInWithGitHub, signInWithPassword, signUp, updatePassword } from "@/app/(auth)/actions";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form";
import { GitHubIcon } from "./auth-card";

export function GitHubButton({ next }: { next: string }) {
  return (
    <form action={signInWithGitHub}>
      <input type="hidden" name="next" value={next} />
      <SubmitButton variant="secondary" className="w-full" pending="Redirecting to GitHub…">
        <GitHubIcon /> Continue with GitHub
      </SubmitButton>
    </form>
  );
}

function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-fg-subtle" aria-hidden="true">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInWithPassword, null);
  return (
    <>
      <GitHubButton next={next} />
      <Divider />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={state?.errors?.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required error={state?.errors?.password} />
        <FormAlert state={state} />
        <SubmitButton className="w-full" pending="Signing in…">
          Sign in
        </SubmitButton>
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="text-fg-muted hover:text-fg">
            Forgot your password?
          </Link>
        </p>
      </form>
    </>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUp, null);
  if (state?.ok) return <FormAlert state={state} />;
  return (
    <>
      <GitHubButton next={next} />
      <Divider />
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field label="Your name" name="name" autoComplete="name" required maxLength={60} error={state?.errors?.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={state?.errors?.email} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          error={state?.errors?.password}
          hint="At least 10 characters, with letters and a number."
        />
        <label className="flex items-start gap-2.5 text-sm text-fg-muted">
          <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-cyan-400" required />
          <span>
            I agree to the{" "}
            <Link href="/legal/terms" className="text-fg underline-offset-2 hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="text-fg underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {state?.errors?.terms && <p className="text-xs text-danger">{state.errors.terms}</p>}
        <FormAlert state={state} />
        <SubmitButton className="w-full" pending="Creating account…">
          Create account
        </SubmitButton>
      </form>
    </>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state?.errors?.email} />
      <FormAlert state={state} />
      <SubmitButton className="w-full" pending="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="New password" name="password" type="password" autoComplete="new-password" required error={state?.errors?.password} hint="At least 10 characters, with letters and a number." />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required error={state?.errors?.confirm} />
      <FormAlert state={state} />
      {state?.ok ? (
        <Link href="/dashboard" className="block text-center text-sm text-cyan-soft hover:underline">
          Go to your dashboard →
        </Link>
      ) : (
        <SubmitButton className="w-full" pending="Saving…">
          Update password
        </SubmitButton>
      )}
    </form>
  );
}
