"use client";

import { useActionState, useState } from "react";
import { claimOffice } from "./actions";
import { Field, FormAlert, SubmitButton } from "@/components/ui/form";
import { slugify } from "@/lib/validation";

export function ClaimForm({ officeId, existingOrgName, siteHost }: { officeId: string; existingOrgName: string | null; siteHost: string }) {
  const [state, action] = useActionState(claimOffice, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const effectiveSlug = slugEdited ? slug : slugify(name);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="officeId" value={officeId} />
      {existingOrgName ? (
        <p className="text-sm text-fg-muted">
          This office will belong to <strong className="text-fg">{existingOrgName}</strong>.
        </p>
      ) : (
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
      )}
      <FormAlert state={state} />
      <SubmitButton className="w-full" pending="Claiming your office…">
        Claim this office — free
      </SubmitButton>
      <p className="text-center text-xs text-fg-subtle">One free office per owner. You can release it any time.</p>
    </form>
  );
}
