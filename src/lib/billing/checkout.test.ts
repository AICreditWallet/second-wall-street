import { describe, expect, it } from "vitest";
import { checkoutParams, type CheckoutInput } from "./checkout";

const base: CheckoutInput = { kind: "monthly", price: "price_1", purchaseId: "p1", officeId: "ofc-hp-003-1", customerId: null, email: "a@example.test", siteUrl: "https://example.test", automaticTax: true, expiresAt: 1 };

describe("checkoutParams", () => {
  it("monthly is a subscription and one-time is a payment with an invoice", () => {
    expect(checkoutParams(base).mode).toBe("subscription");
    const once = checkoutParams({ ...base, kind: "lifetime" });
    expect(once.mode).toBe("payment");
    expect(once.invoice_creation).toEqual({ enabled: true });
  });

  it("collects the address and VAT number when tax is on", () => {
    const p = checkoutParams(base);
    expect(p.automatic_tax).toEqual({ enabled: true });
    expect(p.billing_address_collection).toBe("required");
    expect(p.tax_id_collection).toEqual({ enabled: true });
  });

  it("lets a saved customer update their address, which Stripe Tax requires", () => {
    const p = checkoutParams({ ...base, customerId: "cus_1" });
    expect(p.customer).toBe("cus_1");
    expect(p.customer_email).toBeUndefined();
    expect(p.customer_update).toEqual({ address: "auto", name: "auto" });
  });

  it("leaves tax off until it is switched on", () => {
    const p = checkoutParams({ ...base, automaticTax: false });
    expect(p.automatic_tax).toBeUndefined();
    expect(p.customer_update).toBeUndefined();
  });

  it("carries the purchase id so the webhook can match the payment", () => {
    expect(checkoutParams(base).metadata).toEqual({ purchase_id: "p1", office_id: "ofc-hp-003-1" });
    expect(checkoutParams(base).subscription_data?.metadata).toEqual({ purchase_id: "p1", office_id: "ofc-hp-003-1" });
  });
});
