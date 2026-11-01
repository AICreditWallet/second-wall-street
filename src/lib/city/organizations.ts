import type { Agent, Organization } from "./types";

/** Fixed database ids for platform organisations (used by the seed). */
export const PLATFORM_ORG_UUIDS: Record<string, string> = {
  "org-swst-hq": "00000000-0000-4000-8000-000000000001",
  "org-open15": "00000000-0000-4000-8000-000000000015",
  "org-research-lab": "00000000-0000-4000-8000-000000000020",
};

// Platform-operated organisations only. Community organisations come from
// real sign-ups in Phase 2 — we never seed fake companies, reviews or activity.

export const PLATFORM_ORGS: Organization[] = [
  {
    id: "org-swst-hq",
    slug: "second-wall-street",
    name: "Second Wall Street HQ",
    tagline: "The team building the district.",
    description:
      "Home of the platform team. Visit for city updates, developer documentation and the public roadmap.",
    operator: "platform",
    verified: true,
    isDemo: false,
    website: "https://secondwallstreet.com",
  },
  {
    id: "org-open15",
    slug: "open15-ai",
    name: "Open15 AI",
    tagline: "Research on the first fifteen minutes of the US market session.",
    description:
      "Open15 AI studies price action, volume and volatility during 9:30–9:45 AM Eastern on regular trading days. Research only — no trades, no personalised recommendations.",
    operator: "platform",
    verified: true,
    isDemo: false,
  },
  {
    id: "org-research-lab",
    slug: "research-lab",
    name: "Second Street Research Lab",
    tagline: "A multi-agent research firm you can watch at work.",
    description:
      "Six specialised agents work through each trading session together: research, technical analysis, market intelligence, risk, portfolio research and reporting, with a human approval gate before portfolio work. Simulated data and hypothetical portfolios only.",
    operator: "platform",
    verified: true,
    isDemo: true,
  },
];

const RESEARCH_DISCLOSURE =
  "Educational research only. Not investment advice. Simulated or hypothetical results are labelled as such.";

export const PLATFORM_AGENTS: Agent[] = [
  {
    id: "agt-open15-scanner",
    slug: "open15-scanner",
    organizationId: "org-open15",
    name: "Opening Session Scanner",
    category: "Market data analysis",
    summary: "Scans the 9:30–9:45 ET window and ranks unusual activity with transparent criteria. Runs on simulated market data until a licensed feed is connected.",
    capabilities: ["Opening range", "Relative volume", "Gap detection", "VWAP", "Liquidity filters"],
    status: "live",
    disclosure: RESEARCH_DISCLOSURE,
  },
  {
    id: "agt-open15-orb",
    slug: "open15-opening-range",
    organizationId: "org-open15",
    name: "Opening Range Analyst",
    category: "Technical analysis",
    summary: "Explains where each candidate closed the opening window relative to its range. Runs on simulated market data.",
    capabilities: ["Opening-range breakout", "Relative volume", "Range position"],
    status: "live",
    disclosure: RESEARCH_DISCLOSURE,
  },
  ...(
    [
      ["research-analyst", "Research Analyst", "Financial research", "Builds context for each instrument from completed sessions and frames research questions.", ["20-session return", "Volatility", "Trend vs SMA(20)"]],
      ["technical-analyst", "Technical Analyst", "Technical analysis", "Reads indicators and opening-window signals and states the technical picture with its evidence.", ["RSI", "MACD", "Bollinger Bands", "ATR", "Opening signals"]],
      ["market-intelligence", "Market Intelligence", "News analysis", "Summarises market breadth and sector moves at 9:45. No news feed is connected.", ["Market breadth", "Sector leadership", "Notable gaps"]],
      ["risk-analyst", "Risk Analyst", "Risk analytics", "Measures risk of a hypothetical equal-weight basket: volatility, VaR, worst days and concentration.", ["Volatility", "Historical VaR", "Concentration", "ATR stops"]],
      ["portfolio-research", "Portfolio Research", "Portfolio simulation", "Compares simulated allocations over recent sessions — never real accounts.", ["Equal weight", "Inverse volatility", "Drawdown"]],
      ["report-agent", "Report Agent", "Reporting", "Combines the team's findings into a sourced report with clear disclosures.", ["Sourced summaries", "Disclosures"]],
    ] as const
  ).map(([slug, name, category, summary, capabilities]) => ({
    id: `agt-lab-${slug}`,
    slug: `lab-${slug}`,
    organizationId: "org-research-lab",
    name,
    category,
    summary,
    capabilities: [...capabilities],
    status: "live" as const,
    disclosure: RESEARCH_DISCLOSURE,
  })),
];
