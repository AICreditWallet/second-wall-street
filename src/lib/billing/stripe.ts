import "server-only";
import Stripe from "stripe";
import { sellerConfigured, vatRegistered } from "@/lib/seller";
import { PRICES, type PlanKind } from "./plans";

/**
 * Stripe access, server only. The secret key lives in the STRIPE_SECRET_KEY
 * environment variable (set in Vercel by the owner) and never reaches a browser.
 * Products, prices and the customer-portal configuration are created on first
 * use, identified by lookup keys / metadata, so no manual Stripe setup is needed.
 */

const KEY = process.env.STRIPE_SECRET_KEY ?? "";

export const stripeMode: "test" | "live" | null = /^(sk|rk)_test_/.test(KEY) ? "test" : /^(sk|rk)_live_/.test(KEY) ? "live" : null;

/** Only for a VAT-registered seller with Stripe Tax active; otherwise Checkout refuses to open. */
export const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "1";

/** A registered seller must collect VAT, and everyone must publish seller details, so live keys alone can't start charging. */
export const sellingEnabled = stripeMode === "test" || (stripeMode === "live" && sellerConfigured && (!vatRegistered || automaticTax));

let client: Stripe | null = null;
export function getStripe(): Stripe | null {
  if (!stripeMode) return null;
  client ??= new Stripe(KEY, { maxNetworkRetries: 2, timeout: 15_000, appInfo: { name: "Second Wall Street" } });
  return client;
}

const lookupKey = (kind: PlanKind) => `swst_office_${kind}_${PRICES[kind].currency}_${PRICES[kind].amountMinor}`;
const priceCache = new Map<PlanKind, string>();

/** Price ids for the premium office, creating the product and prices once if they don't exist. */
export async function ensurePrice(stripe: Stripe, kind: PlanKind): Promise<string> {
  const cached = priceCache.get(kind);
  if (cached) return cached;
  const found = await stripe.prices.list({ lookup_keys: [lookupKey(kind)], active: true, limit: 1 });
  if (found.data[0]) {
    // The advertised price includes tax, so tax must never be added on top.
    if (found.data[0].tax_behavior === "unspecified") await stripe.prices.update(found.data[0].id, { tax_behavior: "inclusive" });
    priceCache.set(kind, found.data[0].id);
    return found.data[0].id;
  }
  const products = await stripe.products.list({ active: true, limit: 100 });
  const product =
    products.data.find((p) => p.metadata.swst === "office") ??
    (await stripe.products.create(
      { name: "Second Wall Street premium office", description: "A premium or landmark office in the Second Wall Street 3D city, with room for more AI agents.", metadata: { swst: "office" } },
      { idempotencyKey: "swst-office-product-v1" },
    ));
  const p = PRICES[kind];
  const price = await stripe.prices.create(
    {
      product: product.id,
      currency: p.currency,
      unit_amount: p.amountMinor,
      tax_behavior: "inclusive",
      lookup_key: lookupKey(kind),
      nickname: kind === "monthly" ? "Premium office — monthly" : "Premium office — one-time",
      ...(kind === "monthly" ? { recurring: { interval: "month" as const } } : {}),
      metadata: { swst: "office", kind },
    },
    { idempotencyKey: `swst-${lookupKey(kind)}-v1` },
  );
  priceCache.set(kind, price.id);
  return price.id;
}

let portalConfig: string | null = null;
/** Customer portal: update card, see invoices, cancel at period end. */
export async function ensurePortalConfiguration(stripe: Stripe): Promise<string> {
  if (portalConfig) return portalConfig;
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const mine = list.data.find((c) => c.metadata?.swst === "portal-v1");
  if (mine) return (portalConfig = mine.id);
  const created = await stripe.billingPortal.configurations.create(
    {
      business_profile: { headline: "Second Wall Street — manage your office subscription" },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "missing_features", "other"] } },
      },
      metadata: { swst: "portal-v1" },
    },
    { idempotencyKey: "swst-portal-v1" },
  );
  return (portalConfig = created.id);
}

/** Period end of a subscription (stored per item in current API versions). */
export function periodEnd(sub: Stripe.Subscription): string | null {
  const ends = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000).toISOString() : null;
}

export const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));
