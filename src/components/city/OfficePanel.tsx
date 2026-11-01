"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowUpRight, BadgeCheck, Bot, Building2, Crosshair, MapPin, Star, X } from "lucide-react";
import type { CityIndex } from "@/lib/city/queries";
import { INDICATOR_META, TIER_LABEL, organizationForBuilding } from "@/lib/city/queries";
import type { Office } from "@/lib/city/types";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";

const AGENT_STATUS = { "in-development": "In development", preview: "Preview", live: "Live" } as const;

export function OfficePanel({
  index,
  buildingId,
  onClose,
  onFocus,
}: {
  index: CityIndex;
  buildingId: string;
  onClose: () => void;
  onFocus: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const building = index.buildingById.get(buildingId);
  const offices = index.officesByBuilding.get(buildingId) ?? [];
  const org = organizationForBuilding(index, buildingId);
  const agents = org ? index.snapshot.agents.filter((a) => a.organizationId === org.id) : [];
  const district = index.snapshot.districts.find((d) => d.id === building?.districtId);
  const indicator = index.indicatorByBuilding.get(buildingId) ?? "occupied";
  const meta = INDICATOR_META[indicator];

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [buildingId]);

  if (!building) return null;

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={`${building.name} details`}
      className="glass pointer-events-auto flex max-h-[55dvh] w-full flex-col overflow-hidden rounded-t-3xl outline-none sm:max-h-[calc(100dvh-7rem)] sm:w-[400px] sm:rounded-3xl"
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden="true" />
      <header className="flex items-start gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-fg-muted">
            <MapPin className="size-3.5" aria-hidden="true" />
            {district?.name}
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{org?.name ?? building.name}</h2>
          <p className="text-sm text-fg-muted">{org ? building.name : building.address}</p>
        </div>
        <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-white/10 hover:text-fg" aria-label="Close details">
          <X className="size-5" />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 px-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs">
          <span className="size-2 rounded-full" style={{ background: meta.color }} aria-hidden="true" />
          {meta.label}
        </span>
        <Badge tone={building.tier === "standard" ? "cyan" : "gold"}>{TIER_LABEL[building.tier]}</Badge>
        <Badge>{building.floors} floors</Badge>
      </div>

      <div className="mt-4 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 pb-5 safe-bottom">
        {org ? (
          <section aria-label="Organization">
            <p className="text-sm leading-relaxed text-fg-muted">{org.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {org.verified && (
                <Badge tone="violet">
                  <BadgeCheck className="size-3.5" aria-hidden="true" /> {org.operator === "platform" ? "Operated by Second Wall Street" : "Verified"}
                </Badge>
              )}
              {org.isDemo && <Badge tone="gold">Demo · simulated data only</Badge>}
            </div>
          </section>
        ) : (
          <section aria-label="Why claim">
            <p className="text-sm leading-relaxed text-fg-muted">
              {indicator === "free"
                ? "This building has free offices. Claim one to give your organisation a home in the district and list your AI agents here."
                : "A high-visibility location reserved for premium offices. Pricing will be announced before premium offices open."}
            </p>
          </section>
        )}

        {agents.length > 0 && (
          <section aria-labelledby="agents-h">
            <h3 id="agents-h" className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
              AI agents
            </h3>
            <ul className="mt-2 space-y-2">
              {agents.map((a) => (
                <li key={a.id} className="rounded-2xl border border-line bg-white/[0.03] p-3">
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-cyan" aria-hidden="true" />
                    <span className="text-sm font-medium">{a.name}</span>
                    <span className="ml-auto text-[11px] text-fg-subtle">{AGENT_STATUS[a.status]}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">{a.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="offices-h">
          <h3 id="offices-h" className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Offices in this building
          </h3>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
            {offices.map((o) => (
              <OfficeRow key={o.id} office={o} orgName={o.organizationId ? index.orgById.get(o.organizationId)?.name : undefined} />
            ))}
          </ul>
        </section>

        <section aria-labelledby="reviews-h">
          <h3 id="reviews-h" className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Ratings & reviews
          </h3>
          <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
            <Star className="size-4" aria-hidden="true" /> No reviews yet.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onFocus} className={buttonClass("secondary", "min-h-10")}>
            <Crosshair className="size-4" aria-hidden="true" /> Fly to building
          </button>
          <Link href={org ? `/orgs/${org.slug}` : `/buildings/${building.id}`} className={buttonClass("secondary", "min-h-10")}>
            {org ? <Building2 className="size-4" aria-hidden="true" /> : null}
            {org ? "Organization page" : "Building page"} <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function OfficeRow({ office, orgName }: { office: Office; orgName?: string }) {
  const free = office.status === "available" && office.tier === "standard";
  const premium = office.status === "available" && office.tier !== "standard";
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{office.label}</p>
        <p className="truncate text-xs text-fg-subtle">
          {office.status === "available" ? (free ? "Available · Free" : `Available · ${TIER_LABEL[office.tier]}`) : (orgName ?? "Occupied")}
        </p>
      </div>
      {free && (
        <Link href={`/claim/${encodeURIComponent(office.id)}`} className={buttonClass("primary", "min-h-9 px-4 text-xs")}>
          Claim free
        </Link>
      )}
      {premium && (
        <Link href={`/claim/${encodeURIComponent(office.id)}`} className={buttonClass("secondary", "min-h-9 px-4 text-xs")}>
          Join waitlist
        </Link>
      )}
    </li>
  );
}
