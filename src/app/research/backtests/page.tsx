import type { Metadata } from "next";
import { PageShell } from "@/components/site/page-shell";
import { DataNotice } from "@/components/research/DataNotice";
import { EquityChart } from "@/components/research/EquityChart";
import { getBacktest } from "@/lib/firm/server";
import { getProvider } from "@/lib/market/provider";
import type { Metrics } from "@/lib/research/backtest";

export const revalidate = 300;
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Strategy back-tests",
  description: "Walk-forward, out-of-sample back-tests of the Open15 opening-window strategies, with costs and slippage.",
  alternates: { canonical: "/research/backtests" },
};

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

function MetricCells({ m }: { m: Metrics }) {
  return (
    <>
      <td className="px-3 py-2.5 tabular-nums">{m.trades}</td>
      <td className="px-3 py-2.5 tabular-nums">{m.winRate}%</td>
      <td className="px-3 py-2.5 tabular-nums">{m.avgTradeBps} bps</td>
      <td className="px-3 py-2.5 tabular-nums">{pct(m.totalReturnPct)}</td>
      <td className="px-3 py-2.5 tabular-nums">-{m.maxDrawdownPct.toFixed(2)}%</td>
      <td className="px-3 py-2.5 tabular-nums">{m.sharpe}</td>
    </>
  );
}

const HEAD = ["Trades", "Win rate", "Avg trade", "Total", "Max drawdown", "Sharpe"];

export default async function BacktestsPage() {
  const r = await getBacktest();
  const p = getProvider();
  return (
    <PageShell
      eyebrow="Open15 AI · research lab"
      title="How the opening-window strategies held up"
      intro={<p>Each strategy picks its setting using earlier sessions only, then is scored on the next block of sessions it has never seen (walk-forward, out-of-sample). Costs and slippage are charged on every trade.</p>}
    >
      <DataNotice freshness={r.provider.freshness} note={p.licenseNote} />
      <p className="mt-6 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm font-medium">
        Hypothetical results. Back-tests are not a promise of future returns.
      </p>

      <section aria-labelledby="oos" className="mt-10">
        <h2 id="oos" className="text-lg font-semibold">Out-of-sample results ({r.from} → {r.to})</h2>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Out-of-sample and in-sample metrics per strategy</caption>
            <thead className="bg-ink-900 text-xs text-fg-subtle">
              <tr>
                <th scope="col" className="px-3 py-2.5">Strategy</th>
                {HEAD.map((h) => <th key={h} scope="col" className="px-3 py-2.5">{h}</th>)}
                <th scope="col" className="px-3 py-2.5">In-sample total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.strategies.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="px-3 py-2.5 font-medium">
                    {s.name}
                    <span className="block text-xs font-normal text-fg-subtle">{s.description}</span>
                  </th>
                  <MetricCells m={s.outOfSample} />
                  <td className="px-3 py-2.5 tabular-nums text-fg-muted">{pct(s.inSample.totalReturnPct)}</td>
                </tr>
              ))}
              <tr className="bg-ink-900/60">
                <th scope="row" className="px-3 py-2.5 font-medium">{r.benchmark.name}</th>
                <MetricCells m={r.benchmark.metrics} />
                <td className="px-3 py-2.5 text-fg-subtle">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">In-sample uses the default setting over the whole period and is shown only to compare — out-of-sample is the honest number.</p>
      </section>

      <section aria-labelledby="equity" className="mt-12 rounded-2xl border border-line bg-ink-900 p-5">
        <h2 id="equity" className="font-semibold">Out-of-sample equity (start = 100)</h2>
        <div className="mt-4">
          <EquityChart series={r.strategies.map((s) => ({ name: s.name, values: s.equity.map((e) => e.value) }))} benchmark={r.benchmark.equity.map((e) => e.value)} />
        </div>
      </section>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <section aria-labelledby="assumptions" className="rounded-2xl border border-line bg-ink-900 p-5">
          <h2 id="assumptions" className="font-semibold">Assumptions</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">{r.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
        <section aria-labelledby="params" className="rounded-2xl border border-line bg-ink-900 p-5">
          <h2 id="params" className="font-semibold">Settings chosen by walk-forward</h2>
          <ul className="mt-3 space-y-2 text-sm text-fg-muted">
            {r.strategies.map((s) => (
              <li key={s.id}>
                <span className="text-fg">{s.name}</span> — {s.paramName}: {s.chosenParams.map((c) => c.value).join(" → ")}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
