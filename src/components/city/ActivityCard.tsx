"use client";

import Link from "next/link";
import { useState } from "react";
import { Activity, ChevronDown, MapPin } from "lucide-react";
import type { CityIndex } from "@/lib/city/queries";
import { workflowById } from "@/lib/firm/workflows";

const STATUS = { running: "Running", awaiting_approval: "Waiting for approval", succeeded: "Completed", failed: "Failed", cancelled: "Cancelled" } as const;
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

/** What the platform's agents did in the latest session, with links to the full run. Real records only. */
export function ActivityCard({ index, onShow, defaultOpen }: { index: CityIndex; onShow: (buildingId: string) => void; defaultOpen: boolean }) {
  // null = follow the default (open on wide screens) until the person toggles it.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? defaultOpen;
  const activity = index.snapshot.activity;
  const items = [...index.activeBuildings.entries()];
  if (!activity || items.length === 0) return null;
  const agentsIn = (workflowId: string) => new Set(workflowById.get(workflowId)?.steps.flatMap((s) => (s.agentId ? [s.agentId] : []))).size;

  return (
    <section aria-labelledby="activity-h" className="glass pointer-events-auto w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl">
      <h2 id="activity-h">
        <button type="button" onClick={() => setChoice(!open)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-sm font-medium">
          <span className="relative flex size-2.5" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2.5 rounded-full bg-cyan" />
          </span>
          Agent activity
          <span className="text-xs font-normal text-fg-subtle">· session {activity.sessionDate}</span>
          <ChevronDown className={`ml-auto size-4 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>
      {open && (
        <div className="px-3.5 pb-3.5">
          <ul className="space-y-2.5">
            {items.map(([buildingId, { org, run }]) => (
              <li key={buildingId} className="rounded-xl border border-line bg-white/[0.03] p-3">
                <p className="text-sm font-medium">{org.name}</p>
                <p className="text-xs text-fg-muted">{workflowById.get(run.workflowId)?.name ?? run.workflowId}</p>
                <p className="mt-1 text-xs text-fg-subtle">
                  <Activity className="mr-1 inline size-3.5 text-cyan" aria-hidden="true" />
                  {STATUS[run.status]} · {agentsIn(run.workflowId)} agents{run.finishedAt ? ` · ${timeFmt.format(new Date(run.finishedAt))}` : ""}
                </p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => onShow(buildingId)} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-xs hover:bg-white/20">
                    <MapPin className="size-3.5" aria-hidden="true" /> Show office
                  </button>
                  <Link href={`/workflows/${run.runId}`} className="inline-flex min-h-9 items-center rounded-full bg-cyan px-3 text-xs font-medium text-ink-950 hover:bg-cyan-soft">
                    Watch the run
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] leading-snug text-fg-subtle">
            Beams mark offices whose agents ran. Built-in agents on simulated market data — research only. <Link href="/research" className="underline">Today&apos;s research</Link>
          </p>
        </div>
      )}
    </section>
  );
}
