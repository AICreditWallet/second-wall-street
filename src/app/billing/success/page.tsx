import type { Metadata } from "next";
import { CheckCircle2, Loader2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment received", robots: { index: false } };

/** Shows the purchase as the database sees it — the office is only handed over by Stripe's signed webhook. */
export default async function BillingSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  await requireUser("/dashboard");
  const supabase = await createSupabaseServerClient();
  const valid = typeof session_id === "string" && /^cs_[A-Za-z0-9_]{10,200}$/.test(session_id);
  const { data } = valid && supabase
    ? await supabase.from("office_purchases").select("status, kind, office_id").eq("stripe_checkout_session_id", session_id).maybeSingle()
    : { data: null };

  const done = data?.status === "active";
  return (
    <PageShell eyebrow="Billing" title={done ? "Your office is ready" : data ? "Confirming your payment…" : "We couldn't find that payment"}>
      {done ? (
        <div className="max-w-xl space-y-5">
          <p className="flex items-center gap-2 text-fg-muted">
            <CheckCircle2 className="size-5 text-cyan" aria-hidden="true" />
            {data.kind === "monthly" ? "Your subscription is active." : "Your one-time purchase is complete."} Your organisation now appears on this office in the 3D city.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
            <ButtonLink href="/dashboard/agents/new" variant="secondary">Register an agent</ButtonLink>
          </div>
        </div>
      ) : data?.status === "pending" ? (
        <div className="max-w-xl space-y-4 text-fg-muted">
          {/* Stripe usually confirms within seconds; refresh until it does. */}
          <meta httpEquiv="refresh" content="3" />
          <p className="flex items-center gap-2">
            <Loader2 className="size-5 animate-spin text-cyan" aria-hidden="true" /> Stripe is confirming your payment. This page refreshes on its own.
          </p>
        </div>
      ) : (
        <div className="max-w-xl space-y-4 text-fg-muted">
          <p>
            {data?.status === "conflict"
              ? "The office was taken by someone else before your payment completed, so your payment is being refunded automatically."
              : "If you just paid, check your dashboard in a minute. Your receipt is in your email from Stripe."}
          </p>
          <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
        </div>
      )}
    </PageShell>
  );
}
