import { previousTradingDay, type ISODate } from "@/lib/market/calendar";
import { atr, bollinger, last, macd, rsi, sma } from "@/lib/market/indicators";
import type { MarketDataProvider } from "@/lib/market/provider";
import { runOpen15, type Open15Report } from "@/lib/research/open15";
import { STRATEGIES } from "@/lib/research/strategies";
import { openingFeatures } from "@/lib/research/features";

/**
 * Built-in agents operated by Second Wall Street. Each is deterministic code
 * over the active market-data provider: no language model, no invented facts.
 * `accepts` is the agent's permission boundary — the workflow engine passes it
 * nothing else from the shared workspace.
 */

export interface AgentContext {
  provider: MarketDataProvider;
  sessionDate: ISODate;
  open15: () => Open15Report;
}

export type Workspace = Record<string, unknown>;

export interface BuiltinAgent {
  id: string;
  name: string;
  /** Budget units charged per run. */
  units: number;
  accepts: string[];
  produces: string;
  run(input: Workspace, ctx: AgentContext): Promise<{ output: unknown; summary: string }>;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const symbolsOf = (input: Workspace) => (Array.isArray(input.symbols) ? (input.symbols as string[]) : []).slice(0, 8);

/** Completed sessions only: the session day's own close doesn't exist yet at 9:45 (no look-ahead). */
const completedDaily = (ctx: AgentContext, symbol: string, n = 60) => ctx.provider.daily(symbol, previousTradingDay(ctx.sessionDate), n);

function dailyStats(ctx: AgentContext, symbol: string) {
  const daily = completedDaily(ctx, symbol);
  const closes = daily.map((d) => d.c);
  const rets = closes.slice(1).map((c, i) => c / closes[i]! - 1);
  const last20 = rets.slice(-20);
  const vol = Math.sqrt(last20.reduce((a, r) => a + r * r, 0) / Math.max(1, last20.length)) * 100;
  return { daily, closes, rets, vol };
}

export const AGENTS: BuiltinAgent[] = [
  {
    id: "agt-open15-scanner",
    name: "Opening Session Scanner",
    units: 10,
    accepts: ["top"],
    produces: "candidates",
    async run(input, ctx) {
      const rep = ctx.open15();
      const top = Math.min(8, Math.max(1, Number(input.top ?? 5)));
      const candidates = rep.candidates.slice(0, top).map((c) => ({ symbol: c.symbol, name: c.name, sector: c.sector, score: c.score, direction: c.direction, conditions: c.conditions }));
      return {
        output: { sessionDate: rep.sessionDate, candidates, symbols: candidates.map((c) => c.symbol), breadth: rep.breadth, provider: rep.provider },
        summary: `Scanned ${rep.universeSize} instruments (${rep.eligible} eligible); top: ${candidates.map((c) => c.symbol).join(", ")}.`,
      };
    },
  },
  {
    id: "agt-open15-orb",
    name: "Opening Range Analyst",
    units: 4,
    accepts: ["symbols"],
    produces: "openingRanges",
    async run(input, ctx) {
      const universe = ctx.provider.universe(ctx.sessionDate);
      const out = symbolsOf(input).flatMap((s) => {
        const inst = universe.find((u) => u.symbol === s);
        const f = inst && openingFeatures(ctx.provider, inst, ctx.sessionDate);
        if (!f) return [];
        const loc = (f.price - f.orLow) / (f.orHigh - f.orLow || 1e-9);
        const position = loc >= 0.85 ? "pressing the range high" : loc <= 0.15 ? "pressing the range low" : "inside the range";
        return [{ symbol: s, orHigh: f.orHigh, orLow: f.orLow, price: f.price, rangePct: r2(f.orRangePct), relVolume: r2(f.relVolume), position, note: `${s} closed the window ${position} on ${r2(f.relVolume)}× relative volume.` }];
      });
      return { output: out, summary: `Opening ranges for ${out.length} instruments.` };
    },
  },
  {
    id: "agt-lab-research-analyst",
    name: "Research Analyst",
    units: 5,
    accepts: ["symbols"],
    produces: "research",
    async run(input, ctx) {
      const out = symbolsOf(input).map((s) => {
        const { closes, vol } = dailyStats(ctx, s);
        const ret20 = (last(closes) / closes[closes.length - 21]! - 1) * 100;
        const hi = Math.max(...closes);
        const lo = Math.min(...closes);
        const sma20 = last(sma(closes, 20));
        return {
          symbol: s,
          return20dPct: r2(ret20),
          volatility20dPct: r2(vol),
          distFromSma20Pct: r2((last(closes) / sma20 - 1) * 100),
          rangePosition60d: r2((last(closes) - lo) / (hi - lo || 1)),
          questions: [
            ret20 > 0 ? "Is the 20-session up-move broad or concentrated in a few days?" : "Is the 20-session decline company-specific or sector-wide?",
            vol > 3 ? "Volatility is elevated — what is driving it?" : "Volatility is contained — is that typical for this instrument?",
          ],
        };
      });
      return { output: out, summary: `Context for ${out.length} instruments (20-session return, volatility, trend).` };
    },
  },
  {
    id: "agt-lab-technical-analyst",
    name: "Technical Analyst",
    units: 5,
    accepts: ["symbols"],
    produces: "technical",
    async run(input, ctx) {
      const universe = ctx.provider.universe(ctx.sessionDate);
      const out = symbolsOf(input).map((s) => {
        const daily = completedDaily(ctx, s);
        const closes = daily.map((d) => d.c);
        const bb = bollinger(closes, 20);
        const f = universe.find((u) => u.symbol === s) && openingFeatures(ctx.provider, universe.find((u) => u.symbol === s)!, ctx.sessionDate);
        const active = f ? STRATEGIES.map((st) => ({ id: st.id, sig: st.evaluate(f, st.param.default) })).filter((x) => x.sig.direction !== "none") : [];
        const r = last(rsi(closes, 14));
        const h = last(macd(closes).histogram);
        const ups = active.filter((a) => a.sig.direction === "up").length;
        const downs = active.length - ups;
        const bias = ups > downs && h > 0 ? "constructive" : downs > ups && h < 0 ? "weak" : "mixed";
        return {
          symbol: s,
          rsi14: Math.round(r),
          macdHistogram: r2(h),
          bollingerPosition: r2((last(closes) - last(bb.lower)) / (last(bb.upper) - last(bb.lower) || 1)),
          atrPct: r2((last(atr(daily, 14)) / last(closes)) * 100),
          openingSignals: active.map((a) => `${a.id}:${a.sig.direction}`),
          technicalBias: bias,
        };
      });
      return { output: out, summary: `Indicators and opening signals for ${out.length} instruments.` };
    },
  },
  {
    id: "agt-lab-market-intelligence",
    name: "Market Intelligence",
    units: 3,
    accepts: ["breadth"],
    produces: "marketIntel",
    async run(_input, ctx) {
      const rep = ctx.open15();
      const gaps = rep.candidates.filter((c) => Math.abs(c.metrics.gapPct) >= 2).map((c) => `${c.symbol} ${c.metrics.gapPct > 0 ? "+" : ""}${c.metrics.gapPct}%`);
      return {
        output: {
          breadth: rep.breadth,
          notableGaps: gaps,
          newsSource: "No news feed is connected; this summary uses market breadth from the opening window only.",
        },
        summary: `${rep.breadth.advancing} advancing / ${rep.breadth.declining} declining at 9:45; leading sector ${rep.breadth.leadingSector}.`,
      };
    },
  },
  {
    id: "agt-lab-risk-analyst",
    name: "Risk Analyst",
    units: 5,
    accepts: ["symbols", "technical", "research"],
    produces: "risk",
    async run(input, ctx) {
      const syms = symbolsOf(input);
      const w = syms.length ? 1 / syms.length : 0;
      const sectors = new Map<string, number>();
      const universe = ctx.provider.universe(ctx.sessionDate);
      const positions = syms.map((s) => {
        const { rets, vol, daily } = dailyStats(ctx, s);
        const sorted = [...rets.slice(-20)].sort((a, b) => a - b);
        const var95 = -(sorted[Math.floor(sorted.length * 0.05)] ?? 0) * 100;
        const sector = universe.find((u) => u.symbol === s)?.sector ?? "Unknown";
        sectors.set(sector, (sectors.get(sector) ?? 0) + w);
        return {
          symbol: s,
          weight: r2(w * 100),
          dailyVolPct: r2(vol),
          historicalVaR95Pct: r2(var95),
          worstDay20Pct: r2(Math.min(...rets.slice(-20)) * 100),
          atrStopDistancePct: r2((last(atr(daily, 14)) / last(daily.map((d) => d.c))) * 150),
        };
      });
      const avgVol = positions.reduce((a, p) => a + p.dailyVolPct, 0) / Math.max(1, positions.length);
      // Assume an average pairwise correlation of 0.4 for a hypothetical equal-weight basket.
      const n = positions.length || 1;
      const portVol = avgVol * Math.sqrt((1 + (n - 1) * 0.4) / n);
      const concentration = [...sectors].sort((a, b) => b[1] - a[1])[0];
      const flags = [
        ...(concentration && concentration[1] > 0.4 ? [`${Math.round(concentration[1] * 100)}% in ${concentration[0]}`] : []),
        ...positions.filter((p) => p.dailyVolPct > 4).map((p) => `${p.symbol} daily volatility ${p.dailyVolPct}%`),
      ];
      return {
        output: { hypothetical: true, positions, portfolioDailyVolPct: r2(portVol), assumedCorrelation: 0.4, flags },
        summary: `Hypothetical equal-weight basket: est. daily volatility ${r2(portVol)}%; ${flags.length} risk flag(s).`,
      };
    },
  },
  {
    id: "agt-lab-portfolio-research",
    name: "Portfolio Research",
    units: 5,
    accepts: ["symbols", "risk"],
    produces: "portfolio",
    async run(input, ctx) {
      const syms = symbolsOf(input);
      const series = syms.map((s) => dailyStats(ctx, s));
      const vols = series.map((x) => Math.max(x.vol, 0.1));
      const inv = vols.map((v) => 1 / v);
      const invSum = inv.reduce((a, b) => a + b, 0) || 1;
      const schemes = { "Equal weight": syms.map(() => 1 / (syms.length || 1)), "Inverse volatility": inv.map((x) => x / invSum) };
      const results = Object.entries(schemes).map(([name, weights]) => {
        let eq = 1;
        let peak = 1;
        let dd = 0;
        const daily: number[] = [];
        for (let d = 20; d >= 1; d--) {
          const r = series.reduce((a, s, i) => a + weights[i]! * (s.rets[s.rets.length - d] ?? 0), 0);
          daily.push(r);
          eq *= 1 + r;
          peak = Math.max(peak, eq);
          dd = Math.max(dd, 1 - eq / peak);
        }
        const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
        const sd = Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, daily.length - 1));
        return { scheme: name, weights: Object.fromEntries(syms.map((s, i) => [s, r2(weights[i]! * 100)])), return20dPct: r2((eq - 1) * 100), volatilityPct: r2(sd * 100), maxDrawdownPct: r2(dd * 100) };
      });
      return { output: { simulated: true, lookbackSessions: 20, results }, summary: `Compared ${results.length} simulated allocations over 20 sessions.` };
    },
  },
  {
    id: "agt-lab-report-agent",
    name: "Report Agent",
    units: 3,
    accepts: ["sessionDate", "candidates", "openingRanges", "research", "technical", "marketIntel", "risk", "portfolio", "provider"],
    produces: "report",
    async run(input) {
      const sections: { heading: string; bullets: string[] }[] = [];
      const cands = (input.candidates as { symbol: string; score: number; direction: string; conditions: string[] }[] | undefined) ?? [];
      if (cands.length) sections.push({ heading: "Opening-window candidates", bullets: cands.map((c) => `${c.symbol} — score ${c.score}, ${c.direction === "none" ? "no clear direction" : `${c.direction} bias`}${c.conditions.length ? ` (${c.conditions.join(", ")})` : ""}`) });
      const orb = (input.openingRanges as { note: string }[] | undefined) ?? [];
      if (orb.length) sections.push({ heading: "Opening ranges", bullets: orb.map((o) => o.note) });
      const res = (input.research as { symbol: string; return20dPct: number; volatility20dPct: number }[] | undefined) ?? [];
      if (res.length) sections.push({ heading: "Context", bullets: res.map((r) => `${r.symbol}: ${r.return20dPct >= 0 ? "+" : ""}${r.return20dPct}% over 20 sessions, daily volatility ${r.volatility20dPct}%`) });
      const tech = (input.technical as { symbol: string; rsi14: number; technicalBias: string }[] | undefined) ?? [];
      if (tech.length) sections.push({ heading: "Technical picture", bullets: tech.map((t) => `${t.symbol}: RSI ${t.rsi14}, ${t.technicalBias} technical bias`) });
      const intel = input.marketIntel as { breadth?: { advancing: number; declining: number; leadingSector: string }; newsSource?: string } | undefined;
      if (intel?.breadth) sections.push({ heading: "Market backdrop", bullets: [`${intel.breadth.advancing} advancing vs ${intel.breadth.declining} declining at 9:45`, `Leading sector: ${intel.breadth.leadingSector}`, intel.newsSource ?? ""].filter(Boolean) });
      const risk = input.risk as { portfolioDailyVolPct: number; flags: string[] } | undefined;
      if (risk) sections.push({ heading: "Risk (hypothetical basket)", bullets: [`Estimated daily volatility ${risk.portfolioDailyVolPct}%`, ...(risk.flags.length ? risk.flags.map((f) => `Flag: ${f}`) : ["No concentration or volatility flags"])] });
      const port = input.portfolio as { results: { scheme: string; return20dPct: number; volatilityPct: number; maxDrawdownPct: number }[] } | undefined;
      if (port) sections.push({ heading: "Simulated allocations (20 sessions)", bullets: port.results.map((p) => `${p.scheme}: ${p.return20dPct >= 0 ? "+" : ""}${p.return20dPct}% return, ${p.volatilityPct}% daily vol, ${p.maxDrawdownPct}% max drawdown`) });
      const provider = input.provider as { label: string; freshness: string } | undefined;
      const report = {
        title: `Opening-session research — ${String(input.sessionDate ?? "")}`,
        sections,
        sources: [provider ? `${provider.label} (${provider.freshness})` : "Market data provider", "Second Wall Street agents: computations shown above"],
        disclaimer: `Educational research only. Not investment advice. All figures are computed from ${provider?.freshness === "simulated" || !provider ? "simulated data" : `${provider.freshness} data`} and hypothetical portfolios.`,
      };
      return { output: report, summary: `Report with ${sections.length} sections.` };
    },
  },
];

export const agentById = new Map(AGENTS.map((a) => [a.id, a]));

export function makeContext(provider: MarketDataProvider, sessionDate: ISODate, now = new Date()): AgentContext {
  let cached: Open15Report | null = null;
  return { provider, sessionDate, open15: () => (cached ??= runOpen15(provider, sessionDate, 8, now)) };
}
