import type { Building, BuildingIndicator, CityActivity, CitySnapshot, Office, Organization } from "./types";

/** Pre-indexed view of a snapshot for O(1) lookups on the client and server. */
export interface CityIndex {
  snapshot: CitySnapshot;
  buildingById: Map<string, Building>;
  officesByBuilding: Map<string, Office[]>;
  orgById: Map<string, Organization>;
  indicatorByBuilding: Map<string, BuildingIndicator>;
  /** Buildings whose platform agents ran in the latest session. */
  activeBuildings: Map<string, { org: Organization; run: CityActivity["runs"][string] }>;
}

export function indicatorFor(offices: Office[]): BuildingIndicator {
  if (offices.some((o) => o.status === "platform")) return "platform";
  const available = offices.filter((o) => o.status === "available");
  if (available.length === 0) return "occupied";
  return available.some((o) => o.tier === "standard") ? "free" : "premium";
}

export function indexCity(snapshot: CitySnapshot): CityIndex {
  const buildingById = new Map(snapshot.buildings.map((b) => [b.id, b]));
  const officesByBuilding = new Map<string, Office[]>();
  for (const o of snapshot.offices) {
    const list = officesByBuilding.get(o.buildingId) ?? [];
    list.push(o);
    officesByBuilding.set(o.buildingId, list);
  }
  const indicatorByBuilding = new Map<string, BuildingIndicator>();
  for (const b of snapshot.buildings) {
    indicatorByBuilding.set(b.id, indicatorFor(officesByBuilding.get(b.id) ?? []));
  }
  const orgById = new Map(snapshot.organizations.map((o) => [o.id, o]));
  const activeBuildings: CityIndex["activeBuildings"] = new Map();
  for (const [slug, run] of Object.entries(snapshot.activity?.runs ?? {})) {
    const org = snapshot.organizations.find((o) => o.slug === slug);
    const office = org && snapshot.offices.find((o) => o.organizationId === org.id);
    if (org && office && !activeBuildings.has(office.buildingId)) activeBuildings.set(office.buildingId, { org, run });
  }
  return { snapshot, buildingById, officesByBuilding, orgById, indicatorByBuilding, activeBuildings };
}

export function organizationForBuilding(index: CityIndex, buildingId: string): Organization | null {
  const office = index.officesByBuilding.get(buildingId)?.find((o) => o.organizationId);
  return office?.organizationId ? (index.orgById.get(office.organizationId) ?? null) : null;
}

export interface SearchResult {
  kind: "building" | "organization" | "district";
  id: string;
  title: string;
  subtitle: string;
  /** Building to focus when selected. */
  buildingId?: string;
  center?: [number, number];
}

export function searchCity(index: CityIndex, raw: string, limit = 8): SearchResult[] {
  const q = raw.trim().toLowerCase().slice(0, 80);
  if (!q) return [];
  const results: SearchResult[] = [];
  const { snapshot } = index;
  const districtName = new Map(snapshot.districts.map((d) => [d.id, d.name]));

  for (const org of snapshot.organizations) {
    if (`${org.name} ${org.tagline}`.toLowerCase().includes(q)) {
      const office = snapshot.offices.find((o) => o.organizationId === org.id);
      results.push({ kind: "organization", id: org.id, title: org.name, subtitle: org.tagline, buildingId: office?.buildingId });
    }
  }
  for (const d of snapshot.districts) {
    if (d.name.toLowerCase().includes(q)) {
      results.push({ kind: "district", id: d.id, title: d.name, subtitle: "District", center: d.center });
    }
  }
  for (const b of snapshot.buildings) {
    if (results.length >= limit * 2) break;
    if (`${b.name} ${b.address} ${b.id}`.toLowerCase().includes(q)) {
      results.push({ kind: "building", id: b.id, title: b.name, subtitle: districtName.get(b.districtId) ?? "", buildingId: b.id });
    }
  }
  return results.slice(0, limit);
}

export const INDICATOR_META: Record<BuildingIndicator, { label: string; color: string; description: string }> = {
  free: { label: "Free office available", color: "#38e1ff", description: "Claim at no cost" },
  premium: { label: "Premium office available", color: "#e2b86b", description: "High-visibility location" },
  occupied: { label: "Occupied", color: "#8b93a7", description: "All suites taken" },
  platform: { label: "Platform office", color: "#a78bfa", description: "Operated by Second Wall Street" },
};

export const TIER_LABEL = { standard: "Standard · Free", premium: "Premium", landmark: "Landmark" } as const;
