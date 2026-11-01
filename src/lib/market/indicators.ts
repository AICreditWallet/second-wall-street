/**
 * Documented technical indicators. Pure functions over arrays; results align
 * with the input (NaN until enough data exists). Formulas follow the standard
 * definitions (Wilder smoothing for RSI/ATR, 12/26/9 MACD, 20/2 Bollinger).
 */

export interface Bar {
  /** Epoch ms of the bar start. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      // Seed with the SMA of the first `period` values.
      let s = 0;
      for (let j = 0; j < period; j++) s += values[j]!;
      prev = s / period;
      out[i] = prev;
    } else if (i >= period) {
      prev = values[i]! * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i]! - closes[i - 1]!;
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= period) {
      gain += g;
      loss += l;
      if (i === period) {
        gain /= period;
        loss /= period;
        out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      }
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => f[i]! - s[i]!);
  const firstValid = line.findIndex((x) => Number.isFinite(x));
  const sig = new Array<number>(closes.length).fill(NaN);
  if (firstValid >= 0) {
    const tail = ema(line.slice(firstValid), signal);
    tail.forEach((v, i) => (sig[firstValid + i] = v));
  }
  return { line, signal: sig, histogram: line.map((v, i) => v - sig[i]!) };
}

/** Wilder's Average True Range. */
export function atr(bars: Bar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1]!.c), Math.abs(b.l - bars[i - 1]!.c));
    if (i < period) {
      prev = i === 0 ? tr : prev + tr;
      if (i === period - 1) {
        prev /= period;
        out[i] = prev;
      }
    } else {
      prev = (prev * (period - 1) + tr) / period;
      out[i] = prev;
    }
  }
  return out;
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = new Array<number>(closes.length).fill(NaN);
  const lower = new Array<number>(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (closes[j]! - mid[i]!) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = mid[i]! + mult * sd;
    lower[i] = mid[i]! - mult * sd;
  }
  return { mid, upper, lower };
}

/** Cumulative session VWAP using the typical price. */
export function vwap(bars: Bar[]): number[] {
  let pv = 0;
  let vol = 0;
  return bars.map((b) => {
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    vol += b.v;
    return vol ? pv / vol : NaN;
  });
}

/** High/low of the first `minutes` one-minute bars. */
export function openingRange(bars: Bar[], minutes = 15) {
  const w = bars.slice(0, minutes);
  return { high: Math.max(...w.map((b) => b.h)), low: Math.min(...w.map((b) => b.l)), volume: w.reduce((s, b) => s + b.v, 0) };
}

/** Combine one-minute bars into n-minute bars. */
export function resample(bars: Bar[], n: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i += n) {
    const g = bars.slice(i, i + n);
    if (!g.length) break;
    out.push({ t: g[0]!.t, o: g[0]!.o, h: Math.max(...g.map((b) => b.h)), l: Math.min(...g.map((b) => b.l)), c: g[g.length - 1]!.c, v: g.reduce((s, b) => s + b.v, 0) });
  }
  return out;
}

export type CandlePattern = "doji" | "hammer" | "shooting-star" | "bullish-engulfing" | "bearish-engulfing" | "marubozu-up" | "marubozu-down";

/** Classic single- and two-candle patterns on the last bar(s). */
export function candlePatterns(bars: Bar[]): CandlePattern[] {
  const out: CandlePattern[] = [];
  const b = bars[bars.length - 1];
  if (!b) return out;
  const range = b.h - b.l || 1e-9;
  const body = Math.abs(b.c - b.o);
  const upper = b.h - Math.max(b.o, b.c);
  const lower = Math.min(b.o, b.c) - b.l;
  if (body / range < 0.1) out.push("doji");
  else if (lower >= 2 * body && upper <= body * 0.5) out.push("hammer");
  else if (upper >= 2 * body && lower <= body * 0.5) out.push("shooting-star");
  if (body / range > 0.9) out.push(b.c > b.o ? "marubozu-up" : "marubozu-down");
  const p = bars[bars.length - 2];
  if (p) {
    if (p.c < p.o && b.c > b.o && b.c >= p.o && b.o <= p.c) out.push("bullish-engulfing");
    if (p.c > p.o && b.c < b.o && b.c <= p.o && b.o >= p.c) out.push("bearish-engulfing");
  }
  return out;
}

export const last = (xs: number[]) => xs[xs.length - 1] ?? NaN;
