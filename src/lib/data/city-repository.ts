import "server-only";
import { cache } from "react";
import { generateCity } from "@/lib/city/generator";
import type { Agent, Building, CitySnapshot, District, InteriorTemplate, Office, OfficeInterior, Organization, Workstation } from "@/lib/city/types";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import { SUPABASE_URL } from "@/lib/supabase/env";

export function logoUrl(path: string | null | undefined, version?: string) {
  if (!path) return undefined;
  const v = version ? `?v=${encodeURIComponent(new Date(version).getTime().toString(36))}` : "";
  return `${SUPABASE_URL}/storage/v1/object/public/org-logos/${path}${v}`;
}

type OrgRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  website_url: string | null;
  github_url: string | null;
  logo_path: string | null;
  operator: "platform" | "community";
  verified: boolean;
  is_demo: boolean;
  updated_at?: string;
};

export function mapOrg(o: OrgRow): Organization {
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    tagline: o.tagline,
    description: o.description,
    operator: o.operator,
    verified: o.verified,
    isDemo: o.is_demo,
    website: o.website_url ?? undefined,
    githubUrl: o.github_url ?? undefined,
    logoUrl: logoUrl(o.logo_path, o.updated_at),
  };
}

export const ORG_COLUMNS = "id, slug, name, tagline, description, website_url, github_url, logo_path, operator, verified, is_demo, updated_at";

/**
 * Public city snapshot. Reads Supabase as the anonymous role when configured
 * (so RLS decides what is public); otherwise returns the labelled demo dataset.
 * If the database is configured but unreachable we fail loudly rather than
 * silently showing stale demo data as if it were live.
 */
export const getCitySnapshot = cache(async (): Promise<CitySnapshot> => {
  const demo = generateCity();
  const db = createSupabasePublicClient();
  if (!db) return demo;

  const [districts, buildings, offices, orgs, agents] = await Promise.all([
    db.from("districts").select("id, slug, name, tagline, center_x, center_z").order("sort_order"),
    db.from("buildings").select("id, district_id, name, address, pos_x, pos_z, width, depth, height, floors, shape, color, window_style, tier").order("id"),
    db.from("offices").select("id, building_id, label, tier, status, organization_id").order("id"),
    db.from("organizations").select(ORG_COLUMNS),
    db.from("agents").select("id, slug, organization_id, name, category, summary, capabilities, status, disclosure").eq("published", true).order("created_at"),
  ]);
  const failed = [districts, buildings, offices, orgs, agents].find((r) => r.error);
  if (failed?.error) throw new Error(`City data unavailable: ${failed.error.message}`);

  // Interior configuration is optional: if the 3D City v2 migration has not
  // been applied yet, these queries fail and defaults are derived instead.
  const [interiorRows, workstationRows] = await Promise.all([
    db.from("office_interiors").select("office_id, template, accent_color"),
    db.from("agent_workstations").select("office_id, slot, agent_id"),
  ]);
  const interiors: OfficeInterior[] = interiorRows.error
    ? []
    : interiorRows.data.map((r) => ({ officeId: r.office_id, template: r.template as InteriorTemplate, accent: r.accent_color }));
  const workstations: Workstation[] = workstationRows.error
    ? []
    : workstationRows.data.map((r) => ({ officeId: r.office_id, slot: r.slot, agentId: r.agent_id }));

  // Keep the generator's building order so geometry/IDs line up with the layout.
  const order = new Map(demo.buildings.map((b, i) => [b.id, i]));

  return {
    ...demo,
    source: "database",
    interiors,
    workstations,
    districts: districts.data!.map(
      (d): District => ({ id: d.id, slug: d.slug, name: d.name, tagline: d.tagline, center: [d.center_x, d.center_z] }),
    ),
    buildings: buildings
      .data!.map(
        (b): Building => ({
          id: b.id,
          districtId: b.district_id,
          name: b.name,
          address: b.address,
          position: [b.pos_x, b.pos_z],
          footprint: [b.width, b.depth],
          height: b.height,
          floors: b.floors,
          shape: b.shape,
          color: b.color,
          windowStyle: b.window_style,
          tier: b.tier,
        }),
      )
      .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9)),
    offices: offices.data!.map(
      (o): Office => ({
        id: o.id,
        buildingId: o.building_id,
        label: o.label,
        tier: o.tier,
        // "reserved" is shown as unavailable in the city.
        status: o.status === "reserved" ? "occupied" : o.status,
        organizationId: o.organization_id,
      }),
    ),
    organizations: (orgs.data as OrgRow[]).map(mapOrg),
    agents: agents.data!.map(
      (a): Agent => ({
        id: a.id,
        slug: a.slug,
        organizationId: a.organization_id,
        name: a.name,
        category: a.category,
        summary: a.summary,
        capabilities: a.capabilities ?? [],
        status: a.status === "suspended" ? "in-development" : a.status,
        disclosure: a.disclosure ?? undefined,
      }),
    ),
  };
});
