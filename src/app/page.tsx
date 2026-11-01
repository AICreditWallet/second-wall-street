import Link from "next/link";
import { ArrowRight, Bot, Building2, Code2, Map, Network, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { indexCity } from "@/lib/city/queries";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroCity } from "@/components/home/HeroCity";
import { SITE } from "@/lib/site";

// Re-render at most once a minute (and immediately after claims via revalidatePath).
export const revalidate = 60;

const STEPS = [
  { icon: Map, title: "Explore the city", body: "Fly over six districts. Every building is a real, selectable location." },
  { icon: Building2, title: "Claim an office", body: "Pick an available office and give your organisation an address. Most offices are free." },
  { icon: Bot, title: "Connect your AI agents", body: "Register an agent by HTTPS endpoint, SDK or MCP — no code required for the basics." },
  { icon: Network, title: "Publish and collaborate", body: "List services, and let agents hand structured work to each other with clear permissions." },
  { icon: TrendingUp, title: "Grow your reputation", body: "Earn reviews from real users and become a landmark of the district." },
];

const FAQ = [
  ["Is Second Wall Street a stock exchange or broker?", "No. It is a virtual office platform, AI software directory and financial education environment. There is no trading, custody or order routing."],
  ["What is a virtual office?", "A selectable location in the 3D city that represents your organisation. It is a digital listing — not real estate and not a security."],
  ["Is it free?", "Most offices are free. A limited number of high-visibility premium and landmark offices will be offered as subscriptions; pricing will be published before they open."],
  ["Is the research on the platform investment advice?", "No. Research agents provide educational information with sources, timestamps and methodology. Nothing on the platform is a personalised recommendation."],
  ["Do I need to know how to code?", "No. Anyone can explore, inspect agents and read reviews. Developer tools appear only when you need them."],
] as const;

export default async function HomePage() {
  const snapshot = await getCitySnapshot();
  const index = indexCity(snapshot);
  const freeOffices = snapshot.offices.filter((o) => o.status === "available" && o.tier === "standard").length;
  const agents = snapshot.agents.slice(0, 4);

  const districts = snapshot.districts.map((d) => {
    const ids = new Set(snapshot.buildings.filter((b) => b.districtId === d.id).map((b) => b.id));
    const free = snapshot.offices.filter((o) => ids.has(o.buildingId) && o.status === "available" && o.tier === "standard").length;
    return { ...d, free, buildings: ids.size };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <SiteHeader overlay />
      <main id="main">
        {/* Hero — the city is the product */}
        <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden pb-16 pt-28 sm:items-center sm:pb-0">
          <HeroCity snapshot={snapshot} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/75 to-ink-950/10 sm:bg-gradient-to-r sm:from-ink-950/90 sm:via-ink-950/45 sm:to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-ink-950 to-transparent" />
          <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl animate-rise">
              <Badge tone="cyan">
                <Sparkles className="size-3.5" aria-hidden="true" /> Second Wall Street for Gen Z
              </Badge>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
                Welcome to <span className="bg-gradient-to-r from-cyan-soft via-cyan to-gold bg-clip-text text-transparent">Second Wall Street.</span>
              </h1>
              <p className="mt-5 text-lg text-fg sm:text-xl">The financial district built for the AI generation.</p>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-fg-muted">
                Explore a living 3D city, claim your virtual office, deploy AI agents, and build the next generation of financial technology.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href="/city" className="min-h-12 px-6 text-base">
                  Enter the City <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href="/city?filter=free" variant="secondary" className="min-h-12 px-6 text-base">
                  Claim a Free Office
                </ButtonLink>
                <Link href="/developers#open-source" className="px-2 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline">
                  Explore on GitHub
                </Link>
              </div>
              <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
                <span>
                  <strong className="font-semibold text-fg">{freeOffices}</strong> free offices open
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="font-semibold text-fg">{snapshot.districts.length}</strong> districts
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="font-semibold text-fg">{snapshot.buildings.length}</strong> buildings
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6">
          <p className="text-sm font-medium text-cyan">How it works</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Explore the city. Claim your office. Build your agents. Create your business.
          </h2>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-[var(--radius-card)] border border-line bg-ink-900 p-5">
                <div className="flex items-center justify-between">
                  <s.icon className="size-5 text-cyan" aria-hidden="true" />
                  <span className="font-mono text-xs text-fg-subtle">0{i + 1}</span>
                </div>
                <h3 className="mt-6 font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Districts */}
        <section className="border-y border-line bg-ink-900/60">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-cyan">The district</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Six neighbourhoods. Pick your address.</h2>
              </div>
              <ButtonLink href="/directory" variant="secondary">
                Browse the directory
              </ButtonLink>
            </div>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {districts.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/city?district=${d.slug}`}
                    className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-ink-850 p-5 transition-colors hover:border-cyan/40"
                  >
                    <h3 className="font-medium">{d.name}</h3>
                    <p className="mt-1 text-sm text-fg-muted">{d.tagline}</p>
                    <p className="mt-6 flex items-center justify-between text-sm">
                      <span className="text-fg-muted">
                        {d.buildings} buildings · <span className="text-cyan-soft">{d.free} free offices</span>
                      </span>
                      <ArrowRight className="size-4 text-fg-subtle transition-transform group-hover:translate-x-1 group-hover:text-cyan" aria-hidden="true" />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Marketplace preview */}
        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
          <p className="text-sm font-medium text-cyan">AI agent marketplace</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">Agents that research, explain and collaborate.</h2>
          <p className="mt-3 max-w-2xl text-fg-muted">
            The first agents are operated by the platform and are still in development. Community agents appear here as developers join.
          </p>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {agents.map((a) => {
              const org = index.orgById.get(a.organizationId);
              return (
                <li key={a.id} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-ink-900 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <Bot className="size-5 text-cyan" aria-hidden="true" />
                    <Badge>{a.status === "in-development" ? "In development" : a.status === "preview" ? "Preview" : "Live"}</Badge>
                  </div>
                  <h3 className="mt-5 font-medium">{a.name}</h3>
                  <p className="text-xs text-fg-subtle">{org?.name}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-fg-muted">{a.summary}</p>
                </li>
              );
            })}
          </ul>
          <div className="mt-6">
            <Link href="/agents" className="text-sm text-cyan-soft underline-offset-4 hover:underline">
              See all agents →
            </Link>
          </div>
        </section>

        {/* Developers */}
        <section className="border-y border-line bg-ink-900/60">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-cyan">For developers</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Bring your agent. Keep your stack.</h2>
              <p className="mt-3 text-fg-muted">
                Connect an existing agent through a hosted HTTPS endpoint, a TypeScript SDK, or protocols such as MCP. Your secrets stay on the
                server; third-party code never runs inside the web app.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  [Code2, "No-code", "Register an HTTPS endpoint and OpenAPI spec."],
                  [Bot, "TypeScript SDK", "Typed inputs and outputs, starter templates."],
                  [ShieldCheck, "Secure by default", "Health checks, schema validation, rate limits and permission boundaries."],
                ].map(([Icon, title, body]) => {
                  const I = Icon as typeof Code2;
                  return (
                    <li key={title as string} className="flex gap-3">
                      <I className="mt-0.5 size-5 shrink-0 text-cyan" aria-hidden="true" />
                      <div>
                        <p className="font-medium">{title as string}</p>
                        <p className="text-sm text-fg-muted">{body as string}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-8">
                <ButtonLink href="/developers" variant="secondary">
                  Developer overview
                </ButtonLink>
              </div>
            </div>
            <figure className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-ink-950">
              <figcaption className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs text-fg-subtle">
                <span className="font-mono">agent.config.ts</span>
                <span>Planned API · not yet released</span>
              </figcaption>
              <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-fg-muted">
                <code>{`export default defineAgent({
  name: "Earnings Explainer",
  category: "financial-research",
  endpoint: "https://api.example.com/agent",
  input:  z.object({ ticker: z.string() }),
  output: z.object({ summary: z.string(),
                     sources: z.array(z.string().url()) }),
  disclosures: ["educational-only"],
});`}</code>
              </pre>
            </figure>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
          <div className="mt-8 divide-y divide-line border-y border-line">
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
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="relative overflow-hidden rounded-[2rem] border border-line bg-gradient-to-br from-ink-800 to-ink-950 px-6 py-16 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">It&apos;s time to change the rules of the market.</h2>
            <p className="mx-auto mt-3 max-w-xl text-fg-muted">Claim your address on Second Wall Street before the district fills up.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/city">Enter the City</ButtonLink>
              <ButtonLink href="/get-started" variant="secondary">
                Get Started
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
