import type { CitySnapshot, InteriorTemplate, Office, OfficeInterior, Workstation } from "./types";

/** Workstation slots available in each reusable interior template. */
export const TEMPLATE_SLOTS: Record<InteriorTemplate, number> = { studio: 2, startup: 4, research: 8 };

export const TEMPLATE_LABEL: Record<InteriorTemplate, string> = {
  studio: "Developer Studio",
  startup: "Modern AI Startup Office",
  research: "Financial Research Firm",
};

/** "Floors 8–14" → {from: 8, to: 14}; "Floor 3" → {from: 3, to: 3}. */
export function parseFloors(label: string): { from: number; to: number } {
  const nums = (label.match(/\d+/g) ?? []).map(Number);
  const from = nums[0] ?? 1;
  return { from, to: nums[1] ?? from };
}

/** Offices of a building ordered top floor first, like a lobby directory. */
export function floorDirectory(offices: Office[]) {
  return [...offices].sort((a, b) => parseFloors(b.label).from - parseFloors(a.label).from);
}

export interface ResolvedInterior {
  template: InteriorTemplate;
  accent: string;
  /** Agent ids by slot index; undefined slots are empty desks. */
  agents: (string | undefined)[];
  /** True when nothing came from the database and defaults were derived. */
  derived: boolean;
}

const DEFAULT_ACCENT = "#38e1ff";

/**
 * Resolves which template and agents an office shows. Database rows win;
 * otherwise a sensible default is derived from the office and its organisation.
 */
export function resolveInterior(snapshot: CitySnapshot, office: Office): ResolvedInterior {
  const row: OfficeInterior | undefined = snapshot.interiors?.find((i) => i.officeId === office.id);
  const orgAgents = office.organizationId ? snapshot.agents.filter((a) => a.organizationId === office.organizationId) : [];

  let template: InteriorTemplate = row?.template ?? "studio";
  if (!row) {
    if (orgAgents.length >= 5 || (!office.organizationId && office.tier !== "standard")) template = "research";
    else if (office.organizationId) template = "startup";
  }

  const slots = TEMPLATE_SLOTS[template];
  const placed: Workstation[] = (snapshot.workstations ?? []).filter((w) => w.officeId === office.id && w.slot < slots);
  const agents: (string | undefined)[] = Array.from({ length: slots }, () => undefined);
  if (placed.length > 0) {
    for (const w of placed) agents[w.slot] = w.agentId;
  } else if (office.organizationId) {
    // Default: the organisation's agents work on its headquarters floor —
    // its highest office, which is the first one listed in the lobby directory.
    const hq = floorDirectory(snapshot.offices.filter((o) => o.organizationId === office.organizationId))[0];
    if (hq?.id === office.id) orgAgents.slice(0, slots).forEach((a, i) => (agents[i] = a.id));
  }
  return { template, accent: row?.accent ?? DEFAULT_ACCENT, agents, derived: !row && placed.length === 0 };
}
