"use client";

import { useActionState, useState } from "react";
import { claimOffice } from "./actions";
import { startCheckout } from "../billing/actions";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form";
import { PRICES, type PlanKind } from "@/lib/billing/plans";
import { slugify, type FormState } from "@/lib/validation";

/** Organisation name + web address, shown when the person doesn't own one yet. */
function OrgFields({ existingOrgName, siteHost, state, verb }: { existingOrgName: string | null; siteHost: string; state: FormState; verb: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const effectiveSlug = slugEdited ? slug : slugify(name);
  if (existingOrgName) {
    return (
      <p className="text-sm text-fg-muted">
        This office will {verb} <strong className="text-fg">{existingOrgName}</strong>.
      </p>
    );
  }
  return (
    <>
      <input type="hidden" name="newOrg" value="1" />
      <Field
        label="Organisation name"
        name="name"
        required
        maxLength={60}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={state?.errors?.name}
        hint="Your company, project or team. You can change it later."
      />
      <Field
        label="Web address"
        name="slug"
        required
        maxLength={40}
        value={effectiveSlug}
        onChange={(e) => {
          setSlugEdited(true);
          setSlug(e.target.value.toLowerCase());
        }}
        error={state?.errors?.slug}
        hint={`${siteHost}/orgs/${effectiveSlug || "your-name"} — can't be changed later.`}
      />
      <Field label="Tagline (optional)" name="tagline" maxLength={120} error={state?.errors?.tagline} placeholder="What do you build?" />
    </>
  );
}

export function ClaimForm({ officeId, existingOrgName, siteHost }: { officeId: string; existingOrgName: string | null; siteHost: string }) {
  const [state, action] = useActionState(claimOffice, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="officeId" value={officeId} />
      <OrgFields existingOrgName={existingOrgName} siteHost={siteHost} state={state} verb="belong to" />
      <FormAlert state={state} />
      <SubmitButton className="w-full" pending="Claiming your office…">
        Claim this office — free
      </SubmitButton>
      <p className="text-center text-xs text-fg-subtle">One free office per owner, with 1 AI agent. You can release it any time.</p>
    </form>
  );
}

const PLAN_TEXT: Record<PlanKind, { title: string; note: string }> = {
  monthly: { title: "Monthly", note: "Cancel any time; the office stays yours until the end of the paid month." },
  lifetime: { title: "One-time", note: "Pay once and keep the office for as long as Second Wall Street runs." },
};

export function CheckoutForm({ officeId, existingOrgName, siteHost, agentLimit, testMode }: { officeId: string; existingOrgName: string | null; siteHost: string; agentLimit: number; testMode: boolean }) {
  const [state, action] = useActionState(startCheckout, null);
  const [kind, setKind] = useState<PlanKind>("monthly");
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="officeId" value={officeId} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">How would you like to pay?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PRICES) as PlanKind[]).map((k) => (
            <label key={k} className={`cursor-pointer rounded-2xl border p-4 ${kind === k ? "border-cyan bg-cyan/10" : "border-line hover:border-line-strong"}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              <span className="block text-sm text-fg-muted">{PLAN_TEXT[k].title}</span>
              <span className="mt-1 block text-2xl font-semibold">
                {PRICES[k].label} <span className="text-sm font-normal text-fg-muted">{PRICES[k].per}</span>
              </span>
              <span className="mt-2 block text-xs text-fg-subtle">{PLAN_TEXT[k].note}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <OrgFields existingOrgName={existingOrgName} siteHost={siteHost} state={state} verb="belong to" />
      <FormAlert state={state} />
      <SubmitButton className="w-full" pending="Opening secure checkout…">
        Continue to payment — {PRICES[kind].label}
        {kind === "monthly" ? "/month" : ""}
      </SubmitButton>
      <p className="text-center text-xs text-fg-subtle">
        Includes up to {agentLimit} AI agents. Prices include VAT. {kind === "monthly" ? "Renews monthly until you cancel. " : ""}Payment is handled by Stripe; we never see your card. The office is held for you for 30 minutes while you pay. By continuing you agree to the{" "}
        <a href="/legal/terms" target="_blank" className="underline">terms</a> and <a href="/legal/refunds" target="_blank" className="underline">refund policy</a>.
        {testMode && " Test mode: use card 4242 4242 4242 4242 — no real money is taken."}
      </p>
    </form>
  );
}
