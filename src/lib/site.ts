export const SITE = {
  name: "Second Wall Street",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://secondwallstreet.com",
  tagline: "Second Wall Street for Gen Z. It's time to change the rules of the market!",
  description:
    "The next generation of Wall Street, built by developers and powered by AI agents. Explore a living 3D city, claim a free virtual office and publish AI agents.",
} as const;

/** Public source repository (AGPL-3.0 §13: users of the service can get its source). */
export const REPO = "https://github.com/AICreditWallet/second-wall-street";

export const NAV = [
  { href: "/city", label: "Explore City" },
  { href: "/agents", label: "AI Agents" },
  { href: "/research", label: "Research" },
  { href: "/developers", label: "Developers" },
  { href: "/#how-it-works", label: "How It Works" },
] as const;

export const LEGAL_DOCS = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  risk: "Risk Disclosure",
  "acceptable-use": "Acceptable Use Policy",
  refunds: "Refund Policy",
  marketplace: "Marketplace Policy",
} as const;

export type LegalSlug = keyof typeof LEGAL_DOCS;
