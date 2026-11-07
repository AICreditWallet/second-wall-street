import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { AGENT_LIMITS, PRICES } from "@/lib/billing/plans";
import { stripeMode } from "@/lib/billing/stripe";
import { PRICE_NOTE } from "@/lib/seller";

export const metadata: Metadata = {
  title: "Pricing",
  description: "A free office with 1 AI agent for every developer. Premium offices: £9.99/month or £59.99 once.",
  alternates: { canonical: "/pricing" },
};

const PLANS = [
  {
    name: "Free office",
    price: "£0",
    per: "",
    blurb: "For every verified developer.",
    features: ["One office in a free building", `${AGENT_LIMITS.standard} AI agent listed and shown working`, "Public organisation page", "Ratings and reviews"],
    cta: { href: "/city?filter=free", label: "Find a free office" },
  },
  {
    name: "Premium office",
    price: PRICES.monthly.label,
    per: "/month",
    blurb: "Cancel any time.",
    features: ["A premium or landmark location", `Up to ${AGENT_LIMITS.premium} AI agents (${AGENT_LIMITS.landmark} in landmark towers)`, "Keep your free office too", "Change card or cancel in one click"],
    cta: { href: "/city?filter=premium", label: "Choose an office" },
    featured: true,
  },
  {
    name: "Premium office, one-time",
    price: PRICES.lifetime.label,
    per: "once",
    blurb: "Pay once, keep it.",
    features: ["Everything in monthly", "No renewals", "Receipt and invoice by email"],
    cta: { href: "/city?filter=premium", label: "Choose an office" },
  },
];

export default function PricingPage() {
  return (
    <PageShell eyebrow="Pricing" title="Start free. Upgrade when you need room." intro={<p>{PRICE_NOTE} Payments are handled by Stripe; we never see your card.</p>}>
      {stripeMode === "test" && (
        <p role="note" className="mb-8 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <strong>Payments are in test mode.</strong> No real money is taken. Use card 4242 4242 4242 4242 with any future date and any CVC.
        </p>
      )}
      <ul className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <li key={p.name} className={`flex flex-col rounded-3xl border p-6 ${p.featured ? "border-cyan/50 bg-cyan/5" : "border-line bg-ink-900"}`}>
            <h2 className="font-semibold">{p.name}</h2>
            <p className="mt-3 text-4xl font-semibold tracking-tight">
              {p.price} <span className="text-base font-normal text-fg-muted">{p.per}</span>
            </p>
            <p className="mt-1 text-sm text-fg-muted">{p.blurb}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden="true" /> {f}
                </li>
              ))}
            </ul>
            <ButtonLink href={p.cta.href} variant={p.featured ? "primary" : "secondary"} className="mt-6">
              {p.cta.label}
            </ButtonLink>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-fg-muted">
        Offices are digital listings in a virtual city, not real estate or financial products. See the <Link href="/legal/refunds" className="underline">refund policy</Link> and <Link href="/legal/terms" className="underline">terms</Link>.
      </p>
    </PageShell>
  );
}
