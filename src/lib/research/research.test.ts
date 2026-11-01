import { describe, expect, it } from "vitest";
import { simulatedProvider as P, type MarketDataProvider } from "@/lib/market/provider";
import { runOpen15 } from "./open15";
import { metrics, runBacktests } from "./backtest";
import { STRATEGIES } from "./strategies";

const DATE = "2026-10-30";
const NOW = new Date("2026-10-30T14:00:00Z");

describe("Open15 pipeline", () => {
  const report = runOpen15(P, DATE, 8, NOW);

  it("is reproducible and fully labelled", () => {
    expect(runOpen15(P, DATE, 8, NOW)).toEqual(report);
    expect(report.provider.freshness).toBe("simulated");
    expect(report.windowStartUtc).toBe("2026-10-30T13:30:00.000Z");
    expect(report.windowEndUtc).toBe("2026-10-30T13:45:00.000Z");
    expect(report.limitations.join(" ")).toMatch(/SIMULATED/);
  });

  it("filters illiquid and cheap instruments", () => {
    const excluded = report.excluded.map((e) => e.symbol);
    expect(excluded).toContain("SIM:PENY");
    expect(excluded).toContain("SIM:THIN");
    expect(report.candidates.every((c) => !excluded.includes(c.symbol))).toBe(true);
  });

  it("ranks transparently with evidence for every candidate", () => {
    expect(report.candidates).toHaveLength(8);
    report.candidates.forEach((c, i) => {
      expect(c.rank).toBe(i + 1);
      if (i > 0) expect(c.score).toBeLessThanOrEqual(report.candidates[i - 1]!.score);
      expect(c.evidence.length).toBeGreaterThan(0);
      expect(c.chart).toHaveLength(15);
    });
  });

  it("never looks past 9:45 (no look-ahead)", () => {
    const scrambled: MarketDataProvider = {
      ...P,
      intraday: (s, d) => {
        const bars = P.intraday(s, d);
        if (d !== DATE) return bars;
        return bars.map((b, i) => (i < 15 ? b : { ...b, o: 999, h: 999, l: 1, c: 1, v: 1e9 }));
      },
    };
    expect(runOpen15(scrambled, DATE, 8, NOW)).toEqual(report);
  });
});

describe("back-testing", () => {
  const bt = runBacktests(P, DATE, { sessions: 60, foldSize: 20, slippageBps: 5, costBps: 1, exitMinute: 60 });

  it("evaluates every strategy separately, out of sample", () => {
    expect(bt.strategies.map((s) => s.id)).toEqual(STRATEGIES.map((s) => s.id));
    for (const s of bt.strategies) {
      // Two test blocks after the first training block.
      expect(s.chosenParams).toHaveLength(2);
      expect(s.equity[0]!.date >= bt.from).toBe(true);
    }
    expect(bt.assumptions.join(" ")).toMatch(/HYPOTHETICAL/);
  });

  it("charges costs on every trade", () => {
    const m = metrics([{ date: "2026-01-02", ret: 0 }, { date: "2026-01-02", ret: -0.0012 }]);
    expect(m.trades).toBe(2);
    expect(m.avgTradeBps).toBe(-6);
    expect(metrics([]).trades).toBe(0);
  });

  it("finishes quickly enough for a web request", () => {
    const t = performance.now();
    runBacktests(P, "2026-10-29", { sessions: 120, foldSize: 20, slippageBps: 5, costBps: 1, exitMinute: 60 });
    expect(performance.now() - t).toBeLessThan(20_000);
  });
});
