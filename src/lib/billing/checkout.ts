import type Stripe from "stripe";
import type { PlanKind } from "./plans";

export interface CheckoutInput {
  kind: PlanKind;
  price: string;
  purchaseId: string;
  officeId: string;
  customerId: string | null;
  email: string | null;
  siteUrl: string;
  automaticTax: boolean;
  expiresAt: number;
}

/** Stripe Checkout settings for an office purchase. Prices are VAT-inclusive when automatic tax is on. */
export function checkoutParams(i: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  const metadata = { purchase_id: i.purchaseId, office_id: i.officeId };
  return {
    mode: i.kind === "monthly" ? "subscription" : "payment",
    line_items: [{ price: i.price, quantity: 1 }],
    client_reference_id: i.purchaseId,
    metadata,
    ...(i.customerId ? { customer: i.customerId } : { customer_email: i.email ?? undefined }),
    ...(i.kind === "monthly"
      ? { subscription_data: { metadata } }
      : { payment_intent_data: { metadata }, ...(i.customerId ? {} : { customer_creation: "always" as const }), invoice_creation: { enabled: true } }),
    ...(i.automaticTax
      ? {
          automatic_tax: { enabled: true },
          tax_id_collection: { enabled: true },
          billing_address_collection: "required" as const,
          // Tax needs the customer's address, and saved customers must be allowed to update it here.
          ...(i.customerId ? { customer_update: { address: "auto" as const, name: "auto" as const } } : {}),
        }
      : { billing_address_collection: "auto" as const }),
    expires_at: i.expiresAt,
    success_url: `${i.siteUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${i.siteUrl}/claim/${i.officeId}?checkout=cancelled`,
    allow_promotion_codes: true,
  };
}
