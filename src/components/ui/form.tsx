"use client";

import { useFormStatus } from "react-dom";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { buttonClass } from "./button";

export function SubmitButton({
  children,
  pending: pendingLabel = "Working…",
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pending?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={buttonClass(variant, className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}

const inputClass =
  "block w-full rounded-xl border border-line bg-ink-900 px-3.5 py-2.5 text-base text-fg placeholder:text-fg-subtle focus:border-cyan/60 focus:outline-none focus:ring-2 focus:ring-cyan/25 sm:text-sm";

export function Field({
  label,
  name,
  error,
  hint,
  ...props
}: { label: string; name: string; error?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input id={id} name={name} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={inputClass} {...props} />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  name,
  error,
  className = "",
  ...props
}: { label: string; name: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <textarea id={id} name={name} aria-invalid={Boolean(error)} className={`${inputClass} min-h-28 ${className}`} {...props} />
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function FormAlert({ state }: { state: { ok?: boolean; message?: string } | null }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`rounded-xl border px-3.5 py-2.5 text-sm ${state.ok ? "border-cyan/30 bg-cyan/10 text-cyan-soft" : "border-danger/30 bg-danger/10 text-danger"}`}
    >
      {state.message}
    </p>
  );
}
