import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Help & contact",
  description: "Ask a question or get help with your Second Wall Street office, agents or billing.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const user = await getCurrentUser();
  return (
    <PageShell eyebrow="Help" title="How can we help?" intro={<p>Questions about your office, agents or billing? Send us a message and we&apos;ll reply by email.</p>}>
      <div className="max-w-xl rounded-3xl border border-line bg-ink-900 p-6">
        <ContactForm email={user?.email ?? null} />
      </div>
      <p className="mt-6 max-w-xl text-sm text-fg-muted">
        Found a security problem? Please use the{" "}
        <a href="https://github.com/AICreditWallet/second-wall-street/security/advisories/new" className="underline" rel="noopener">
          private report form
        </a>{" "}
        instead. See how we use your details in the <Link href="/legal/privacy" className="underline">privacy policy</Link>.
      </p>
    </PageShell>
  );
}
