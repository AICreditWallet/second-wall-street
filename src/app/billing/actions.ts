"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { checkoutParams } from "@/lib/billing/checkout";
import { automaticTax, ensurePortalConfiguration, ensurePrice, getStripe, sellingEnabled } from "@/lib/billing/stripe";
import { revalidateCity } from "@/lib/revalidate";
import { SITE } from "@/lib/site";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, officeIdSchema, orgNameSchema, slugSchema, type FormState } from "@/lib/validation";

const kindSchema = z.enum(["monthly", "lifetime"]);
const SESSION_MINUTES = 30;

/** Reserves the office in the database, then sends the person to Stripe Checkout. */
export async function startCheckout(_: FormState, formData: FormData): Promise<FormState> {
  const officeId = officeIdSchema.safeParse(formData.get("officeId"));
  const kind = kindSchema.safeParse(formData.get("kind"));
  if (!officeId.success) return { message: "That office doesn't exist." };
  if (!kind.success) return { message: "Choose monthly or one-time." };
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const stripe = getStripe();
  if (!user || !supabase) return { message: "Please sign in to continue." };
  if (!stripe || !admin || !sellingEnabled) return { message: "Payments aren't switched on yet. Please try again soon." };

  let org: { name: string; slug: string; tagline: string } | null = null;
  if (formData.get("newOrg") === "1") {
    const parsed = z
      .object({ name: orgNameSchema, slug: slugSchema, tagline: z.string().trim().max(120, "At most 120 characters.") })
      .safeParse({ name: formData.get("name"), slug: formData.get("slug"), tagline: formData.get("tagline") ?? "" });
    if (!parsed.success) return { errors: fieldErrors(parsed.error) };
    org = parsed.data;
  }

  const { data, error } = await supabase.rpc("start_office_purchase", {
    p_office_id: officeId.data,
    p_kind: kind.data,
    p_org_name: org?.name ?? null,
    p_org_slug: org?.slug ?? null,
    p_org_tagline: org?.tagline ?? null,
  });
  if (error) {
    const message = friendlyError(error);
    if (error.message === "slug_taken" || error.message === "slug_reserved") return { errors: { slug: message } };
    return { message };
  }
  const purchase = data as { purchase_id: string; office_id: string };

  let url: string;
  try {
    const price = await ensurePrice(stripe, kind.data);
    const { data: customer } = await supabase.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
    const session = await stripe.checkout.sessions.create(
      checkoutParams({
        kind: kind.data,
        price,
        purchaseId: purchase.purchase_id,
        officeId: purchase.office_id,
        customerId: customer?.stripe_customer_id ?? null,
        email: user.email,
        siteUrl: SITE.url,
        automaticTax,
        expiresAt: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
      }),
      { idempotencyKey: `checkout-${purchase.purchase_id}` },
    );
    const attach = await admin.rpc("billing_attach_session", { p_purchase: purchase.purchase_id, p_session: session.id });
    if (attach.error || !session.url) throw new Error(attach.error?.message ?? "no_session_url");
    url = session.url;
  } catch (e) {
    console.error("checkout_failed", (e as Error).message);
    await supabase.rpc("cancel_office_purchase", { p_purchase: purchase.purchase_id });
    return { message: "We couldn't open the payment page. Nothing was charged — please try again." };
  }
  revalidateCity();
  redirect(url);
}

/** Lets the person release the office they reserved but didn't pay for. */
export async function cancelCheckout(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("purchase"));
  const officeId = officeIdSchema.safeParse(formData.get("officeId"));
  const supabase = await createSupabaseServerClient();
  if (id.success && supabase) {
    await supabase.rpc("cancel_office_purchase", { p_purchase: id.data });
    revalidateCity();
  }
  redirect(officeId.success ? `/claim/${officeId.data}` : "/dashboard");
}

/** Stripe's customer portal: change card, download invoices, cancel at period end. */
export async function openBillingPortal() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const stripe = getStripe();
  if (!user || !supabase) redirect("/sign-in?next=/dashboard");
  if (!stripe) redirect("/dashboard?billing=unavailable");
  const { data } = await supabase.from("billing_customers").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
  if (!data?.stripe_customer_id) redirect("/dashboard?billing=none");
  let url: string;
  try {
    const configuration = await ensurePortalConfiguration(stripe);
    url = (await stripe.billingPortal.sessions.create({ customer: data.stripe_customer_id, configuration, return_url: `${SITE.url}/dashboard` })).url;
  } catch (e) {
    console.error("portal_failed", (e as Error).message);
    redirect("/dashboard?billing=unavailable");
  }
  redirect(url);
}
