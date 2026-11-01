import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { PageShell } from "@/components/site/page-shell";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DataNotice } from "@/components/research/DataNotice";
import { MiniChart } from "@/components/research/MiniChart";
import { getOpen15, getOpen15History } from "@/lib/firm/server";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Open15 research",
  description: "Opening-session research from Open15 AI: what stood out in the 9:30–9:45 ET window, why, and how it was measured.",
  alternates: { canonical: "/research" },
};

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const day = (d: string) => dateFmt.format(new Date(`${d}T12:00:00Z`));

function Direction({ d }: { d: string }) {
  if (d === "up") return <span className="inline-flex items-center gap-1 text-cyan-soft"><ArrowUpRight className="size-4" aria-hidden="true" /> Up</span>;
  if (d === "down") return <span className="inline-flex items-center gap-1 text-danger"><ArrowDownRight className="size-4" aria-hidden="true" /> Down</span>;
  return <span className="inline-flex items-center gap-1 text-fg-muted"><Minus className="size-4" aria-hidden="true" /> Mixed</span>;
}

export default async function ResearchPage() {
  const [{ report }, history] = await Promise.all([getOpen15(), getOpen15History(10)]);
  const b = report.breadth;
  return (
    <PageShell
      eyebrow="Open15 AI · opening-session research"
      title={`What stood out at the open — ${day(report.sessionDate)}`}
      intro={<p>Every trading day, the Open15 agents read the first 15 minutes (9:30–9:45 ET), measure each instrument with documented indicators and rank what was unusual. Each line below shows its evidence.</p>}
    >
      <DataNotice freshness={report.provider.freshness} note={report.provider.licenseNote} />

      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/research/backtests" variant="secondary">Strategy back-tests</ButtonLink>
        <ButtonLink href="/workflows" variant="secondary">See the agents work</ButtonLink>
      </div>

      <section aria-labelledby="breadth" className="mt-10">
        <h2 id="breadth" className="text-lg font-semibold">Market at 9:45 ET</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Advancing / declining", `${b.advancing} / ${b.declining}`],
            ["Average gap", `${b.avgGapPct > 0 ? "+" : ""}${b.avgGapPct}%`],
            ["Average relative volume", `${b.avgRelVolume}×`],
            ["Leading / lagging sector", `${b.leadingSector} / ${b.laggingSector}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-ink-900 p-4">
              <dt className="text-xs text-fg-subtle">{k}</dt>
              <dd className="mt-1 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-fg-subtle">
          {report.universeSize} instruments scanned, {report.eligible} passed the filters. Window {timeFmt.format(new Date(report.windowStartUtc))}–{timeFmt.format(new Date(report.windowEndUtc))}.
        </p>
      </section>

      <section aria-labelledby="ranked" className="mt-12">
        <h2 id="ranked" className="text-lg font-semibold">Ranked unusual activity</h2>
        <p className="mt-1 text-sm text-fg-muted">A high rank means unusual activity, not a prediction. Dashed lines: opening range. Gold line: VWAP.</p>
        <ol className="mt-5 grid gap-4 md:grid-cols-2">
          {report.candidates.map((c) => (
            <li key={c.symbol} className="rounded-2xl border border-line bg-ink-900 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-fg-subtle">#{c.rank} · {c.sector}</p>
                  <h3 className="mt-0.5 font-semibold">{c.symbol} <span className="font-normal text-fg-muted">{c.name}</span></h3>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums">{c.score.toFixed(1)}</p>
                  <Direction d={c.direction} />
                </div>
              </div>
              <MiniChart bars={c.chart} vwap={c.vwapSeries} orHigh={c.metrics.orHigh} orLow={c.metrics.orLow} label={`${c.symbol} one-minute candles 9:30 to 9:45 with VWAP`} />
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {[
                  ["Gap", `${c.metrics.gapPct > 0 ? "+" : ""}${c.metrics.gapPct}%`],
                  ["Move 9:30–9:45", `${c.metrics.momentumPct > 0 ? "+" : ""}${c.metrics.momentumPct}%`],
                  ["Relative volume", `${c.metrics.relVolume}×`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-fg-subtle">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {c.conditions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.conditions.map((x) => <Badge key={x} tone="cyan">{x}</Badge>)}
                </div>
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-cyan-soft">Why it ranked here</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
                  {c.evidence.map((e) => <li key={e}>{e}</li>)}
                </ul>
                <p className="mt-2 text-xs text-fg-subtle">
                  Strategies: {c.strategies.map((s) => `${s.name} (${s.direction})`).join(" · ") || "none signalled"}
                </p>
              </details>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="method" className="rounded-2xl border border-line bg-ink-900 p-5">
          <h2 id="method" className="font-semibold">How this was measured</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">{report.methodology.map((m) => <li key={m}>{m}</li>)}</ul>
        </section>
        <section aria-labelledby="limits" className="rounded-2xl border border-line bg-ink-900 p-5">
          <h2 id="limits" className="font-semibold">Limitations</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">{report.limitations.map((m) => <li key={m}>{m}</li>)}</ul>
          {report.excluded.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-cyan-soft">Excluded instruments ({report.excluded.length})</summary>
              <ul className="mt-2 space-y-1 text-fg-muted">{report.excluded.map((e) => <li key={e.symbol}>{e.symbol}: {e.reason}</li>)}</ul>
            </details>
          )}
        </section>
      </div>

      {history.length > 1 && (
        <section aria-labelledby="history" className="mt-12">
          <h2 id="history" className="text-lg font-semibold">Earlier sessions</h2>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-ink-900">
            {history.map((h) => (
              <li key={h.sessionDate} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-medium">{day(h.sessionDate)}</span>
                <span className="text-fg-muted">{h.top.map((t) => `${t.symbol} (${t.direction})`).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-10 text-xs text-fg-subtle">
        Generated {new Date(report.generatedAt).toUTCString()}. See the <Link href="/legal/risk" className="underline">risk disclosure</Link>.
      </p>
    </PageShell>
  );
}
