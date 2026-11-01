import { describe, expect, it } from "vitest";
import { isTradingDay, latestCompletedSession, nyTimeToUtc, nyseHolidays, previousTradingDay, tradingDaysBack } from "./calendar";
import { atr, bollinger, candlePatterns, ema, macd, openingRange, rsi, sma, vwap, type Bar } from "./indicators";
import { simulatedProvider as P } from "./provider";

describe("NYSE calendar", () => {
  it("knows the 2026 holidays", () => {
    expect([...nyseHolidays(2026)].sort()).toEqual([
      "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    ]);
  });
  it("skips weekends and holidays", () => {
    expect(isTradingDay("2026-11-01")).toBe(false); // Sunday
    expect(isTradingDay("2026-11-26")).toBe(false); // Thanksgiving
    expect(previousTradingDay("2026-11-02")).toBe("2026-10-30");
    expect(tradingDaysBack("2026-11-30", 3)).toEqual(["2026-11-25", "2026-11-27", "2026-11-30"]);
  });
  it("converts 9:30 New York time correctly across daylight saving", () => {
    expect(nyTimeToUtc("2026-07-15", 9, 30).toISOString()).toBe("2026-07-15T13:30:00.000Z"); // EDT
    expect(nyTimeToUtc("2026-12-15", 9, 30).toISOString()).toBe("2026-12-15T14:30:00.000Z"); // EST
    expect(nyTimeToUtc("2026-03-09", 9, 30).toISOString()).toBe("2026-03-09T13:30:00.000Z"); // day after DST starts
  });
  it("finds the latest finished opening window", () => {
    expect(latestCompletedSession(new Date("2026-10-30T13:40:00Z"))).toBe("2026-10-29"); // 9:40 ET Friday
    expect(latestCompletedSession(new Date("2026-10-30T13:46:00Z"))).toBe("2026-10-30");
    expect(latestCompletedSession(new Date("2026-11-01T15:00:00Z"))).toBe("2026-10-30"); // Sunday
  });
});

describe("indicators", () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
  it("computes SMA and EMA", () => {
    expect(sma([1, 2, 3, 4, 5], 3).slice(2)).toEqual([2, 3, 4]);
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e[2]).toBe(2);
    expect(e[4]).toBeCloseTo(4, 6);
  });
  it("matches Wilder's textbook RSI", () => {
    // Classic StockCharts example: first RSI(14) ≈ 70.53
    expect(rsi(closes, 14)[14]).toBeCloseTo(70.46, 0);
  });
  it("computes MACD, Bollinger, ATR and VWAP", () => {
    const m = macd(Array.from({ length: 60 }, (_, i) => 100 + i));
    expect(m.line[59]).toBeGreaterThan(0);
    expect(Number.isFinite(m.signal[59])).toBe(true);
    const b = bollinger(closes, 20);
    expect(b.upper[19]! > b.mid[19]! && b.mid[19]! > b.lower[19]!).toBe(true);
    const bars: Bar[] = [
      { t: 0, o: 10, h: 11, l: 9, c: 10, v: 100 },
      { t: 1, o: 10, h: 12, l: 10, c: 12, v: 300 },
    ];
    expect(vwap(bars)[1]).toBeCloseTo((10 * 100 + (34 / 3) * 300) / 400, 6);
    const a = atr(Array.from({ length: 16 }, (_, i) => bars[i % 2]!), 14);
    expect(Number.isNaN(a[12]!)).toBe(true);
    expect(Number.isFinite(a[13]!)).toBe(true); // first value once 14 bars exist
    expect(openingRange(bars, 2)).toEqual({ high: 12, low: 9, volume: 400 });
  });
  it("recognises candlestick patterns", () => {
    expect(candlePatterns([{ t: 0, o: 10, h: 10.1, l: 8, c: 10, v: 1 }])).toContain("doji");
    expect(candlePatterns([{ t: 0, o: 10, h: 10.05, l: 9, c: 9.8, v: 1 }, { t: 1, o: 9.7, h: 10.4, l: 9.6, c: 10.3, v: 1 }])).toContain("bullish-engulfing");
  });
});

describe("simulated provider", () => {
  it("is deterministic and labelled as simulated", () => {
    expect(P.freshness).toBe("simulated");
    expect(P.intraday("SIM:CHIP", "2026-10-30")).toEqual(P.intraday("SIM:CHIP", "2026-10-30"));
    expect(P.universe("2026-10-30").every((i) => i.symbol.startsWith("SIM:"))).toBe(true);
  });
  it("produces a full, consistent regular session", () => {
    const bars = P.intraday("SIM:BANK", "2026-10-30");
    expect(bars).toHaveLength(390);
    expect(new Date(bars[0]!.t).toISOString()).toBe("2026-10-30T13:30:00.000Z");
    for (const b of bars) expect(b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c) && b.v >= 0).toBe(true);
    const d = P.daily("SIM:BANK", "2026-10-30", 2);
    expect(d[1]!.c).toBe(bars[389]!.c);
    // Today's open gaps from yesterday's close (overnight), consistently.
    expect(Math.abs(bars[0]!.o / d[0]!.c - 1)).toBeLessThan(0.15);
  });
  it("removes delisted instruments and has no bars on holidays", () => {
    expect(P.universe("2026-10-30").some((i) => i.symbol === "SIM:GONE")).toBe(false);
    expect(P.universe("2026-08-01").some((i) => i.symbol === "SIM:GONE")).toBe(true);
    expect(P.intraday("SIM:CHIP", "2026-11-26")).toEqual([]);
  });
});
