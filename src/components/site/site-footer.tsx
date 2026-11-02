import Link from "next/link";
import { LEGAL_DOCS, SITE } from "@/lib/site";
import { Logo } from "./logo";

const COLUMNS = [
  { title: "Product", links: [["/city", "Explore City"], ["/directory", "Office Directory"], ["/agents", "AI Agents"], ["/research", "Research"], ["/pricing", "Pricing"]] },
  { title: "Developers", links: [["/developers", "Overview"], ["/developers#integrations", "Connect an agent"], ["/developers#open-source", "Open source"]] },
  { title: "Legal", links: Object.entries(LEGAL_DOCS).map(([slug, title]) => [`/legal/${slug}`, title]) },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink-950">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-fg-muted">{SITE.tagline}</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h2 className="text-sm font-medium text-fg">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-fg-muted hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-6 text-xs leading-relaxed text-fg-subtle sm:px-6">
          Second Wall Street is a virtual office platform, AI software directory and financial education environment. It is not a
          securities exchange, broker-dealer or investment adviser, and nothing here is investment advice. Offices are virtual
          digital locations, not real estate or securities. © {new Date().getFullYear()} Second Wall Street.
        </p>
      </div>
    </footer>
  );
}
