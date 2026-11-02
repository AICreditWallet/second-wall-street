# Stripe setup

Second Wall Street sells premium and landmark offices: **£9.99/month** (subscription) or **£59.99 once**. Free offices (1 agent) need no payment.

The app creates the Stripe product, both prices and the customer-portal configuration by itself on first use (identified by lookup keys `swst_office_monthly_gbp_999` / `swst_office_lifetime_gbp_5999`). You only need two secrets and one webhook.

## 1. Keys (owner, in Vercel — never in code or chat)

| Vercel environment variable | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → Secret key (`sk_test_…` while testing) |
| `STRIPE_WEBHOOK_SECRET` | The webhook endpoint below → Signing secret (`whsec_…`) |

Add both to **Production** and **Preview**, then redeploy. Without them, paid offices show "opening shortly" and nothing can be charged.

## 2. Webhook endpoint

Stripe Dashboard → Developers → Webhooks → Add endpoint

- URL: `https://secondwallstreet.com/api/stripe/webhook`
- Events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.expired`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `charge.refunded`

## 3. How a purchase works

1. A signed-in, verified user picks a premium office and monthly or one-time.
2. `start_office_purchase` (Postgres) reserves the office for 31 minutes and records a pending purchase at the plan's price.
3. The server creates a Stripe Checkout session (30-minute expiry) and redirects the user.
4. Stripe calls the webhook. The signature is verified, then `billing_activate` gives the office to the user's organisation. Retries and duplicates are harmless.
5. Abandoned checkouts free the office (`checkout.session.expired`, or automatically after 31 minutes).
6. Monthly: cancelling in the customer portal keeps the office until the period ends; `customer.subscription.deleted` then frees it. Failed payments show "update your card" while Stripe retries.
7. One-time: a full refund (`charge.refunded`) frees the office.
8. If a payment ever completes after the office went to someone else, the office is never taken from them: the payment is refunded (one-time) or the subscription cancelled automatically, and the purchase is marked `conflict` for review.

Deleting an account cancels its subscriptions first.

## Going live

1. Upgrade Vercel to Pro (Hobby is non-commercial).
2. Complete Stripe account activation and switch the Dashboard to live mode.
3. Replace both variables with live values (`sk_live_…` and the live endpoint's `whsec_…`) and redeploy.
4. Make one real purchase and refund it.

## Testing

Card `4242 4242 4242 4242`, any future expiry, any CVC. Card `4000 0000 0000 0341` attaches but fails renewal (tests "past due").
