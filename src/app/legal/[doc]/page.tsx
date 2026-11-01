import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_DOCS, type LegalSlug } from "@/lib/site";
import { PageShell } from "@/components/site/page-shell";

const BODY: Record<LegalSlug, string[]> = {
  terms: [
    "Second Wall Street provides virtual offices, an AI software directory and financial education tools.",
    "Virtual offices are digital listings. They are not real estate, securities or investment products.",
  ],
  privacy: [
    "We collect only what is needed to run the service. We will support data export and account deletion, and honour GDPR and applicable US privacy rights.",
  ],
  risk: [
    "Nothing on Second Wall Street is investment advice or a recommendation to buy or sell any security.",
    "Research, simulations and backtests are educational. Hypothetical and past results do not guarantee future outcomes. Market data may be delayed; each item states its source and timestamp.",
    "Second Wall Street is not a broker-dealer, exchange or investment adviser and does not hold customer funds or securities.",
  ],
  "acceptable-use": [
    "No fraud, market manipulation, misleading performance claims, unlicensed financial services, malware or abuse of other users or agents.",
  ],
  refunds: ["Refund terms for paid office subscriptions will be published before any paid plan is offered."],
  marketplace: [
    "Providers must describe their agents accurately, disclose limitations and comply with applicable law. Listings may be moderated, suspended or removed.",
  ],
};

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
        <p className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-gold">
          Draft summary — pending review by qualified counsel. Full terms will be published before accounts and payments launch.
        </p>
        {BODY[slug].map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </PageShell>
  );
}
