"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Bot, Building2, Info, Workflow as WorkflowIcon } from "lucide-react";
import type { CityIndex } from "@/lib/city/queries";
import { TIER_LABEL } from "@/lib/city/queries";
import { floorDirectory, TEMPLATE_LABEL, type ResolvedInterior } from "@/lib/city/interiors";
import type { Agent } from "@/lib/city/types";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { FloorRow, PanelHeader, PanelShell } from "./BuildingPanel";

const STATUS: Record<Agent["status"], { label: string; note: string }> = {
  "in-development": { label: "In development", note: "This agent is not running yet. The workstation shows where it will work." },
  preview: { label: "Preview", note: "Preview listing. The agent is not processing requests yet." },
  live: { label: "Live", note: "This agent is available." },
};

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export function LobbyPanel({ index, buildingId, onClose, onEnterOffice }: { index: CityIndex; buildingId: string; onClose: () => void; onEnterOffice: (id: string) => void }) {
  const building = index.buildingById.get(buildingId);
  const offices = index.officesByBuilding.get(buildingId) ?? [];
  if (!building) return null;
  return (
    <PanelShell label={`${building.name} lobby`}>
      <PanelHeader eyebrow={<>Lobby</>} title={building.name} subtitle="Choose a floor to visit." onClose={onClose} closeLabel="Leave the building" />
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 safe-bottom">
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line" aria-label="Floor directory">
          {floorDirectory(offices).map((o) => (
            <FloorRow key={o.id} office={o} orgName={o.organizationId ? index.orgById.get(o.organizationId)?.name : undefined} canEnter onEnter={() => onEnterOffice(o.id)} />
          ))}
        </ul>
        <p className="mt-3 text-xs text-fg-subtle">Tip: you can also click the elevators or the directory screen in the lobby.</p>
      </div>
    </PanelShell>
  );
}

export function OfficeInteriorPanel({
  index,
  officeId,
  interior,
  selectedAgentId,
  showWorkflow,
  onSelectAgent,
  onToggleWorkflow,
  onClose,
}: {
  index: CityIndex;
  officeId: string;
  interior: ResolvedInterior;
  selectedAgentId: string | null;
  showWorkflow: boolean;
  onSelectAgent: (id: string | null) => void;
  onToggleWorkflow: () => void;
  onClose: () => void;
}) {
  const office = index.snapshot.offices.find((o) => o.id === officeId);
  if (!office) return null;
  const building = index.buildingById.get(office.buildingId);
  const org = office.organizationId ? index.orgById.get(office.organizationId) : undefined;
  const agents = interior.agents.map((id) => (id ? index.snapshot.agents.find((a) => a.id === id) : undefined));
  const placed = agents.filter((a): a is Agent => Boolean(a));
  const agent = selectedAgentId ? placed.find((a) => a.id === selectedAgentId) : undefined;
  const tasks = index.snapshot.activity?.tasks ?? {};
  const run = org ? index.snapshot.activity?.runs[org.slug] : undefined;

  if (agent) {
    const status = STATUS[agent.status];
    return (
      <PanelShell label={`${agent.name} workstation`}>
        <PanelHeader eyebrow={<>AI agent workstation</>} title={agent.name} subtitle={org?.name} onClose={() => onSelectAgent(null)} closeLabel="Back to office" />
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 safe-bottom">
          <div className="flex flex-wrap gap-2">
            <Badge tone={agent.status === "live" ? "cyan" : "gold"}>{status.label}</Badge>
            <Badge>{agent.category}</Badge>
          </div>
          <p className="text-sm leading-relaxed text-fg-muted">{agent.summary}</p>
          {tasks[agent.id] && (
            <section className="rounded-xl border border-cyan/30 bg-cyan/5 p-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">Latest task</h3>
              <p className="mt-1 text-sm">{tasks[agent.id]!.summary ?? (tasks[agent.id]!.status === "succeeded" ? "Completed" : "Did not complete")}</p>
              <p className="mt-1 text-xs text-fg-subtle">
                {tasks[agent.id]!.status === "succeeded" ? "Completed" : tasks[agent.id]!.status} · {timeFmt.format(new Date(tasks[agent.id]!.at))}
              </p>
              <Link href={`/workflows/${tasks[agent.id]!.runId}`} className="mt-2 inline-flex items-center gap-1 text-sm text-cyan-soft hover:underline">
                See the full run <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </section>
          )}
          <p className="flex gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-xs text-fg-muted">
            <Info className="size-4 shrink-0" aria-hidden="true" /> {status.note}
          </p>
          {agent.capabilities.length > 0 && (
            <section>
              <h3 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">Capabilities</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {agent.capabilities.map((c) => (
                  <li key={c}>
                    <Badge tone="cyan">{c}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-fg-subtle">Developer</h3>
            <p className="mt-1 text-sm">{org?.name}</p>
          </section>
          {agent.disclosure && <p className="border-t border-line pt-3 text-xs text-fg-subtle">{agent.disclosure}</p>}
          <div className="flex flex-wrap gap-2">
            <Link href={`/agents/${agent.slug}`} className={buttonClass("primary", "min-h-10")}>
              Agent profile <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <button type="button" onClick={() => onSelectAgent(null)} className={buttonClass("secondary", "min-h-10")}>
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to office
            </button>
          </div>
        </div>
      </PanelShell>
    );
  }

  const free = office.status === "available" && office.tier === "standard";
  return (
    <PanelShell label={`${office.label} office`}>
      <PanelHeader
        eyebrow={
          <>
            <Building2 className="size-3.5" aria-hidden="true" /> {building?.name} · {office.label}
          </>
        }
        title={org?.name ?? "Available office"}
        subtitle={TEMPLATE_LABEL[interior.template]}
        onClose={onClose}
        closeLabel="Back to the lobby"
      />
      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 safe-bottom">
        <div className="flex flex-wrap gap-2">
          <Badge tone={office.tier === "standard" ? "cyan" : "gold"}>{TIER_LABEL[office.tier]}</Badge>
          {office.status === "available" ? <Badge tone="cyan">Available</Badge> : <Badge>{office.status === "platform" ? "Platform office" : "Occupied"}</Badge>}
        </div>

        {office.status === "available" ? (
          <section className="space-y-3">
            <p className="text-sm leading-relaxed text-fg-muted">
              This is how a {TEMPLATE_LABEL[interior.template].toLowerCase()} looks. Claim it and your organisation and AI agents move in.
            </p>
            <Link href={`/claim/${encodeURIComponent(office.id)}`} className={buttonClass(free ? "primary" : "secondary", "min-h-10 w-full")}>
              {free ? "Claim this office — free" : "Join the premium waitlist"}
            </Link>
          </section>
        ) : (
          org && <p className="text-sm leading-relaxed text-fg-muted">{org.tagline || org.description}</p>
        )}

        {placed.length > 0 && (
          <section aria-labelledby="ws-h">
            <h3 id="ws-h" className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
              Agent workstations
            </h3>
            <ul className="mt-2 space-y-2">
              {placed.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onSelectAgent(a.id)} className="flex w-full items-center gap-2 rounded-2xl border border-line bg-white/[0.03] p-3 text-left hover:border-cyan/40">
                    <Bot className="size-4 shrink-0 text-cyan" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{a.name}</span>
                      <span className="block truncate text-xs text-fg-subtle">{a.category}</span>
                    </span>
                    <span className="text-right text-[11px] text-fg-subtle">
                      {STATUS[a.status].label}
                      {tasks[a.id] && <span className="block text-cyan-soft">{tasks[a.id]!.status === "succeeded" ? "✓ ran" : "✕ failed"} {timeFmt.format(new Date(tasks[a.id]!.at)).split(", ").pop()}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {run && placed.length >= 2 && (
              <>
                <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={showWorkflow} onChange={onToggleWorkflow} className="size-4 accent-cyan-400" />
                  <WorkflowIcon className="size-4 text-fg-muted" aria-hidden="true" />
                  Show the hand-offs from the latest run
                </label>
                <Link href={`/workflows/${run.runId}`} className={buttonClass("secondary", "mt-2 min-h-10 w-full")}>
                  Watch the latest run step by step
                </Link>
              </>
            )}
          </section>
        )}

        <p className="flex gap-2 text-xs text-fg-subtle">
          <Info className="size-4 shrink-0" aria-hidden="true" />
          People in the office are illustrative animations, not real users. Click an agent workstation or the floor to look around.
        </p>
      </div>
    </PanelShell>
  );
}
