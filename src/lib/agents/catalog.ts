/** Agent categories (client-safe). Finance categories require a disclosure. */
export const AGENT_CATEGORIES = [
  "Financial research",
  "Market data analysis",
  "Technical analysis",
  "News analysis",
  "Risk analytics",
  "Portfolio research",
  "Educational tools",
  "Developer automation",
  "Data visualization",
  "Other",
] as const;

export const FINANCE_CATEGORIES = new Set<string>(AGENT_CATEGORIES.slice(0, 6));

export const DEFAULT_DISCLOSURE = "Educational research only. Not investment advice. Simulated or hypothetical results are labelled as such.";

export const AGENT_STATUS_LABEL = { "in-development": "In development", preview: "Preview", live: "Live", suspended: "Suspended" } as const;
