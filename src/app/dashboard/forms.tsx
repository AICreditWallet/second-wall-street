"use client";

import { useActionState, useState } from "react";
import type { Organization } from "@/lib/city/types";
import { releaseOffice, updateOrganization, uploadLogo } from "./actions";
import { Field, FormAlert, SubmitButton, TextArea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";

export function ReleaseOfficeForm({ officeId }: { officeId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(releaseOffice, null);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "min-h-10 px-3 text-danger hover:text-danger")}>
        Release office
      </button>
    );
  }
  return (
    <form action={action} className="w-full space-y-3 rounded-2xl border border-danger/30 bg-danger/5 p-4">
      <input type="hidden" name="officeId" value={officeId} />
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-red-400" />
        I understand this office becomes available for anyone to claim.
      </label>
      <FormAlert state={state} />
      <div className="flex gap-2">
        <SubmitButton variant="secondary" pending="Releasing…">
          Release
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost")}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function OrganizationForm({ org }: { org: Organization }) {
  const [state, action] = useActionState(updateOrganization, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="orgId" value={org.id} />
      <Field label="Name" name="name" defaultValue={org.name} required maxLength={60} error={state?.errors?.name} />
      <Field label="Tagline" name="tagline" defaultValue={org.tagline} maxLength={120} error={state?.errors?.tagline} />
      <TextArea label="Description" name="description" defaultValue={org.description} maxLength={2000} error={state?.errors?.description} />
      <Field label="Website" name="website_url" type="url" defaultValue={org.website ?? ""} placeholder="https://" error={state?.errors?.website_url} />
      <Field label="GitHub" name="github_url" type="url" defaultValue={org.githubUrl ?? ""} placeholder="https://github.com/your-org" error={state?.errors?.github_url} />
      <FormAlert state={state} />
      <SubmitButton pending="Saving…">Save changes</SubmitButton>
    </form>
  );
}

export function LogoForm({ org }: { org: Organization }) {
  const [state, action] = useActionState(uploadLogo, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orgId" value={org.id} />
      <div className="flex items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-ink-850">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-lg font-semibold text-fg-muted">{org.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <label className="text-sm">
          <span className="mb-1.5 block font-medium">Logo</span>
          <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="text-sm text-fg-muted file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-fg" />
          <span className="mt-1 block text-xs text-fg-subtle">PNG, JPEG or WebP, up to 512 KB. Square works best.</span>
        </label>
      </div>
      <FormAlert state={state} />
      <SubmitButton variant="secondary" pending="Uploading…">
        Upload logo
      </SubmitButton>
    </form>
  );
}
