import type { Metadata } from "next";
import Link from "next/link";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { INDICATOR_META, TIER_LABEL, indexCity } from "@/lib/city/queries";
import { PageShell } from "@/components/site/page-shell";

// Re-render at most once a minute (and immediately after claims via revalidatePath).
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Office Directory",
  description: "Every building and office in Second Wall Street, by district — an accessible, text-only alternative to the 3D city.",
  alternates: { canonical: "/directory" },
};

export default async function DirectoryPage() {
  const snapshot = await getCitySnapshot();
  const index = indexCity(snapshot);
  return (
    <PageShell
      eyebrow="Directory"
      title="Every office in the district"
      intro={<p>A list view of the city. Works on any device, with or without 3D graphics.</p>}
    >
      <div className="space-y-14">
        {snapshot.districts.map((d) => {
          const buildings = snapshot.buildings.filter((b) => b.districtId === d.id);
          return (
            <section key={d.id} aria-labelledby={`d-${d.slug}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
                <h2 id={`d-${d.slug}`} className="text-xl font-semibold">
                  {d.name}
                </h2>
                <Link prefetch={false} href={`/city?district=${d.slug}`} className="text-sm text-cyan-soft hover:underline">
                  View in 3D →
                </Link>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {buildings.map((b) => {
                  const ind = index.indicatorByBuilding.get(b.id) ?? "occupied";
                  const offices = index.officesByBuilding.get(b.id) ?? [];
                  const open = offices.filter((o) => o.status === "available").length;
                  return (
                    <li key={b.id}>
                      <Link href={`/buildings/${b.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-ink-900 p-4 hover:border-cyan/40">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: INDICATOR_META[ind].color }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{b.name}</span>
                          <span className="block text-xs text-fg-muted">
                            {INDICATOR_META[ind].label} · {TIER_LABEL[b.tier]} · {open}/{offices.length} open
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
