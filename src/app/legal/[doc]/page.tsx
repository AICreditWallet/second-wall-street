import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SELLER, sellerConfigured, vatRegistered } from "@/lib/seller";
import { LEGAL_DOCS, SUPPORT_EMAIL, type LegalSlug } from "@/lib/site";
import { PageShell } from "@/components/site/page-shell";

const UPDATED = "4 November 2026";

const BODY: Record<LegalSlug, string[]> = {
  terms: [
    "Second Wall Street provides virtual offices, an AI software directory and financial education tools. By creating an account or buying an office, you agree to these terms.",
    "Offices are digital listings in a virtual city. They are not real estate, securities or investment products, and they give you no ownership of any part of the platform.",
    "A free office is available to each verified developer and includes 1 AI agent. A premium office costs £9.99 per month or £59.99 once, and includes up to 10 AI agents (25 in a landmark tower). " + (vatRegistered ? "All prices are in GBP and include VAT. Tax on your order is shown at checkout." : "All prices are in GBP. We are not VAT registered, so no VAT is charged."),
    "Monthly offices renew every month and your card is charged until you cancel. You can cancel at any time from Manage billing on your dashboard, and you keep the office until the end of the period you have paid for. Your office is held for 30 minutes while you pay; if you don't finish, it is released.",
    "A one-time office has no renewals. You keep it for as long as we run the Second Wall Street service, while you follow these terms. It is not a transfer of ownership. If we ever close the service, we will give you at least 30 days' notice by email.",
    "You are responsible for your account, your organisation's content and any agents you connect. You must follow the Acceptable Use and Marketplace policies. We may suspend or remove listings, offices or accounts that break these terms; if we do so for a serious breach, we may not refund you, except where the law requires it.",
    "Agents listed by developers are run by those developers, not by us, and we don't check their output. Nothing on the platform is investment advice. See the Risk Disclosure.",
    "We try to keep the service available but can't promise it will always be uninterrupted. Nothing in these terms limits liability that can't legally be limited, including for death or personal injury caused by negligence, or for fraud. Otherwise, our total liability to you is limited to the amount you paid us in the 12 months before the claim, and we aren't liable for indirect losses or for lost profits or trading losses.",
    "We may update these terms and will give notice of important changes. These terms are governed by the law of England and Wales. If you are a consumer, you keep the mandatory protections and the right to bring a claim where you live.",
  ],
  privacy: [
    "We collect what we need to run the service: your email address, your name, profile picture and username if you sign in with GitHub, the organisation and agent details you enter, reviews and reports you submit, messages you send through the contact page, and basic technical logs.",
    "We use this to provide your account and offices, take payments, reply to your messages, keep the platform secure, send service messages and meet legal duties such as tax records. Our legal bases are performing our contract with you, our legitimate interest in running and protecting the service, and legal obligation.",
    "Your organisation's name and page, published agents and reviews are public. We don't sell your personal data.",
    "We use these providers to run the service: Supabase (database and sign-in), Vercel (hosting), Stripe (payments and invoices) and GitHub (optional sign-in). Stripe handles card details; we never see or store them. Some of these providers process data in the United States under recognised transfer safeguards.",
    "We keep account data until you delete your account. We keep payment and tax records for as long as the law requires, usually 6 years.",
    "You can export your data or delete your account from your account page. You can also ask us to access, correct, delete or restrict your data, or object to how we use it, by emailing us. If you're unhappy with how we handle your data, you can complain to the UK Information Commissioner's Office (ico.org.uk).",
  ],
  risk: [
    "Nothing on Second Wall Street is investment advice or a recommendation to buy or sell any security.",
    "Research, simulations and backtests are educational. Hypothetical and past results do not guarantee future outcomes. Market data may be simulated or delayed; each item states its source and timestamp.",
    "Second Wall Street is not a broker-dealer, exchange or investment adviser and does not hold customer funds or securities.",
  ],
  "acceptable-use": [
    "No fraud, market manipulation, misleading performance claims, unlicensed financial services, malware or abuse of other users or agents.",
  ],
  refunds: [
    "First 14 days: you can get a full refund if you ask within 14 days of your first payment for an office, whether it's monthly or one-time. Just email us from the address on your account. We refund to your original payment method within 14 days, and your office is released when the refund is made.",
    "Monthly offices (£9.99/month) can be cancelled at any time from Manage billing. The office stays yours until the end of the month you have paid for. Later monthly payments aren't refunded unless something has gone wrong on our side.",
    "One-time offices (£59.99) aren't refundable after the first 14 days, unless something has gone wrong on our side.",
    "If a technical problem means you paid but did not receive the office, you are refunded automatically.",
    "UK consumers keep their statutory rights, and nothing here takes them away.",
  ],
  marketplace: [
    "Providers must describe their agents accurately, disclose limitations and comply with applicable law. Listings may be moderated, suspended or removed.",
  ],
};

/** UK law requires online sellers to say who they are and how to reach them. */
function SellerDetails() {
  return (
    <div className="rounded-xl border border-line bg-ink-900 px-4 py-3 text-sm">
      <p className="font-medium text-fg">Who we are</p>
      {sellerConfigured ? (
        <p className="mt-1">
          Second Wall Street is run by {SELLER.name}, {SELLER.address}.{SELLER.vatNumber ? ` VAT number: ${SELLER.vatNumber}.` : ""}
        </p>
      ) : (
        <p className="mt-1">Second Wall Street is an independent project; this copy has no seller details configured.</p>
      )}
      <p className="mt-1">
        Contact: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-cyan-soft underline">{SUPPORT_EMAIL}</a>
      </p>
    </div>
  );
}

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  if (!(doc in LEGAL_DOCS)) return {};
  return { title: LEGAL_DOCS[doc as LegalSlug], alternates: { canonical: `/legal/${doc}` } };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!(doc in LEGAL_DOCS)) notFound();
  const slug = doc as LegalSlug;
  return (
    <PageShell eyebrow="Legal" title={LEGAL_DOCS[slug]}>
      <div className="max-w-2xl space-y-4 text-fg-muted">
        <p className="text-sm text-fg-subtle">Last updated {UPDATED}</p>
        {(slug === "terms" || slug === "privacy" || slug === "refunds") && <SellerDetails />}
        {BODY[slug].map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </PageShell>
  );
}
