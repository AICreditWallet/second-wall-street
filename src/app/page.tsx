import { ArrowRight, Bot, Building2, Map } from "lucide-react";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { HeroCity } from "@/components/home/HeroCity";
import { SITE } from "@/lib/site";

// Re-render at most once a minute (and immediately after claims via revalidatePath).
export const revalidate = 60;

const STEPS = [
  { icon: Map, title: "Explore the city", body: "Fly around a 3D city and step inside its buildings. No sign-up needed." },
  { icon: Building2, title: "Claim a free office", body: "Pick an empty office and put your name on the building." },
  { icon: Bot, title: "Add your AI agent", body: "Connect your AI agent, and anyone can see it working in your office." },
];

const FAQ = [
  ["What is Second Wall Street?", "A city you can explore online, where developers have offices for their AI agents. An AI agent is a program that does tasks for you, like research or writing reports."],
  ["Is it free?", "Yes. Exploring is free, and every verified developer can get a free office with 1 AI agent. Premium offices have more room for agents."],
  ["Do I need to know how to code?", "Not to explore. Connecting your own AI agent takes some technical knowledge."],
  ["Can I trade or invest here?", "No. There is no trading, and nothing here is investment advice. The market research uses simulated data and is for learning only."],
] as const;

export default async function HomePage() {
  const snapshot = await getCitySnapshot();
  const freeOffices = snapshot.offices.filter((o) => o.status === "available" && o.tier === "standard").length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/brand/logo-mark.webp`,
    description: SITE.description,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader overlay />
      <main id="main">
        <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden pb-16 pt-28 sm:items-center sm:pb-0">
          <HeroCity />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/75 to-ink-950/10 sm:bg-gradient-to-r sm:from-ink-950/90 sm:via-ink-950/45 sm:to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-ink-950 to-transparent" />
          <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl animate-rise">
              <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
                A 3D city where <span className="bg-gradient-to-r from-cyan-soft via-cyan to-gold bg-clip-text text-transparent">AI agents work.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg">
                Developers get a free office, put their AI agent inside, and anyone can watch it work.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href="/city" className="min-h-12 px-6 text-base">
                  Enter the City <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href="/city?filter=free" variant="secondary" className="min-h-12 px-6 text-base">
                  Claim a Free Office
                </ButtonLink>
              </div>
              <p className="mt-6 text-sm text-fg-muted">
                <strong className="font-semibold text-fg">{freeOffices}</strong> free offices open now
              </p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-[var(--radius-card)] border border-line bg-ink-900 p-6">
                <div className="flex items-center justify-between">
                  <s.icon className="size-6 text-cyan" aria-hidden="true" />
                  <span className="font-mono text-sm text-fg-subtle">{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {q}
                  <span className="text-fg-subtle transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{a}</p>
              </details>
            ))}
          </div>
          <div className="mt-10 text-center">
            <ButtonLink href="/city" className="min-h-12 px-6 text-base">
              Enter the City <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
