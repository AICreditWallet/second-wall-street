import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";
import { officeIdSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Get Started", description: "Create a free account and claim your office on Second Wall Street." };

const STEPS = [
  ["Create a free account", "Sign up with GitHub or email."],
  ["Pick an office", "Explore the city and choose any office marked as free."],
  ["Name your organisation", "Give it a name and a web address. Add a logo and description whenever you like."],
  ["List your AI agents", "Coming next: publish agents so visitors can discover them."],
] as const;

export default async function GetStartedPage({ searchParams }: { searchParams: Promise<{ office?: string | string[] }> }) {
  const office = (await searchParams).office;
  if (typeof office === "string" && officeIdSchema.safeParse(office).success) redirect(`/claim/${office}`);
  return (
    <PageShell eyebrow="Get started" title="Claim your place on Second Wall Street" intro={<p>Free for standard offices. No credit card. About two minutes.</p>}>
      <ol className="grid max-w-3xl gap-3 sm:grid-cols-2">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="rounded-3xl border border-line bg-ink-900 p-5">
            <span className="font-mono text-xs text-fg-subtle">0{i + 1}</span>
            <h2 className="mt-3 font-medium">{title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/sign-up?next=/city%3Ffilter%3Dfree">Create free account</ButtonLink>
        <ButtonLink href="/city?filter=free" variant="secondary">
          Browse free offices first
        </ButtonLink>
      </div>
    </PageShell>
  );
}
