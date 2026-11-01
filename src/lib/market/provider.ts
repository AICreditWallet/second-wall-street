import { mulberry32 } from "@/lib/city/generator";
import { isTradingDay, nyTimeToUtc, previousTradingDay, tradingDaysBack, type ISODate } from "./calendar";
import type { Bar } from "./indicators";

/**
 * Market-data provider abstraction. Every provider declares where its data
 * comes from and how fresh it is; the UI shows this next to every number.
 * To add a licensed provider (e.g. a paid real-time feed), implement this
 * interface — after confirming its display and redistribution rights.
 */
export interface Instrument {
  symbol: string;
  name: string;
  sector: string;
  /** Last day the instrument traded (delisted afterwards) — lets back-tests avoid survivorship bias. */
  delistedAfter?: ISODate;
}

export interface MarketDataProvider {
  id: string;
  label: string;
  /** "simulated" data must never be presented as real prices. */
  freshness: "simulated" | "delayed-15m" | "end-of-day" | "real-time";
  licenseNote: string;
  universe(date: ISODate): Instrument[];
  /** One-minute bars for the regular session (9:30–16:00 ET). */
  intraday(symbol: string, date: ISODate): Bar[];
  /** Daily bars for the `n` trading days ending at `date`, oldest first. */
  daily(symbol: string, date: ISODate, n: number): Bar[];
}

// ---------------------------------------------------------------------------
// Simulated provider
// ---------------------------------------------------------------------------

const INSTRUMENTS: (Instrument & { base: number; vol: number; adv: number })[] = [
  ["SIM:AERO", "Simulated Aerospace Co.", "Industrials", 142, 0.018, 3.1e6],
  ["SIM:BANK", "Simulated Regional Bank", "Financials", 38, 0.016, 6.2e6],
  ["SIM:BIOX", "Simulated Biotech X", "Health Care", 21, 0.042, 4.4e6],
  ["SIM:CHIP", "Simulated Semiconductor", "Technology", 312, 0.026, 9.8e6],
  ["SIM:CLOU", "Simulated Cloud Software", "Technology", 188, 0.024, 5.1e6],
  ["SIM:COIN", "Simulated Crypto Exchange", "Financials", 97, 0.045, 7.6e6],
  ["SIM:DRUG", "Simulated Pharma", "Health Care", 64, 0.014, 4.9e6],
  ["SIM:ENRG", "Simulated Energy Major", "Energy", 109, 0.017, 6.8e6],
  ["SIM:EVCO", "Simulated EV Maker", "Consumer Discretionary", 241, 0.038, 1.2e7],
  ["SIM:FOOD", "Simulated Food Brands", "Consumer Staples", 52, 0.009, 2.4e6],
  ["SIM:GAME", "Simulated Game Studio", "Communication", 33, 0.031, 3.9e6],
  ["SIM:HOME", "Simulated Home Builder", "Consumer Discretionary", 118, 0.021, 2.2e6],
  ["SIM:INSR", "Simulated Insurer", "Financials", 77, 0.011, 1.9e6],
  ["SIM:LOGI", "Simulated Logistics", "Industrials", 89, 0.015, 2.7e6],
  ["SIM:MEDI", "Simulated Med Devices", "Health Care", 156, 0.013, 1.6e6],
  ["SIM:META", "Simulated Social Network", "Communication", 402, 0.022, 8.9e6],
  ["SIM:MINE", "Simulated Gold Miner", "Materials", 29, 0.027, 5.5e6],
  ["SIM:NETW", "Simulated Networking", "Technology", 61, 0.019, 3.3e6],
  ["SIM:OILS", "Simulated Oil Services", "Energy", 24, 0.029, 4.1e6],
  ["SIM:PAYS", "Simulated Payments", "Financials", 214, 0.018, 4.6e6],
  ["SIM:RAIL", "Simulated Railroad", "Industrials", 233, 0.012, 1.4e6],
  ["SIM:RETL", "Simulated Big-Box Retail", "Consumer Staples", 147, 0.012, 3.0e6],
  ["SIM:ROBO", "Simulated Robotics", "Technology", 46, 0.035, 2.9e6],
  ["SIM:SOLR", "Simulated Solar", "Utilities", 18, 0.04, 6.1e6],
  ["SIM:STRM", "Simulated Streaming", "Communication", 128, 0.025, 4.2e6],
  ["SIM:TELE", "Simulated Telecom", "Communication", 41, 0.009, 7.3e6],
  ["SIM:TRVL", "Simulated Travel", "Consumer Discretionary", 72, 0.026, 3.4e6],
  ["SIM:UTIL", "Simulated Utility", "Utilities", 66, 0.008, 2.1e6],
  // Illiquid / low-priced names exist so the liquidity filter has something to do.
  ["SIM:PENY", "Simulated Micro-Cap", "Technology", 2.4, 0.06, 1.8e5],
  ["SIM:THIN", "Simulated Thinly Traded", "Industrials", 14, 0.03, 9.0e4],
  // Delisted mid-history: back-tests must include it while it traded.
  ["SIM:GONE", "Simulated Delisted Co.", "Consumer Discretionary", 12, 0.05, 2.0e6, "2026-08-14"],
  ["SIM:MRGD", "Simulated Acquired Co.", "Technology", 55, 0.02, 1.5e6, "2026-06-30"],
].map(([symbol, name, sector, base, vol, adv, delistedAfter]) => ({
  symbol: symbol as string,
  name: name as string,
  sector: sector as string,
  base: base as number,
  vol: vol as number,
  adv: adv as number,
  delistedAfter: delistedAfter as ISODate | undefined,
}));

const EPOCH: ISODate = "2025-06-02";
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
function gauss(rand: () => number) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** U-shaped intraday volume profile over 390 minutes. */
const PROFILE = (() => {
  const raw = Array.from({ length: 390 }, (_, i) => {
    const x = i / 389;
    return 0.55 + 2.6 * Math.exp(-x * 9) + 1.4 * Math.exp(-(1 - x) * 7);
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / total);
})();

interface DayOC {
  open: number;
  close: number;
  shock: boolean;
  volMult: number;
  seed: number;
}

const ocCache = new Map<string, DayOC>();
const dailyCache = new Map<string, Bar>();
const barCache = new Map<string, Bar[]>();

function inst(symbol: string) {
  const i = INSTRUMENTS.find((x) => x.symbol === symbol);
  if (!i) throw new Error(`Unknown simulated symbol ${symbol}`);
  return i;
}

/** Day-level model: overnight gap, then the day's move. Cheap, so price history is O(days). */
function dayOC(symbol: string, date: ISODate, prev: number): DayOC {
  const key = `${symbol}|${date}`;
  const hit = ocCache.get(key);
  if (hit) return hit;
  const meta = inst(symbol);
  const seed = hash(key);
  const rand = mulberry32(seed);
  // ~6% of days carry a news-like shock with a big gap and heavy volume.
  const shock = rand() < 0.06;
  const gap = shock ? (rand() < 0.5 ? -1 : 1) * (0.025 + rand() * 0.06) : gauss(rand) * meta.vol * 0.35;
  const open = Math.max(0.5, prev * (1 + gap));
  // Momentum days continue the gap, the rest mean-revert — 50/50, no built-in edge.
  const regime = rand() < 0.5 ? 1 : -1;
  const dayRet = regime * gap * 0.35 + gauss(rand) * meta.vol * (shock ? 1.5 : 0.9);
  const close = Math.max(0.3, open * (1 + dayRet));
  const volMult = (shock ? 3 + rand() * 4 : 0.7 + rand() * 0.6) * meta.adv;
  const oc = { open: round(open), close: round(close), shock, volMult, seed };
  if (ocCache.size > 50_000) ocCache.clear();
  ocCache.set(key, oc);
  return oc;
}

const prevCloseCache = new Map<string, number>();
/** Previous close: yesterday's close, built day by day from a fixed epoch and memoised. */
function prevClose(symbol: string, date: ISODate): number {
  // Walk back to the nearest known close (or the epoch), then forward.
  const chain: ISODate[] = [];
  let d = previousTradingDay(date);
  let price = inst(symbol).base;
  while (d >= EPOCH) {
    const known = prevCloseCache.get(`${symbol}|${d}`);
    if (known !== undefined) {
      price = dayOC(symbol, d, known).close;
      break;
    }
    chain.push(d);
    d = previousTradingDay(d);
  }
  if (d < EPOCH) price = inst(symbol).base;
  for (let i = chain.length - 1; i >= 0; i--) {
    const day = chain[i]!;
    prevCloseCache.set(`${symbol}|${day}`, price);
    price = dayOC(symbol, day, price).close;
  }
  return price;
}

/** Minute bars: a random path pinned to the day's open and close (Brownian bridge in log space). */
function minuteBars(symbol: string, date: ISODate): Bar[] {
  const key = `${symbol}|${date}`;
  const hit = barCache.get(key);
  if (hit) return hit;
  const meta = inst(symbol);
  const oc = dayOC(symbol, date, prevClose(symbol, date));
  const rand = mulberry32(oc.seed ^ 0x9e3779b9);
  const minuteVol = (meta.vol / Math.sqrt(390)) * (oc.shock ? 1.6 : 1);
  const walk = [0];
  for (let i = 1; i <= 390; i++) walk.push(walk[i - 1]! + gauss(rand) * minuteVol * (i <= 30 ? 1.8 : 1));
  const target = Math.log(oc.close / oc.open);
  const path = walk.map((w, i) => w - (i / 390) * (walk[390]! - target));
  const t0 = nyTimeToUtc(date, 9, 30).getTime();
  const bars: Bar[] = [];
  for (let i = 0; i < 390; i++) {
    const o = oc.open * Math.exp(path[i]!);
    const c = oc.open * Math.exp(path[i + 1]!);
    const wick = Math.abs(gauss(rand)) * minuteVol * (i < 30 ? 1.8 : 1) * o * 0.6;
    const h = Math.max(o, c) + wick * rand();
    const l = Math.max(0.2, Math.min(o, c) - wick * rand());
    const v = Math.round(oc.volMult * PROFILE[i]! * (0.6 + rand() * 0.8));
    bars.push({ t: t0 + i * 60_000, o: round(o), h: round(h), l: round(l), c: round(c), v });
  }
  if (barCache.size > 1500) barCache.clear();
  barCache.set(key, bars);
  return bars;
}

const round = (x: number) => Math.round(x * 100) / 100;

export const simulatedProvider: MarketDataProvider = {
  id: "simulated",
  label: "Second Wall Street market simulator",
  freshness: "simulated",
  licenseNote: "Synthetic data generated by Second Wall Street for education. Not real prices of any security; symbols are fictional (SIM:…).",
  universe(date) {
    return INSTRUMENTS.filter((i) => date >= EPOCH && (!i.delistedAfter || date <= i.delistedAfter)).map(({ symbol, name, sector, delistedAfter }) => ({ symbol, name, sector, delistedAfter }));
  },
  intraday(symbol, date) {
    if (!isTradingDay(date)) return [];
    const m = inst(symbol);
    if (m.delistedAfter && date > m.delistedAfter) return [];
    return minuteBars(symbol, date);
  },
  daily(symbol, date, n) {
    const m = inst(symbol);
    return tradingDaysBack(date, n)
      .filter((d) => d >= EPOCH && (!m.delistedAfter || d <= m.delistedAfter))
      .map((d) => {
        // Daily bars aggregate the same minute bars the intraday view shows (cached: small).
        const key = `${symbol}|${d}`;
        const hit = dailyCache.get(key);
        if (hit) return hit;
        const bars = minuteBars(symbol, d);
        let h = -Infinity;
        let l = Infinity;
        let v = 0;
        for (const b of bars) {
          if (b.h > h) h = b.h;
          if (b.l < l) l = b.l;
          v += b.v;
        }
        const bar = { t: bars[0]!.t, o: bars[0]!.o, h, l, c: bars[389]!.c, v };
        if (dailyCache.size > 100_000) dailyCache.clear();
        dailyCache.set(key, bar);
        return bar;
      });
  },
};

/** The active provider. Swap here once a licensed feed is connected. */
export function getProvider(): MarketDataProvider {
  return simulatedProvider;
}
