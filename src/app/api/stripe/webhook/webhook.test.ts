import Stripe from "stripe";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Test-only values: a fake key and secret, never real credentials.
const SECRET = "whsec_unit_test_secret";
process.env.STRIPE_SECRET_KEY = "sk_test_unit";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const rpc = vi.fn(async (fn: string) => ({ data: fn === "billing_activate" ? "active" : true, error: null }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));

const signer = new Stripe("sk_test_unit");
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("./route"));
});
beforeEach(() => rpc.mockClear());

function signed(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://example.test/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": header } });
}
const event = (type: string, object: object) => ({ id: "evt_123", object: "event", type, data: { object } });

describe("Stripe webhook", () => {
  it("rejects unsigned and forged requests without touching the database", async () => {
    const unsigned = await POST(new Request("https://example.test/x", { method: "POST", body: "{}" }));
    const forged = await POST(signed(event("checkout.session.completed", { id: "cs_x", payment_status: "paid" }), "whsec_attacker"));
    expect([unsigned.status, forged.status]).toEqual([400, 400]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("hands over the office for a paid one-time checkout", async () => {
    const res = await POST(signed(event("checkout.session.completed", { id: "cs_test_1", object: "checkout.session", payment_status: "paid", customer: "cus_1", subscription: null, payment_intent: "pi_1", metadata: { purchase_id: "p1" } })));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("billing_activate", { p_session: "cs_test_1", p_customer: "cus_1", p_subscription: null, p_payment_intent: "pi_1", p_period_end: null });
    expect(rpc).toHaveBeenCalledWith("billing_record_event", { p_id: "evt_123", p_type: "checkout.session.completed" });
  });

  it("ignores checkouts that aren't paid yet", async () => {
    await POST(signed(event("checkout.session.completed", { id: "cs_test_2", payment_status: "unpaid", payment_intent: "pi_2", metadata: { purchase_id: "p2" } })));
    expect(rpc).not.toHaveBeenCalledWith("billing_activate", expect.anything());
  });

  it("ignores paid checkouts from other products on the same Stripe account", async () => {
    const res = await POST(signed(event("checkout.session.completed", { id: "cs_other", payment_status: "paid", payment_intent: "pi_other", metadata: {} })));
    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalledWith("billing_activate", expect.anything());
  });

  it("frees the office when a checkout expires or a subscription ends", async () => {
    await POST(signed(event("checkout.session.expired", { id: "cs_test_3" })));
    expect(rpc).toHaveBeenCalledWith("billing_session_expired", { p_session: "cs_test_3" });
    await POST(signed(event("customer.subscription.deleted", { id: "sub_1", status: "canceled", cancel_at_period_end: false, items: { data: [{ current_period_end: 1_800_000_000 }] } })));
    expect(rpc).toHaveBeenCalledWith("billing_subscription_changed", { p_subscription: "sub_1", p_status: "canceled", p_period_end: new Date(1_800_000_000_000).toISOString(), p_cancel_at_period_end: false });
  });

  it("returns 500 so Stripe retries when the database fails", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } } as never);
    const res = await POST(signed(event("checkout.session.expired", { id: "cs_test_4" })));
    expect(res.status).toBe(500);
  });
});
