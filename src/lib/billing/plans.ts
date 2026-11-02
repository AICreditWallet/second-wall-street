/** Public pricing. The database (office_plans) is authoritative; these mirror it for display and Stripe price setup. */
export const PRICES = {
  monthly: { amountMinor: 999, currency: "gbp", label: "£9.99", per: "/month" },
  lifetime: { amountMinor: 5999, currency: "gbp", label: "£59.99", per: "one-time" },
} as const;

export type PlanKind = keyof typeof PRICES;

export const AGENT_LIMITS = { standard: 1, premium: 10, landmark: 25 } as const;

export function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(minor / 100);
}
