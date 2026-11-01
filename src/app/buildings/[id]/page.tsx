import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCitySnapshot } from "@/lib/data/city-repository";
import { INDICATOR_META, TIER_LABEL, indexCity, organizationForBuilding } from "@/lib/city/queries";
import { PageShell } from "@/components/site/page-shell";
import { ButtonLink } from "@/components/ui/button";

const ID = /^bld-[a-z]{2}-\d{3}$/;

export const revalidate = 60;

export async function generateStaticParams() {
  const s = await getCitySnapshot();
  return s.buildings.map((b) => ({ id: b.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = await getCitySnapshot();
  const b = s.buildings.find((x) => x.id === id);
  if (!b) return {};
  return { title: b.name, description: `${b.address} — offices in Second Wall Street.`, alternates: { canonical: `/buildings/${b.id}` } };
}

export default async function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const snapshot = await getCitySnapshot();
  const index = indexCity(snapshot);
  const b = index.buildingById.get(id);
  if (!b) notFound();
  const offices = index.officesByBuilding.get(id) ?? [];
  const org = organizationForBuilding(index, id);
  const district = snapshot.districts.find((d) => d.id === b.districtId);
  const ind = index.indicatorByBuilding.get(id) ?? "occupied";

  return (
    <PageShell eyebrow={district?.name} title={b.name} intro={<p>{b.address} · {b.floors} floors · {TIER_LABEL[b.tier]}</p>}>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/city?b=${b.id}`}>View in the 3D city</ButtonLink>
        {org && (
          <ButtonLink href={`/orgs/${org.slug}`} variant="secondary">
            {org.name}
          </ButtonLink>
        )}
      </div>
      <p className="mt-8 flex items-center gap-2 text-sm">
        <span className="size-2.5 rounded-full" style={{ background: INDICATOR_META[ind].color }} aria-hidden="true" />
        {INDICATOR_META[ind].label}
      </p>
      <h2 className="mt-10 text-lg font-semibold">Offices</h2>
      <ul className="mt-3 max-w-2xl divide-y divide-line rounded-2xl border border-line">
        {offices.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <span>
              <span className="block text-sm">{o.label}</span>
              <span className="block text-xs text-fg-muted">
                {o.status === "available" ? `Available · ${TIER_LABEL[o.tier]}` : (o.organizationId && index.orgById.get(o.organizationId)?.name) || "Occupied"}
              </span>
            </span>
            {o.status === "available" && (
              <Link href={`/claim/${o.id}`} className="text-sm text-cyan-soft hover:underline">
                {o.tier === "standard" ? "Claim free" : "Join waitlist"}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
