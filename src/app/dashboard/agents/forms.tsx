"use client";

import { useActionState, useState } from "react";
import { AGENT_CATEGORIES, DEFAULT_DISCLOSURE, FINANCE_CATEGORIES } from "@/lib/agents/catalog";
import { DEFAULT_INPUT_SCHEMA, DEFAULT_OUTPUT_SCHEMA } from "@/lib/agents/schemas";
import { slugify, type FormState } from "@/lib/validation";
import { Field, FormAlert, SubmitButton, TextArea } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { checkHealth, createAgent, deleteAgent, saveConnection, saveToken, setListing, testAgent, updateAgent } from "./actions";

type Details = { name: string; category: string; summary: string; capabilities: string[]; disclosure: string | null };

function DetailFields({ state, initial }: { state: FormState; initial?: Details }) {
  const [category, setCategory] = useState(initial?.category ?? "");
  return (
    <>
      <Field label="Agent name" name="name" defaultValue={initial?.name} required maxLength={80} error={state?.errors?.name} />
      <div>
        <label htmlFor="f-category" className="mb-1.5 block text-sm font-medium">
          Category
        </label>
        <select
          id="f-category"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="block w-full rounded-xl border border-line bg-ink-900 px-3.5 py-2.5 text-base text-fg sm:text-sm"
          required
        >
          <option value="" disabled>
            Choose…
          </option>
          {AGENT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {state?.errors?.category && <p className="mt-1.5 text-xs text-danger">{state.errors.category}</p>}
      </div>
      <TextArea label="What it does" name="summary" defaultValue={initial?.summary} maxLength={300} error={state?.errors?.summary} placeholder="One or two sentences a non-technical visitor understands." />
      <Field label="Capabilities (comma-separated)" name="capabilities" defaultValue={initial?.capabilities.join(", ")} maxLength={500} error={state?.errors?.capabilities} hint="e.g. Earnings summaries, Sector comparison, Source links" />
      <TextArea
        label={FINANCE_CATEGORIES.has(category) ? "Disclosure (required for finance agents)" : "Disclosure (optional)"}
        name="disclosure"
        defaultValue={initial?.disclosure ?? (initial ? "" : DEFAULT_DISCLOSURE)}
        maxLength={500}
        error={state?.errors?.disclosure}
      />
    </>
  );
}

export function NewAgentForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createAgent, null);
  const [slug, setSlug] = useState("");
  const [edited, setEdited] = useState(false);
  const [name, setName] = useState("");
  return (
    <form action={action} className="space-y-5" noValidate onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement;
      if (t.name === "name") setName(t.value);
    }}>
      {orgs.length > 1 ? (
        <div>
          <label htmlFor="f-org" className="mb-1.5 block text-sm font-medium">
            Organisation
          </label>
          <select id="f-org" name="orgId" className="block w-full rounded-xl border border-line bg-ink-900 px-3.5 py-2.5 text-sm">
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="orgId" value={orgs[0]?.id} />
      )}
      <DetailFields state={state} />
      <Field
        label="Web address"
        name="slug"
        value={edited ? slug : slugify(name)}
        onChange={(e) => {
          setEdited(true);
          setSlug(e.target.value.toLowerCase());
        }}
        maxLength={40}
        error={state?.errors?.slug}
        hint={`secondwallstreet.com/agents/${(edited ? slug : slugify(name)) || "your-agent"} — can't be changed later.`}
      />
      <FormAlert state={state} />
      <SubmitButton pending="Creating…">Create agent</SubmitButton>
      <p className="text-xs text-fg-subtle">New agents start hidden and “In development”. You connect, test and publish them on the next screen.</p>
    </form>
  );
}

export function EditDetailsForm({ agentId, initial }: { agentId: string; initial: Details }) {
  const [state, action] = useActionState(updateAgent, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="agentId" value={agentId} />
      <DetailFields state={state} initial={initial} />
      <FormAlert state={state} />
      <SubmitButton variant="secondary" pending="Saving…">
        Save details
      </SubmitButton>
    </form>
  );
}

export function ConnectionForm({
  agentId,
  initial,
}: {
  agentId: string;
  initial: { endpoint_url: string; health_url: string | null; openapi_url: string | null; input_schema: object; output_schema: object } | null;
}) {
  const [state, action] = useActionState(saveConnection, null);
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="agentId" value={agentId} />
      <Field label="Endpoint URL" name="endpoint_url" type="url" defaultValue={initial?.endpoint_url} placeholder="https://your-agent.example.com/run" required error={state?.errors?.endpoint_url} hint="We send tasks here with POST. Public HTTPS only." />
      <Field label="Health URL (optional)" name="health_url" type="url" defaultValue={initial?.health_url ?? ""} placeholder="https://your-agent.example.com/health" error={state?.errors?.health_url} hint="We call it with GET; any 2xx response means healthy. Defaults to the endpoint." />
      <Field label="OpenAPI spec URL (optional)" name="openapi_url" type="url" defaultValue={initial?.openapi_url ?? ""} error={state?.errors?.openapi_url} />
      <TextArea label="Input schema (JSON Schema)" name="input_schema" defaultValue={JSON.stringify(initial?.input_schema ?? DEFAULT_INPUT_SCHEMA, null, 2)} error={state?.errors?.input_schema} className="font-mono" rows={8} />
      <TextArea label="Output schema (JSON Schema)" name="output_schema" defaultValue={JSON.stringify(initial?.output_schema ?? DEFAULT_OUTPUT_SCHEMA, null, 2)} error={state?.errors?.output_schema} className="font-mono" rows={8} />
      <FormAlert state={state} />
      <SubmitButton variant="secondary" pending="Saving…">
        Save connection
      </SubmitButton>
    </form>
  );
}

export function TokenForm({ agentId, hasToken }: { agentId: string; hasToken: boolean }) {
  const [state, action] = useActionState(saveToken, null);
  return (
    <form action={action} className="space-y-4" noValidate autoComplete="off">
      <input type="hidden" name="agentId" value={agentId} />
      <Field
        label={hasToken ? "Replace bearer token" : "Bearer token (optional)"}
        name="token"
        type="password"
        autoComplete="new-password"
        error={state?.errors?.token}
        hint={hasToken ? "A token is stored. It is never shown again; enter a new one to replace it." : "Sent as “Authorization: Bearer …”. Stored encrypted in Supabase Vault; never shown in the browser again."}
      />
      <FormAlert state={state} />
      <SubmitButton variant="secondary" pending="Storing…">
        {hasToken ? "Replace token" : "Store token"}
      </SubmitButton>
    </form>
  );
}

export function HealthButton({ agentId }: { agentId: string }) {
  const [state, action] = useActionState(checkHealth, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="agentId" value={agentId} />
      <SubmitButton variant="secondary" pending="Checking…">
        Run health check
      </SubmitButton>
      <FormAlert state={state} />
    </form>
  );
}

export function TestForm({ agentId, sample }: { agentId: string; sample: string }) {
  const [state, action] = useActionState(testAgent, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="agentId" value={agentId} />
      <TextArea label="Sample input (JSON)" name="input" defaultValue={sample} rows={5} error={state?.errors?.input} className="font-mono" />
      <SubmitButton variant="secondary" pending="Sending test task…">
        Send test task
      </SubmitButton>
      <FormAlert state={state} />
      {state?.output && (
        <pre className="max-h-64 overflow-auto rounded-xl border border-line bg-ink-950 p-3 font-mono text-xs text-fg-muted" aria-label="Agent output">
          {state.output}
        </pre>
      )}
    </form>
  );
}

export function ListingForm({ agentId, status, published, healthy }: { agentId: string; status: string; published: boolean; healthy: boolean }) {
  const [state, action] = useActionState(setListing, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="agentId" value={agentId} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Status shown to visitors</legend>
        {[
          ["in-development", "In development", "Not ready; shown for transparency."],
          ["preview", "Preview", "Works, but expect changes."],
          ["live", "Live", healthy ? "Ready for real use." : "Needs a passing health check in the last 24 hours."],
        ].map(([value, label, hint]) => (
          <label key={value} className="flex items-start gap-2.5 text-sm">
            <input type="radio" name="status" value={value} defaultChecked={status === value} className="mt-1 accent-cyan-400" disabled={value === "live" && !healthy && status !== "live"} />
            <span>
              {label} <span className="block text-xs text-fg-subtle">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="published" defaultChecked={published} className="size-4 accent-cyan-400" />
        Published (visible in the directory, its profile page and your office)
      </label>
      <FormAlert state={state} />
      <SubmitButton pending="Saving…">Save listing</SubmitButton>
    </form>
  );
}

export function DeleteAgentForm({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(deleteAgent, null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "px-0 text-danger hover:text-danger")}>
        Delete this agent…
      </button>
    );
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-danger/30 bg-danger/5 p-4">
      <input type="hidden" name="agentId" value={agentId} />
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-red-400" />
        Delete the listing, its connection, token reference, health history and reviews. This can’t be undone.
      </label>
      <FormAlert state={state} />
      <SubmitButton variant="secondary" pending="Deleting…" className="text-danger">
        Delete agent
      </SubmitButton>
    </form>
  );
}
