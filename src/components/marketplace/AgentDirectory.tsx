"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bot, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HealthBadge, Stars } from "./ReviewSection";

export interface DirectoryAgent {
  id: string;
  slug: string;
  name: string;
  summary: string;
  category: string;
  status: "in-development" | "preview" | "live";
  orgName: string;
  orgSlug: string;
  community: boolean;
  rating?: { average: number; count: number };
  health?: { ok: boolean; checkedAt: string; latencyMs: number | null };
}

const STATUS = { "in-development": "In development", preview: "Preview", live: "Live" } as const;

export function AgentDirectory({ agents, categories }: { agents: DirectoryAgent[]; categories: string[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"rating" | "name" | "live">("live");

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = agents.filter((a) => (!category || a.category === category) && (!term || `${a.name} ${a.summary} ${a.orgName} ${a.category}`.toLowerCase().includes(term)));
    const rank = { live: 0, preview: 1, "in-development": 2 } as const;
    return list.sort((a, b) =>
      sort === "rating"
        ? (b.rating?.average ?? 0) - (a.rating?.average ?? 0) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0)
        : sort === "live"
          ? rank[a.status] - rank[b.status] || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    );
  }, [agents, category, q, sort]);

  const present = categories.filter((c) => agents.some((a) => a.category === c));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-11 w-full max-w-sm items-center gap-2 rounded-full border border-line bg-ink-900 px-4">
          <Search className="size-4 text-fg-muted" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents" aria-label="Search agents" maxLength={80} className="h-full w-full bg-transparent text-sm outline-none" />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-11 rounded-full border border-line bg-ink-900 px-3 text-sm text-fg">
            <option value="live">Live first</option>
            <option value="rating">Highest rated</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        <button type="button" aria-pressed={!category} onClick={() => setCategory(null)} className={`h-9 rounded-full border px-3.5 text-xs ${!category ? "border-cyan/50 bg-cyan/15 text-cyan-soft" : "border-line text-fg-muted hover:text-fg"}`}>
          All ({agents.length})
        </button>
        {present.map((c) => (
          <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={`h-9 rounded-full border px-3.5 text-xs ${category === c ? "border-cyan/50 bg-cyan/15 text-cyan-soft" : "border-line text-fg-muted hover:text-fg"}`}>
            {c}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="mt-10 text-fg-muted">No agents match. Try another search or category.</p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((a) => (
            <li key={a.id}>
              <Link href={`/agents/${a.slug}`} className="flex h-full flex-col rounded-2xl border border-line bg-ink-900 p-5 transition-colors hover:border-cyan/40">
                <span className="flex items-center justify-between gap-2">
                  <Bot className="size-5 text-cyan" aria-hidden="true" />
                  <Badge tone={a.status === "live" ? "cyan" : "muted"}>{STATUS[a.status]}</Badge>
                </span>
                <span className="mt-4 font-medium">{a.name}</span>
                <span className="text-xs text-fg-subtle">{a.orgName}</span>
                <span className="mt-2 flex-1 text-sm text-fg-muted">{a.summary}</span>
                <span className="mt-4 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                  {a.category}
                  {a.rating && (
                    <span className="inline-flex items-center gap-1">
                      · <Stars value={a.rating.average} size="size-3.5" /> {a.rating.average.toFixed(1)} ({a.rating.count})
                    </span>
                  )}
                </span>
                {a.community && (
                  <span className="mt-3">
                    <HealthBadge health={a.health} />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
