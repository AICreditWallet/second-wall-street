"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BadgeCheck, Bot, DoorOpen, Layers3, MapPin, Star, X } from "lucide-react";
import type { CityIndex } from "@/lib/city/queries";
import { INDICATOR_META, TIER_LABEL, organizationForBuilding } from "@/lib/city/queries";
import { floorDirectory } from "@/lib/city/interiors";
import type { Office } from "@/lib/city/types";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { officeColor, officeStatusText } from "./scene/FloorStack";

const AGENT_STATUS = { "in-development": "In development", preview: "Preview", live: "Live" } as const;

export function PanelShell({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [label]);
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      className={`glass pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-3xl outline-none transition-[max-height] duration-300 sm:max-h-[calc(100dvh-8.5rem)] sm:w-[400px] sm:rounded-3xl ${collapsed ? "max-h-[8.5rem]" : "max-h-[55dvh]"}`}
      data-testid="details-panel"
    >
      {/* Phone bottom sheet: tap the handle to peek at the scene. */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="mx-auto grid h-6 w-20 shrink-0 place-items-center sm:hidden"
        aria-label={collapsed ? "Expand details" : "Collapse details"}
        aria-expanded={!collapsed}
      >
        <span className="h-1 w-10 rounded-full bg-white/30" />
      </button>
      {children}
    </aside>
  );
}

export function PanelHeader({ eyebrow, title, subtitle, onClose, closeLabel = "Close details" }: { eyebrow?: React.ReactNode; title: string; subtitle?: string; onClose: () => void; closeLabel?: string }) {
  return (
    <header className="flex items-start gap-3 px-5 pb-3 pt-4">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="flex items-center gap-1.5 text-xs text-fg-muted">{eyebrow}</p>}
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-white/10 hover:text-fg" aria-label={closeLabel}>
        <X className="size-5" />
      </button>
    </header>
  );
}

export function FloorRow({
  office,
  orgName,
  selected,
  canEnter,
  onSelect,
  onEnter,
}: {
  office: Office;
  orgName?: string;
  selected?: boolean;
  canEnter: boolean;
  onSelect?: () => void;
  onEnter?: () => void;
}) {
  const free = office.status === "available" && office.tier === "standard";
  const premium = office.status === "available" && office.tier !== "standard";
  return (
    <li
      className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${selected ? "bg-white/[0.07]" : ""}`}
      data-office-id={office.id}
      onMouseEnter={onSelect}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: officeColor(office) }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{office.label}</p>
        <p className="truncate text-xs text-fg-subtle">{officeStatusText(office, orgName)}</p>
      </div>
      {canEnter && onEnter && (
        <button type="button" onClick={onEnter} className={buttonClass("secondary", "min-h-9 px-3 text-xs")} aria-label={`Visit ${office.label}`}>
          <DoorOpen className="size-3.5" aria-hidden="true" /> Visit
        </button>
      )}
      {free && (
        <Link href={`/claim/${encodeURIComponent(office.id)}`} className={buttonClass("primary", "min-h-9 px-3 text-xs")}>
          Claim free
        </Link>
      )}
      {premium && (
        <Link href={`/claim/${encodeURIComponent(office.id)}`} className={buttonClass("secondary", "min-h-9 px-3 text-xs")}>
          Waitlist
        </Link>
      )}
    </li>
  );
}

export function BuildingPanel({
  index,
  buildingId,
  view,
  selectedOfficeId,
  canEnter,
  onSelectOffice,
  onClose,
  onExploreFloors,
  onEnterLobby,
  onEnterOffice,
}: {
  index: CityIndex;
  buildingId: string;
  view: "city" | "building";
  selectedOfficeId: string | null;
  canEnter: boolean;
  onSelectOffice: (id: string) => void;
  onClose: () => void;
  onExploreFloors: () => void;
  onEnterLobby: () => void;
  onEnterOffice: (officeId: string) => void;
}) {
  const building = index.buildingById.get(buildingId);
  const offices = index.officesByBuilding.get(buildingId) ?? [];
  const org = organizationForBuilding(index, buildingId);
  const agents = org ? index.snapshot.agents.filter((a) => a.organizationId === org.id) : [];
  const district = index.snapshot.districts.find((d) => d.id === building?.districtId);
  const indicator = index.indicatorByBuilding.get(buildingId) ?? "occupied";
  const meta = INDICATOR_META[indicator];
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the selected floor (e.g. clicked in 3D) in view.
  useEffect(() => {
    if (!selectedOfficeId) return;
    listRef.current?.querySelector(`[data-office-id="${CSS.escape(selectedOfficeId)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedOfficeId]);

  if (!building) return null;
  const available = offices.filter((o) => o.status === "available").length;

  return (
    <PanelShell label={`${building.name} details`}>
      <PanelHeader
        eyebrow={
          <>
            <MapPin className="size-3.5" aria-hidden="true" />
            {district?.name}
          </>
        }
        title={org?.name ?? building.name}
        subtitle={org ? building.name : building.address}
        onClose={onClose}
      />

      <div className="flex flex-wrap items-center gap-2 px-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs">
          <span className="size-2 rounded-full" style={{ background: meta.color }} aria-hidden="true" />
          {meta.label}
        </span>
        <Badge tone={building.tier === "standard" ? "cyan" : "gold"}>{TIER_LABEL[building.tier]}</Badge>
        <Badge>{building.floors} floors</Badge>
        <Badge>
          {available}/{offices.length} offices open
        </Badge>
      </div>

      {canEnter && (
        <div className="mt-4 grid grid-cols-2 gap-2 px-5">
          {view === "city" ? (
            <button type="button" onClick={onExploreFloors} className={buttonClass("secondary", "min-h-10")}>
              <Layers3 className="size-4" aria-hidden="true" /> Show floors
            </button>
          ) : (
            <span className="flex min-h-10 items-center justify-center rounded-full border border-cyan/30 bg-cyan/10 text-xs text-cyan-soft">
              Floors shown in 3D
            </span>
          )}
          <button type="button" onClick={onEnterLobby} className={buttonClass("primary", "min-h-10")}>
            <DoorOpen className="size-4" aria-hidden="true" /> Enter building
          </button>
        </div>
      )}

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
          <p className="text-sm leading-relaxed text-fg-muted">
            {indicator === "free"
              ? "This building has free offices. Claim one to give your organisation a home in the district and list your AI agents here."
              : "A high-visibility location reserved for premium offices. Pricing will be announced before premium offices open."}
          </p>
        )}

        <section aria-labelledby="floors-h">
          <h3 id="floors-h" className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Floor directory
          </h3>
          <ul ref={listRef} className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {floorDirectory(offices).map((o) => (
              <FloorRow
                key={o.id}
                office={o}
                orgName={o.organizationId ? index.orgById.get(o.organizationId)?.name : undefined}
                selected={o.id === selectedOfficeId}
                canEnter={canEnter}
                onSelect={() => onSelectOffice(o.id)}
                onEnter={() => onEnterOffice(o.id)}
              />
            ))}
          </ul>
          {!canEnter && <p className="mt-2 text-xs text-fg-subtle">Office interiors need 3D graphics. You can still claim offices from here.</p>}
        </section>

        {agents.length > 0 && (
          <section aria-labelledby="agents-h">
            <h3 id="agents-h" className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
              AI agents
            </h3>
            <ul className="mt-2 space-y-2">
              {agents.map((a) => (
                <li key={a.id}>
                  <Link href={`/agents/${a.slug}`} className="block rounded-2xl border border-line bg-white/[0.03] p-3 hover:border-cyan/40">
                    <span className="flex items-center gap-2">
                      <Bot className="size-4 text-cyan" aria-hidden="true" />
                      <span className="text-sm font-medium">{a.name}</span>
                      <span className="ml-auto text-[11px] text-fg-subtle">{AGENT_STATUS[a.status]}</span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-fg-muted">{a.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="reviews-h">
          <h3 id="reviews-h" className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
            Ratings & reviews
          </h3>
          <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
            <Star className="size-4" aria-hidden="true" /> No reviews yet.
          </p>
        </section>

        <Link href={org ? `/orgs/${org.slug}` : `/buildings/${building.id}`} className={buttonClass("secondary", "min-h-10")}>
          {org ? "Organisation page" : "Building page"} <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </PanelShell>
  );
}
