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
    tagline: "A demo multi-agent research firm.",
    description:
      "A demonstration of how specialised agents can collaborate on research. Uses simulated portfolios and educational scenarios only.",
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
    summary: "Finds unusually active US stocks in the 9:30–9:45 AM ET window using relative volume and gap analysis.",
    capabilities: ["Relative volume", "Gap detection", "Opening range", "VWAP"],
    status: "in-development",
    disclosure: RESEARCH_DISCLOSURE,
  },
  {
    id: "agt-open15-orb",
    slug: "open15-opening-range",
    organizationId: "org-open15",
    name: "Opening Range Analyst",
    category: "Technical analysis",
    summary: "Explains opening-range behaviour with transparent, documented indicators and historical context.",
    capabilities: ["Opening-range breakout", "ATR", "RSI", "Candlestick patterns"],
    status: "in-development",
    disclosure: RESEARCH_DISCLOSURE,
  },
  ...(
    [
      ["research-analyst", "Research Analyst", "Financial research", "Studies companies and public information to frame research questions."],
      ["technical-analyst", "Technical Analyst", "Technical analysis", "Evaluates chart structure and indicators with stated assumptions."],
      ["market-intelligence", "Market Intelligence", "News analysis", "Summarises market developments from publicly available sources."],
      ["risk-analyst", "Risk Analyst", "Risk analytics", "Measures hypothetical exposure, volatility and downside scenarios."],
      ["portfolio-research", "Portfolio Research", "Portfolio simulation", "Explores simulated allocations — never real accounts."],
      ["report-agent", "Report Agent", "Reporting", "Combines the team's findings into a sourced, readable report."],
    ] as const
  ).map(([slug, name, category, summary]) => ({
    id: `agt-lab-${slug}`,
    slug: `lab-${slug}`,
    organizationId: "org-research-lab",
    name,
    category,
    summary,
    capabilities: [],
    status: "preview" as const,
    disclosure: RESEARCH_DISCLOSURE,
  })),
];
