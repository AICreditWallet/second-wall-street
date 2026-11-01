import { previousTradingDay, type ISODate } from "@/lib/market/calendar";
import { atr, bollinger, candlePatterns, last, macd, openingRange, resample, rsi, sma, vwap, type Bar, type CandlePattern } from "@/lib/market/indicators";
import type { Instrument, MarketDataProvider } from "@/lib/market/provider";

/**
 * Everything known about one instrument at 9:45 ET. Only bars up to the end
 * of the opening window are used — later data is never read (no look-ahead).
 */
export interface OpeningFeatures {
  symbol: string;
  name: string;
  sector: string;
  prevClose: number;
  prevHigh: number;
  prevLow: number;
  open: number;
  /** Price at 9:45 (close of the 15th one-minute bar). */
  price: number;
  gapPct: number;
  orHigh: number;
  orLow: number;
  orRangePct: number;
  vwap: number;
  /** Opening-window volume ÷ average opening-window volume of the prior 20 sessions. */
  relVolume: number;
  momentumPct: number;
  atrPct: number;
  rsiDaily: number;
  macdHist: number;
  bollingerPos: number;
  sma20: number;
  avgDollarVolume: number;
  patterns: CandlePattern[];
  /** The window's one-minute bars, for charts. */
  windowBars: Bar[];
  vwapSeries: number[];
}

export const WINDOW = 15;

const windowVolCache = new Map<string, number>();
/** Opening-window volume for a session (cached as a single number). */
function windowVolume(p: MarketDataProvider, symbol: string, date: ISODate): number | null {
  const key = `${p.id}|${symbol}|${date}`;
  if (windowVolCache.has(key)) return windowVolCache.get(key)!;
  const bars = p.intraday(symbol, date);
  const v = bars.length >= WINDOW ? bars.slice(0, WINDOW).reduce((s, b) => s + b.v, 0) : null;
  if (v !== null) windowVolCache.set(key, v);
  return v;
}

export function openingFeatures(p: MarketDataProvider, inst: Instrument, date: ISODate): OpeningFeatures | null {
  const bars = p.intraday(inst.symbol, date);
  if (bars.length < WINDOW) return null;
  const windowBars = bars.slice(0, WINDOW);
  const prevDay = previousTradingDay(date);
  const daily = p.daily(inst.symbol, prevDay, 40);
  if (daily.length < 21) return null;
  const prev = daily[daily.length - 1]!;
  const closes = daily.map((d) => d.c);

  // Relative volume vs the same window on the prior 20 sessions.
  let past = 0;
  let n = 0;
  let d = prevDay;
  for (let i = 0; i < 20; i++) {
    const v = windowVolume(p, inst.symbol, d);
    if (v !== null) {
      past += v;
      n++;
    }
    d = previousTradingDay(d);
  }
  const or = openingRange(windowBars, WINDOW);
  const vw = vwap(windowBars);
  const price = windowBars[WINDOW - 1]!.c;
  const bb = bollinger(closes, 20);
  const pos = (last(closes) - last(bb.lower)) / (last(bb.upper) - last(bb.lower) || 1);

  return {
    symbol: inst.symbol,
    name: inst.name,
    sector: inst.sector,
    prevClose: prev.c,
    prevHigh: prev.h,
    prevLow: prev.l,
    open: windowBars[0]!.o,
    price,
    gapPct: (windowBars[0]!.o / prev.c - 1) * 100,
    orHigh: or.high,
    orLow: or.low,
    orRangePct: ((or.high - or.low) / windowBars[0]!.o) * 100,
    vwap: last(vw),
    relVolume: n ? or.volume / (past / n) : NaN,
    momentumPct: (price / windowBars[0]!.o - 1) * 100,
    atrPct: (last(atr(daily, 14)) / prev.c) * 100,
    rsiDaily: last(rsi(closes, 14)),
    macdHist: last(macd(closes).histogram),
    bollingerPos: pos,
    sma20: last(sma(closes, 20)),
    avgDollarVolume: daily.slice(-20).reduce((s, b) => s + b.v * b.c, 0) / 20,
    patterns: candlePatterns(resample(windowBars, 5)),
    windowBars,
    vwapSeries: vw,
  };
}

/** Liquidity and data-quality filter: price ≥ $5 and ≥ $20M average daily dollar volume. */
export function passesFilters(f: OpeningFeatures) {
  return f.price >= 5 && f.avgDollarVolume >= 20_000_000 && Number.isFinite(f.relVolume) && Number.isFinite(f.atrPct);
}
