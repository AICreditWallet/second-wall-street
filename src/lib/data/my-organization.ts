import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ORG_COLUMNS, mapOrg } from "./city-repository";

export interface MyOffice {
  id: string;
  label: string;
  tier: "standard" | "premium" | "landmark";
  buildingId: string;
  buildingName: string;
  districtName: string;
}

/** The caller's organisations (RLS limits results to their memberships) with their offices. */
export async function getMyOrganizations(supabase: SupabaseClient, userId: string) {
  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select(`role, organization:organizations (${ORG_COLUMNS}, status)`)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  const orgs = (memberships ?? [])
    .filter((m) => m.organization)
    .map((m) => {
      const raw = m.organization as unknown as Parameters<typeof mapOrg>[0] & { status: string };
      return { role: m.role as "owner" | "admin" | "member", status: raw.status, org: mapOrg(raw) };
    });
  if (orgs.length === 0) return [];

  const { data: offices, error: officeError } = await supabase
    .from("offices")
    .select("id, label, tier, organization_id, building:buildings (id, name, district:districts (name))")
    .in("organization_id", orgs.map((o) => o.org.id))
    .order("id");
  if (officeError) throw new Error(officeError.message);

  return orgs.map((o) => ({
    ...o,
    offices: (offices ?? [])
      .filter((f) => f.organization_id === o.org.id)
      .map((f): MyOffice => {
        const b = f.building as unknown as { id: string; name: string; district: { name: string } | null };
        return { id: f.id, label: f.label, tier: f.tier, buildingId: b.id, buildingName: b.name, districtName: b.district?.name ?? "" };
      }),
  }));
}
