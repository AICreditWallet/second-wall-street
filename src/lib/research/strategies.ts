import type { OpeningFeatures } from "./features";

/**
 * Strategy registry. Each strategy reads only the 9:45 ET features and returns
 * a direction plus the evidence behind it. Strategies are evaluated one by one
 * in back-tests — combining more of them is not assumed to be better.
 */
export type Direction = "up" | "down" | "none";

export interface Signal {
  direction: Direction;
  /** 0–1 */
  strength: number;
  evidence: string[];
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  /** Tunable threshold; back-tests choose it on training data only (walk-forward). */
  param: { name: string; values: number[]; default: number };
  evaluate(f: OpeningFeatures, param: number): Signal;
}

const NONE: Signal = { direction: "none", strength: 0, evidence: [] };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;

export const STRATEGIES: Strategy[] = [
  {
    id: "gap-and-go",
    name: "Gap and go",
    description: "A sizeable overnight gap that keeps moving in the gap's direction and holds the right side of VWAP by 9:45.",
    param: { name: "min gap %", values: [1.5, 2.5, 4], default: 2.5 },
    evaluate(f, minGap) {
      if (Math.abs(f.gapPct) < minGap) return NONE;
      const up = f.gapPct > 0;
      const holds = up ? f.price > f.open && f.price > f.vwap : f.price < f.open && f.price < f.vwap;
      if (!holds) return NONE;
      return {
        direction: up ? "up" : "down",
        strength: clamp(Math.abs(f.gapPct) / 8 + Math.abs(f.momentumPct) / 4),
        evidence: [`Gapped ${pct(f.gapPct)} vs the prior close`, `Moved ${pct(f.momentumPct)} since the open`, `Price ${up ? "above" : "below"} VWAP at 9:45`],
      };
    },
  },
  {
    id: "orb",
    name: "Opening-range breakout setup",
    description: "Price finishes the window pressed against the opening-range high or low on heavy relative volume.",
    param: { name: "min relative volume", values: [1.2, 1.8, 2.5], default: 1.8 },
    evaluate(f, minRvol) {
      if (!(f.relVolume >= minRvol)) return NONE;
      const range = f.orHigh - f.orLow || 1e-9;
      const loc = (f.price - f.orLow) / range;
      if (loc >= 0.85) return { direction: "up", strength: clamp((f.relVolume - 1) / 4 + (loc - 0.85) * 2), evidence: [`Closing the window in the top ${Math.round((1 - loc) * 100 + 1)}% of its range`, `Relative volume ${f.relVolume.toFixed(1)}×`, `Opening range ${f.orRangePct.toFixed(2)}% wide`] };
      if (loc <= 0.15) return { direction: "down", strength: clamp((f.relVolume - 1) / 4 + (0.15 - loc) * 2), evidence: [`Closing the window near the range low`, `Relative volume ${f.relVolume.toFixed(1)}×`, `Opening range ${f.orRangePct.toFixed(2)}% wide`] };
      return NONE;
    },
  },
  {
    id: "vwap-trend",
    name: "VWAP trend",
    description: "A clean move away from VWAP in the direction of the session's momentum.",
    param: { name: "min distance from VWAP %", values: [0.2, 0.4, 0.8], default: 0.4 },
    evaluate(f, minDist) {
      const dist = (f.price / f.vwap - 1) * 100;
      if (Math.abs(dist) < minDist || Math.sign(dist) !== Math.sign(f.momentumPct)) return NONE;
      return { direction: dist > 0 ? "up" : "down", strength: clamp(Math.abs(dist) / 2), evidence: [`${pct(dist)} from VWAP`, `Momentum ${pct(f.momentumPct)} in the same direction`] };
    },
  },
  {
    id: "rvol-momentum",
    name: "Relative-volume momentum",
    description: "Unusually heavy trading plus a decisive first-15-minute move.",
    param: { name: "min relative volume", values: [1.5, 2.5, 4], default: 2.5 },
    evaluate(f, minRvol) {
      if (!(f.relVolume >= minRvol) || Math.abs(f.momentumPct) < 0.5) return NONE;
      return { direction: f.momentumPct > 0 ? "up" : "down", strength: clamp(f.relVolume / 8 + Math.abs(f.momentumPct) / 4), evidence: [`Relative volume ${f.relVolume.toFixed(1)}×`, `Moved ${pct(f.momentumPct)} in 15 minutes`] };
    },
  },
  {
    id: "gap-fade",
    name: "Gap fade (mean reversion)",
    description: "A large gap that is already reversing, often with a reversal candle, against stretched daily conditions.",
    param: { name: "min gap %", values: [3, 4.5, 6], default: 4.5 },
    evaluate(f, minGap) {
      if (Math.abs(f.gapPct) < minGap) return NONE;
      const up = f.gapPct > 0;
      const reversing = up ? f.price < f.open && f.price < f.vwap : f.price > f.open && f.price > f.vwap;
      if (!reversing) return NONE;
      const reversal = f.patterns.filter((p) => (up ? ["shooting-star", "bearish-engulfing"] : ["hammer", "bullish-engulfing"]).includes(p));
      return {
        direction: up ? "down" : "up",
        strength: clamp(Math.abs(f.gapPct) / 10 + reversal.length * 0.2),
        evidence: [`Gapped ${pct(f.gapPct)} but reversing (${pct(f.momentumPct)} since open)`, ...(reversal.length ? [`Reversal pattern: ${reversal.join(", ")}`] : [])],
      };
    },
  },
];

export const strategyById = new Map(STRATEGIES.map((s) => [s.id, s]));
