import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { getStripe, idOf, periodEnd } from "@/lib/billing/stripe";
import { revalidateCity } from "@/lib/revalidate";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Every request must carry a valid Stripe signature for our
 * endpoint secret; anything else is rejected before it is read. Handlers call
 * idempotent database functions, so retries and duplicate deliveries are safe.
 * A failure returns 500 so Stripe retries later.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const admin = createSupabaseAdminClient();
  if (!stripe || !secret || !admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  if (!signature || body.length > 1_000_000) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as unknown;
  };

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object;
        if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") break;
        const subId = idOf(s.subscription);
        const sub = subId ? await stripe.subscriptions.retrieve(subId) : null;
        const result = await rpc("billing_activate", {
          p_session: s.id,
          p_customer: idOf(s.customer),
          p_subscription: subId,
          p_payment_intent: idOf(s.payment_intent),
          p_period_end: sub ? periodEnd(sub) : null,
        });
        if (result === "conflict") {
          // Paid after the reservation lapsed and the office went to someone else: give the money back.
          const pi = idOf(s.payment_intent);
          if (pi) await stripe.refunds.create({ payment_intent: pi }, { idempotencyKey: `conflict-refund-${s.id}` });
          if (subId) await stripe.subscriptions.cancel(subId, { prorate: false });
          console.error("billing_conflict", s.id);
        }
        revalidateCity();
        break;
      }
      case "checkout.session.expired":
        await rpc("billing_session_expired", { p_session: event.data.object.id });
        revalidateCity();
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await rpc("billing_subscription_changed", {
          p_subscription: sub.id,
          p_status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
          p_period_end: periodEnd(sub),
          p_cancel_at_period_end: sub.cancel_at_period_end,
        });
        revalidateCity();
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const pi = idOf(charge.payment_intent);
        if (pi && charge.refunded) {
          await rpc("billing_refunded", { p_payment_intent: pi });
          revalidateCity();
        }
        break;
      }
      default:
        break;
    }
    await rpc("billing_record_event", { p_id: event.id, p_type: event.type });
  } catch (e) {
    console.error("stripe_webhook_failed", event.type, event.id, (e as Error).message);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
