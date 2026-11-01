import { previousTradingDay, tradingDaysBack, type ISODate } from "@/lib/market/calendar";
import type { MarketDataProvider } from "@/lib/market/provider";
import { openingFeatures, passesFilters, WINDOW, type OpeningFeatures } from "./features";
import { STRATEGIES, type Strategy } from "./strategies";

/**
 * Reproducible back-test of the opening-window strategies.
 * - Entry at the open of the 9:46 bar; exit at 10:30 ET or at the opposite side
 *   of the opening range (stop), whichever comes first.
 * - Costs: slippage + commission on both sides.
 * - No look-ahead: signals use 9:30–9:45 only. No survivorship bias: each day
 *   uses the instruments that traded that day, including later-delisted ones.
 * - Walk-forward: a strategy's threshold is chosen on earlier sessions only and
 *   applied to the next block of unseen sessions (out-of-sample).
 */

export interface BacktestConfig {
  sessions: number;
  foldSize: number;
  slippageBps: number;
  costBps: number;
  exitMinute: number;
}

export const DEFAULT_CONFIG: BacktestConfig = { sessions: 120, foldSize: 20, slippageBps: 5, costBps: 1, exitMinute: 60 };

export interface Metrics {
  trades: number;
  days: number;
  winRate: number;
  avgTradeBps: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  sharpe: number;
}

export interface StrategyResult {
  id: string;
  name: string;
  description: string;
  paramName: string;
  chosenParams: { from: ISODate; value: number }[];
  inSample: Metrics;
  outOfSample: Metrics;
  equity: { date: ISODate; value: number }[];
}

export interface BacktestReport {
  from: ISODate;
  to: ISODate;
  config: BacktestConfig;
  provider: { id: string; label: string; freshness: string };
  strategies: StrategyResult[];
  benchmark: { name: string; metrics: Metrics; equity: { date: ISODate; value: number }[] };
  assumptions: string[];
}

interface Trade {
  date: ISODate;
  ret: number;
}

const tradeCache = new Map<string, number | null>();

/** One trade's net return; memoised so each (instrument, day, direction) is simulated once. */
function tradeReturn(p: MarketDataProvider, f: OpeningFeatures, date: ISODate, dir: 1 | -1, cfg: BacktestConfig): number | null {
  const key = `${p.id}|${f.symbol}|${date}|${dir}|${cfg.exitMinute}|${cfg.slippageBps}|${cfg.costBps}`;
  if (tradeCache.has(key)) return tradeCache.get(key)!;
  const r = computeTrade(p, f, date, dir, cfg);
  if (tradeCache.size > 50_000) tradeCache.clear();
  tradeCache.set(key, r);
  return r;
}

function computeTrade(p: MarketDataProvider, f: OpeningFeatures, date: ISODate, dir: 1 | -1, cfg: BacktestConfig): number | null {
  const bars = p.intraday(f.symbol, date);
  if (bars.length <= cfg.exitMinute) return null;
  const friction = (cfg.slippageBps + cfg.costBps) / 10_000;
  const entry = bars[WINDOW]!.o;
  const stop = dir === 1 ? f.orLow : f.orHigh;
  let exit = bars[cfg.exitMinute - 1]!.c;
  for (let i = WINDOW; i < cfg.exitMinute; i++) {
    const b = bars[i]!;
    if (dir === 1 && b.l <= stop) {
      exit = Math.min(stop, b.o);
      break;
    }
    if (dir === -1 && b.h >= stop) {
      exit = Math.max(stop, b.o);
      break;
    }
  }
  return dir * (exit / entry - 1) - 2 * friction;
}

export function metrics(trades: Trade[]): Metrics {
  const byDay = new Map<ISODate, number[]>();
  for (const t of trades) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t.ret]);
  const daily = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, rs]) => rs.reduce((a, b) => a + b, 0) / rs.length);
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of daily) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, 1 - equity / peak);
  }
  const mean = daily.length ? daily.reduce((a, b) => a + b, 0) / daily.length : 0;
  const sd = daily.length > 1 ? Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / (daily.length - 1)) : 0;
  return {
    trades: trades.length,
    days: daily.length,
    winRate: trades.length ? Math.round((trades.filter((t) => t.ret > 0).length / trades.length) * 1000) / 10 : 0,
    avgTradeBps: trades.length ? Math.round((trades.reduce((a, t) => a + t.ret, 0) / trades.length) * 10_000 * 10) / 10 : 0,
    totalReturnPct: Math.round((equity - 1) * 10_000) / 100,
    maxDrawdownPct: Math.round(maxDd * 10_000) / 100,
    sharpe: sd > 0 ? Math.round((mean / sd) * Math.sqrt(252) * 100) / 100 : 0,
  };
}

function equityCurve(days: ISODate[], trades: Trade[]) {
  const byDay = new Map<ISODate, number[]>();
  for (const t of trades) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t.ret]);
  let v = 100;
  return days.map((d) => {
    const rs = byDay.get(d);
    if (rs) v *= 1 + rs.reduce((a, b) => a + b, 0) / rs.length;
    return { date: d, value: Math.round(v * 100) / 100 };
  });
}

export function runBacktests(p: MarketDataProvider, endDate: ISODate, cfg: BacktestConfig = DEFAULT_CONFIG): BacktestReport {
  const days = tradingDaysBack(previousTradingDay(endDate), cfg.sessions);
  // One pass: features for every eligible instrument on every day.
  const perDay = days.map((date) => ({
    date,
    feats: p
      .universe(date)
      .map((i) => openingFeatures(p, i, date))
      .filter((f): f is OpeningFeatures => Boolean(f && passesFilters(f))),
  }));

  const tradesFor = (s: Strategy, value: number, slice: typeof perDay): Trade[] => {
    const out: Trade[] = [];
    for (const { date, feats } of slice) {
      for (const f of feats) {
        const sig = s.evaluate(f, value);
        if (sig.direction === "none") continue;
        const r = tradeReturn(p, f, date, sig.direction === "up" ? 1 : -1, cfg);
        if (r !== null) out.push({ date, ret: r });
      }
    }
    return out;
  };

  const results: StrategyResult[] = STRATEGIES.map((s) => {
    // Pre-compute trades per parameter value once.
    const byValue = new Map(s.param.values.map((v) => [v, tradesFor(s, v, perDay)]));
    const inSample: Trade[] = [];
    const outOfSample: Trade[] = [];
    const chosen: { from: ISODate; value: number }[] = [];
    for (let start = cfg.foldSize; start < days.length; start += cfg.foldSize) {
      const train = new Set(days.slice(0, start));
      const test = new Set(days.slice(start, start + cfg.foldSize));
      let best = s.param.default;
      let bestScore = -Infinity;
      for (const [v, ts] of byValue) {
        const tr = ts.filter((t) => train.has(t.date));
        if (tr.length < 10) continue;
        const m = tr.reduce((a, t) => a + t.ret, 0) / tr.length;
        if (m > bestScore) {
          bestScore = m;
          best = v;
        }
      }
      chosen.push({ from: [...test][0]!, value: best });
      const all = byValue.get(best)!;
      outOfSample.push(...all.filter((t) => test.has(t.date)));
      if (start === cfg.foldSize) inSample.push(...all.filter((t) => train.has(t.date)));
    }
    // In-sample: the default threshold over the whole period, for comparison.
    const fullDefault = byValue.get(s.param.default)!;
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      paramName: s.param.name,
      chosenParams: chosen,
      inSample: metrics(fullDefault),
      outOfSample: metrics(outOfSample),
      equity: equityCurve(days.slice(cfg.foldSize), outOfSample),
    };
  });

  // Benchmark: long every eligible instrument at 9:46, exit 10:30, same costs.
  const bench: Trade[] = [];
  for (const { date, feats } of perDay.slice(cfg.foldSize)) {
    for (const f of feats) {
      const r = tradeReturn(p, f, date, 1, { ...cfg });
      if (r !== null) bench.push({ date, ret: r });
    }
  }

  return {
    from: days[0]!,
    to: days[days.length - 1]!,
    config: cfg,
    provider: { id: p.id, label: p.label, freshness: p.freshness },
    strategies: results,
    benchmark: { name: "Equal-weight long, all eligible (9:46 → 10:30)", metrics: metrics(bench), equity: equityCurve(days.slice(cfg.foldSize), bench) },
    assumptions: [
      `${cfg.sessions} sessions ending ${days[days.length - 1]}; walk-forward blocks of ${cfg.foldSize} sessions (first block used for training only).`,
      `Entry at the 9:46 open; exit at ${cfg.exitMinute === 60 ? "10:30" : `minute ${cfg.exitMinute}`} ET or at the opposite side of the opening range.`,
      `Costs: ${cfg.slippageBps} bps slippage + ${cfg.costBps} bp commission per side.`,
      "Signals use only 9:30–9:45 data (no look-ahead). Delisted instruments are included while they traded (no survivorship bias).",
      p.freshness === "simulated" ? "HYPOTHETICAL results on SIMULATED data. They say nothing about real markets or future returns." : "Hypothetical results; past performance does not predict future returns.",
    ],
  };
}
