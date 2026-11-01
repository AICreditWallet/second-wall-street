// Domain types for the city. Each maps to a Postgres table in Phase 2.

export type OfficeTier = "standard" | "premium" | "landmark";
export type OfficeStatus = "available" | "occupied" | "platform";
export type BuildingShape = "box" | "stepped" | "cylinder" | "spire" | "lowrise";
export type WindowStyle = "cyan-band" | "cyan-grid" | "warm-grid";

/** Aggregate state used for the beacon on top of each building. */
export type BuildingIndicator = "free" | "premium" | "occupied" | "platform";

export interface District {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  /** World-space centre [x, z] for camera navigation. */
  center: [number, number];
}

export interface Building {
  id: string;
  districtId: string;
  name: string;
  address: string;
  /** World-space centre of footprint [x, z]. */
  position: [number, number];
  /** Footprint [width (x), depth (z)]. */
  footprint: [number, number];
  height: number;
  floors: number;
  shape: BuildingShape;
  color: string;
  windowStyle: WindowStyle;
  tier: OfficeTier;
}

export interface Office {
  id: string;
  buildingId: string;
  label: string;
  tier: OfficeTier;
  status: OfficeStatus;
  organizationId: string | null;
}

export type AgentStatus = "in-development" | "preview" | "live";

export interface Agent {
  id: string;
  slug: string;
  organizationId: string;
  name: string;
  category: string;
  summary: string;
  capabilities: string[];
  status: AgentStatus;
  disclosure?: string;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  operator: "platform" | "community";
  verified: boolean;
  /** Labelled demo/simulation organisation. */
  isDemo: boolean;
  website?: string;
  githubUrl?: string;
  logoUrl?: string;
}

export type InteriorTemplate = "studio" | "startup" | "research";

/** Per-office interior configuration (table: office_interiors). */
export interface OfficeInterior {
  officeId: string;
  template: InteriorTemplate;
  accent: string;
}

/** An agent placed at a workstation slot inside an office (table: agent_workstations). */
export interface Workstation {
  officeId: string;
  slot: number;
  agentId: string;
}

export interface CitySnapshot {
  /** "demo" = deterministic development dataset, not live records. */
  source: "demo" | "database";
  districts: District[];
  buildings: Building[];
  offices: Office[];
  organizations: Organization[];
  agents: Agent[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  parks: { id: string; name: string; position: [number, number]; size: [number, number] }[];
  water: { position: [number, number]; size: [number, number] };
  grid: { cols: number; rows: number; block: number; street: number; originX: number; originZ: number };
  /** Optional overrides from the database; defaults are derived when absent. */
  interiors?: OfficeInterior[];
  workstations?: Workstation[];
  /** Published review aggregates keyed by agent id or organisation id. */
  ratings?: Record<string, { average: number; count: number }>;
  /** Latest health check per published agent. */
  health?: Record<string, { ok: boolean; checkedAt: string; latencyMs: number | null }>;
  /** What platform agents actually did in the latest session (null if unavailable). */
  activity?: CityActivity | null;
}

export type RunState = "running" | "awaiting_approval" | "succeeded" | "failed" | "cancelled";

export interface CityActivity {
  sessionDate: string;
  /** Latest public run per organisation slug. */
  runs: Record<string, { runId: string; workflowId: string; status: RunState; finishedAt: string | null }>;
  /** Latest public task per agent. */
  tasks: Record<string, { runId: string; status: "running" | "succeeded" | "failed" | "skipped"; summary: string | null; at: string }>;
}
