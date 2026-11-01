import { nyTimeToUtc, type ISODate } from "@/lib/market/calendar";
import type { MarketDataProvider } from "@/lib/market/provider";
import { openingFeatures, passesFilters, WINDOW, type OpeningFeatures } from "./features";
import { STRATEGIES, type Direction } from "./strategies";

/**
 * Open15 AI research pipeline — the ten steps from the product brief:
 *  1 market calendar & session · 2 eligible universe · 3 liquidity/data filters ·
 *  4 premarket context (prior-day levels; no premarket feed) · 5 observe 9:30–9:45 ·
 *  6 indicators · 7 notable conditions · 8 transparent ranking · 9 explanations ·
 *  10 timestamped summary.
 * Research only: no orders, no personalised recommendations.
 */

export const RANKING_WEIGHTS = { relVolume: 0.35, move: 0.25, agreement: 0.25, liquidity: 0.15 } as const;

export interface Candidate {
  rank: number;
  symbol: string;
  name: string;
  sector: string;
  score: number;
  direction: Direction;
  strategies: { id: string; name: string; direction: Direction; strength: number }[];
  evidence: string[];
  conditions: string[];
  metrics: {
    price: number;
    gapPct: number;
    momentumPct: number;
    relVolume: number;
    orHigh: number;
    orLow: number;
    vwap: number;
    atrPct: number;
    rsiDaily: number;
    prevHigh: number;
    prevLow: number;
  };
  chart: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  vwapSeries: number[];
}

export interface Open15Report {
  sessionDate: ISODate;
  windowStartUtc: string;
  windowEndUtc: string;
  generatedAt: string;
  provider: { id: string; label: string; freshness: string; licenseNote: string };
  universeSize: number;
  eligible: number;
  excluded: { symbol: string; reason: string }[];
  breadth: { advancing: number; declining: number; avgGapPct: number; avgRelVolume: number; leadingSector: string; laggingSector: string };
  candidates: Candidate[];
  methodology: string[];
  limitations: string[];
}

function notable(f: OpeningFeatures): string[] {
  const out: string[] = [];
  if (Math.abs(f.gapPct) >= 2) out.push(f.gapPct > 0 ? "Gap up" : "Gap down");
  if (f.relVolume >= 2) out.push("Unusual volume");
  if (f.price > f.prevHigh) out.push("Above prior-day high");
  if (f.price < f.prevLow) out.push("Below prior-day low");
  if (f.orRangePct >= 1.5 * Math.max(0.5, f.atrPct / 3)) out.push("Wide opening range");
  if (f.rsiDaily >= 70) out.push("Daily RSI overbought");
  if (f.rsiDaily <= 30) out.push("Daily RSI oversold");
  return out;
}

export function runOpen15(p: MarketDataProvider, sessionDate: ISODate, top = 8, now = new Date()): Open15Report {
  const universe = p.universe(sessionDate);
  const features: OpeningFeatures[] = [];
  const excluded: { symbol: string; reason: string }[] = [];
  for (const inst of universe) {
    const f = openingFeatures(p, inst, sessionDate);
    if (!f) excluded.push({ symbol: inst.symbol, reason: "Insufficient history" });
    else if (!passesFilters(f)) excluded.push({ symbol: inst.symbol, reason: f.price < 5 ? "Price below $5" : "Average dollar volume below $20M" });
    else features.push(f);
  }

  const scored = features.map((f) => {
    const sigs = STRATEGIES.map((s) => ({ s, sig: s.evaluate(f, s.param.default) }));
    const active = sigs.filter((x) => x.sig.direction !== "none");
    const ups = active.filter((x) => x.sig.direction === "up").length;
    const downs = active.length - ups;
    const direction: Direction = ups > downs ? "up" : downs > ups ? "down" : "none";
    const agreement = active.length ? Math.max(ups, downs) / STRATEGIES.length : 0;
    const liquidity = Math.min(1, Math.log10(f.avgDollarVolume / 2e7) / 2);
    const score =
      RANKING_WEIGHTS.relVolume * Math.min(1, (f.relVolume - 1) / 3) +
      RANKING_WEIGHTS.move * Math.min(1, (Math.abs(f.gapPct) + Math.abs(f.momentumPct)) / 6) +
      RANKING_WEIGHTS.agreement * agreement +
      RANKING_WEIGHTS.liquidity * Math.max(0, liquidity);
    return { f, active, direction, score: Math.max(0, Math.round(score * 1000) / 10) };
  });

  scored.sort((a, b) => b.score - a.score);
  const candidates: Candidate[] = scored.slice(0, top).map(({ f, active, direction, score }, i) => ({
    rank: i + 1,
    symbol: f.symbol,
    name: f.name,
    sector: f.sector,
    score,
    direction,
    strategies: active.map(({ s, sig }) => ({ id: s.id, name: s.name, direction: sig.direction, strength: Math.round(sig.strength * 100) / 100 })),
    evidence: active.length ? active.flatMap(({ sig }) => sig.evidence).filter((e, j, arr) => arr.indexOf(e) === j).slice(0, 6) : ["No strategy conditions met — ranked on volume and movement only"],
    conditions: notable(f),
    metrics: {
      price: f.price,
      gapPct: round2(f.gapPct),
      momentumPct: round2(f.momentumPct),
      relVolume: round2(f.relVolume),
      orHigh: f.orHigh,
      orLow: f.orLow,
      vwap: round2(f.vwap),
      atrPct: round2(f.atrPct),
      rsiDaily: Math.round(f.rsiDaily),
      prevHigh: f.prevHigh,
      prevLow: f.prevLow,
    },
    chart: f.windowBars,
    vwapSeries: f.vwapSeries.map(round2),
  }));

  const bySector = new Map<string, number[]>();
  for (const f of features) bySector.set(f.sector, [...(bySector.get(f.sector) ?? []), f.momentumPct]);
  const sectorAvg = [...bySector].map(([s, xs]) => [s, xs.reduce((a, b) => a + b, 0) / xs.length] as const).sort((a, b) => b[1] - a[1]);

  return {
    sessionDate,
    windowStartUtc: nyTimeToUtc(sessionDate, 9, 30).toISOString(),
    windowEndUtc: nyTimeToUtc(sessionDate, 9, 30 + WINDOW).toISOString(),
    generatedAt: now.toISOString(),
    provider: { id: p.id, label: p.label, freshness: p.freshness, licenseNote: p.licenseNote },
    universeSize: universe.length,
    eligible: features.length,
    excluded,
    breadth: {
      advancing: features.filter((f) => f.momentumPct > 0).length,
      declining: features.filter((f) => f.momentumPct < 0).length,
      avgGapPct: round2(avg(features.map((f) => f.gapPct))),
      avgRelVolume: round2(avg(features.map((f) => f.relVolume))),
      leadingSector: sectorAvg[0]?.[0] ?? "—",
      laggingSector: sectorAvg[sectorAvg.length - 1]?.[0] ?? "—",
    },
    candidates,
    methodology: [
      "Session: NYSE regular-session calendar (holidays, daylight saving); window 9:30–9:45 ET.",
      "Universe: all instruments trading that day; delisted instruments drop out on their last day.",
      "Filters: price ≥ $5 and 20-day average dollar volume ≥ $20M.",
      "Premarket context: prior-day high/low/close only (no premarket feed is connected).",
      "Indicators: gap, VWAP, relative volume vs. the prior 20 sessions' same window, opening range, ATR(14), RSI(14), MACD(12,26,9), Bollinger(20,2), SMA(20), 5-minute candlestick patterns.",
      `Ranking: ${Math.round(RANKING_WEIGHTS.relVolume * 100)}% relative volume, ${Math.round(RANKING_WEIGHTS.move * 100)}% size of gap + move, ${Math.round(RANKING_WEIGHTS.agreement * 100)}% strategy agreement, ${Math.round(RANKING_WEIGHTS.liquidity * 100)}% liquidity.`,
      "Only data up to 9:45 ET is used; nothing after the window is read.",
    ],
    limitations: [
      p.freshness === "simulated" ? "All prices are SIMULATED by Second Wall Street. They are not real market data and the symbols are fictional." : `Data freshness: ${p.freshness}.`,
      "A high rank means unusual activity, not a prediction or a recommendation.",
      "No news, fundamentals or premarket data are used.",
      "Research and education only — not investment advice. No orders are placed.",
    ],
  };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round2 = (x: number) => Math.round(x * 100) / 100;
