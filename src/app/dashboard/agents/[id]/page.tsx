import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, CheckCircle2, Circle, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getMyAgent, isRecentlyHealthy } from "@/lib/data/my-agents";
import { AGENT_STATUS_LABEL } from "@/lib/agents/catalog";
import { DEFAULT_INPUT_SCHEMA } from "@/lib/agents/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { ConnectionForm, DeleteAgentForm, EditDetailsForm, HealthButton, ListingForm, TestForm, TokenForm } from "../forms";

export const metadata: Metadata = { title: "Manage Agent", robots: { index: false } };

function sampleFor(schema: Record<string, unknown> | undefined) {
  const props = (schema?.properties ?? {}) as Record<string, { type?: string }>;
  const sample: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) sample[k] = v.type === "number" || v.type === "integer" ? 1 : v.type === "boolean" ? true : v.type === "array" ? [] : "Summarise today's top market news";
  return JSON.stringify(Object.keys(sample).length ? sample : { query: "Hello" }, null, 2);
}

export default async function ManageAgentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{5,64}$/.test(id)) notFound();
  await requireUser(`/dashboard/agents/${id}`);
  const supabase = await createSupabaseServerClient();
  const data = supabase ? await getMyAgent(supabase, id) : null;
  if (!data) notFound();
  const { agent, connection, checks } = data;
  const last = checks[0];
  const healthy = isRecentlyHealthy(last);
  const created = (await searchParams).created === "1";

  const steps = [
    { done: true, label: "Describe the agent" },
    { done: Boolean(connection), label: "Connect its HTTPS endpoint" },
    { done: healthy, label: "Pass a health check" },
    { done: agent.published, label: "Publish the listing" },
  ];

  return (
    <PageShell
      eyebrow="Manage agent"
      title={agent.name}
      intro={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={agent.status === "live" ? "cyan" : "gold"}>{AGENT_STATUS_LABEL[agent.status]}</Badge>
          <Badge>{agent.published ? "Published" : "Hidden"}</Badge>
          {agent.published && (
            <Link href={`/agents/${agent.slug}`} className="inline-flex items-center gap-1 text-sm text-cyan-soft hover:underline">
              Public page <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      }
    >
      {created && (
        <p role="status" className="mb-8 rounded-2xl border border-cyan/30 bg-cyan/10 px-4 py-3 text-sm text-cyan-soft">
          Agent created. Next: connect its endpoint below.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-line bg-ink-900 p-6" aria-labelledby="conn-h">
            <h2 id="conn-h" className="mb-4 font-medium">
              Connection
            </h2>
            <ConnectionForm
              agentId={agent.id}
              initial={connection ? { endpoint_url: connection.endpoint_url, health_url: connection.health_url, openapi_url: connection.openapi_url, input_schema: connection.input_schema, output_schema: connection.output_schema } : null}
            />
          </section>

          {connection && (
            <>
              <section className="rounded-3xl border border-line bg-ink-900 p-6" aria-labelledby="token-h">
                <h2 id="token-h" className="mb-4 font-medium">
                  Authentication
                </h2>
                <TokenForm agentId={agent.id} hasToken={Boolean(connection.secret_id)} />
              </section>
              <section className="rounded-3xl border border-line bg-ink-900 p-6" aria-labelledby="test-h">
                <h2 id="test-h" className="font-medium">
                  Health & testing
                </h2>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {checks.length === 0 && <li className="text-fg-muted">No checks yet.</li>}
                  {checks.map((c) => (
                    <li key={c.checked_at} className="flex items-center gap-2">
                      {c.ok ? <CheckCircle2 className="size-4 text-cyan" aria-label="Healthy" /> : <XCircle className="size-4 text-danger" aria-label="Failed" />}
                      <span className="text-fg-muted">{new Date(c.checked_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
                      <span className="text-fg-subtle">{c.ok ? `HTTP ${c.status_code} · ${c.latency_ms} ms` : c.error}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 grid gap-6 md:grid-cols-[auto_1fr]">
                  <HealthButton agentId={agent.id} />
                  <TestForm agentId={agent.id} sample={sampleFor((connection.input_schema as Record<string, unknown>) ?? DEFAULT_INPUT_SCHEMA)} />
                </div>
              </section>
            </>
          )}

          <section className="rounded-3xl border border-line bg-ink-900 p-6" aria-labelledby="details-h">
            <h2 id="details-h" className="mb-4 font-medium">
              Listing details
            </h2>
            <EditDetailsForm agentId={agent.id} initial={agent} />
          </section>
          <DeleteAgentForm agentId={agent.id} />
        </div>

        <aside className="h-fit space-y-6">
          <section className="rounded-3xl border border-line bg-ink-900 p-5">
            <h2 className="font-medium">Checklist</h2>
            <ol className="mt-3 space-y-2.5 text-sm">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  {s.done ? <CheckCircle2 className="size-5 text-cyan" aria-label="Done" /> : <Circle className="size-5 text-fg-subtle" aria-label="Not done" />}
                  <span className={s.done ? "text-fg-muted" : ""}>{s.label}</span>
                </li>
              ))}
            </ol>
          </section>
          {agent.status !== "suspended" && (
            <section className="rounded-3xl border border-line bg-ink-900 p-5">
              <ListingForm agentId={agent.id} status={agent.status} published={agent.published} healthy={healthy} />
            </section>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
