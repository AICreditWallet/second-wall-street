import { PLATFORM_AGENTS, PLATFORM_ORGS } from "./organizations";
import type {
  Building,
  BuildingShape,
  CitySnapshot,
  District,
  Office,
  OfficeTier,
  WindowStyle,
} from "./types";

/**
 * Deterministic city generator. The same seed always yields the same layout
 * and the same building IDs. In Phase 2 its output is frozen into the seed
 * migration and the database becomes the source of truth.
 */

export const CITY_SEED = 0x5157_2026;

const COLS = 7;
const ROWS = 6;
const BLOCK = 26;
const STREET = 8;
const PITCH = BLOCK + STREET;
const WIDTH = COLS * BLOCK + (COLS - 1) * STREET;
const DEPTH = ROWS * BLOCK + (ROWS - 1) * STREET;
const ORIGIN_X = -WIDTH / 2;
const ORIGIN_Z = -DEPTH / 2;

const AVENUES = ["Founders Ave", "Cipher Ave", "Exchange Ave", "Liberty Ave", "Quorum Ave", "Harbor Ave", "Pier Ave"];
const STREETS = ["Atlas St", "Ticker St", "Ledger St", "Merit St", "Signal St", "Vector St"];

type DistrictKey = "exchange" | "ticker" | "signal" | "ledger" | "founders" | "harbor";

const DISTRICT_DEFS: Record<DistrictKey, { name: string; tagline: string; prefix: string }> = {
  exchange: { name: "Exchange Square", tagline: "Landmark towers at the heart of the district.", prefix: "ex" },
  ticker: { name: "Ticker Row", tagline: "Data, tools and market infrastructure.", prefix: "tr" },
  signal: { name: "Signal Heights", tagline: "Research studios and analytics labs.", prefix: "sh" },
  ledger: { name: "Ledger Lane", tagline: "Developer studios and open-source builders.", prefix: "ll" },
  founders: { name: "Founders Park", tagline: "Start-ups around the park. Free offices first.", prefix: "fp" },
  harbor: { name: "Harbor Point", tagline: "Waterfront offices with skyline views.", prefix: "hp" },
};

const PARK_BLOCKS = new Set(["0,5", "1,5"]);

function districtFor(col: number, row: number): DistrictKey {
  if (col >= 5) return "harbor";
  if (col <= 1) return row <= 2 ? "ledger" : "founders";
  if (row <= 1) return "ticker";
  if (row >= 4) return "signal";
  return "exchange";
}

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COOL_COLORS = ["#2c3c7a", "#34489a", "#1f5560", "#2d5585", "#3d3f8a"];
const WARM_COLORS = ["#a8323f", "#5a3f94", "#a8572e", "#3f4c66", "#2c6a5f", "#7d3a68"];

interface Lot {
  x: number;
  z: number;
  w: number;
  d: number;
}

function lotsForBlock(cx: number, cz: number, kind: DistrictKey, rand: () => number): Lot[] {
  const inner = BLOCK - 3; // sidewalk margin
  const half = (inner - 2) / 2;
  const q = half / 2 + 1;
  const roll = rand();
  if (kind === "exchange") {
    if (roll < 0.55) return [{ x: cx, z: cz, w: inner, d: inner }];
    return [
      { x: cx, z: cz - q, w: inner, d: half },
      { x: cx - q, z: cz + q, w: half, d: half },
      { x: cx + q, z: cz + q, w: half, d: half },
    ];
  }
  if (roll < 0.5) {
    return [
      { x: cx - q, z: cz - q, w: half, d: half },
      { x: cx + q, z: cz - q, w: half, d: half },
      { x: cx - q, z: cz + q, w: half, d: half },
      { x: cx + q, z: cz + q, w: half, d: half },
    ];
  }
  if (roll < 0.8) {
    return [
      { x: cx - q, z: cz, w: half, d: inner },
      { x: cx + q, z: cz - q, w: half, d: half },
      { x: cx + q, z: cz + q, w: half, d: half },
    ];
  }
  return [
    { x: cx, z: cz - q, w: inner, d: half },
    { x: cx, z: cz + q, w: inner, d: half },
  ];
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function generateCity(seed: number = CITY_SEED): CitySnapshot {
  const rand = mulberry32(seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T;

  const districtCells = new Map<DistrictKey, [number, number][]>();
  const buildings: Building[] = [];
  const counters = new Map<DistrictKey, number>();
  const parks: CitySnapshot["parks"] = [];

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = ORIGIN_X + col * PITCH + BLOCK / 2;
      const cz = ORIGIN_Z + row * PITCH + BLOCK / 2;
      const key = districtFor(col, row);
      const cells = districtCells.get(key) ?? [];
      cells.push([cx, cz]);
      districtCells.set(key, cells);

      if (PARK_BLOCKS.has(`${col},${row}`)) {
        parks.push({ id: `park-${col}-${row}`, name: "Founders Park", position: [cx, cz], size: [BLOCK - 3, BLOCK - 3] });
        continue;
      }

      const lots = lotsForBlock(cx, cz, key, rand);
      lots.forEach((lot, lotIndex) => {
        const seq = (counters.get(key) ?? 0) + 1;
        counters.set(key, seq);
        const def = DISTRICT_DEFS[key];

        const scale = 0.78 + rand() * 0.14;
        const w = round(lot.w * scale);
        const d = round(lot.d * scale);
        const area = lot.w * lot.d;

        let height: number;
        if (key === "exchange") height = (area > 300 ? 55 : 32) + rand() * 40;
        else if (key === "harbor" || key === "ticker") height = 12 + rand() * 30;
        else height = 8 + rand() * 24;
        height = round(height);

        let shape: BuildingShape = "box";
        const square = Math.abs(w - d) < 2;
        const r = rand();
        if (height < 14) shape = "lowrise";
        else if (square && r < 0.22) shape = "cylinder";
        else if (height > 45 && r < 0.55) shape = r < 0.3 ? "spire" : "stepped";
        else if (height > 26 && r < 0.35) shape = "stepped";

        const cool = key === "exchange" || key === "ticker" || rand() < 0.35;
        const windowStyle: WindowStyle = cool ? (rand() < 0.5 ? "cyan-band" : "cyan-grid") : "warm-grid";
        const color = cool ? pick(COOL_COLORS) : pick(WARM_COLORS);

        let tier: OfficeTier = "standard";
        if (key === "exchange") tier = height > 70 ? "landmark" : "premium";
        else if (key === "harbor" && col === COLS - 1) tier = "premium";

        const number = (row * 40 + lotIndex * 2 + 2 + col * 7) % 180 || 2;
        buildings.push({
          id: `bld-${def.prefix}-${String(seq).padStart(3, "0")}`,
          districtId: `dst-${key}`,
          name: `${number} ${AVENUES[col]}`,
          address: `${number} ${AVENUES[col]}, at ${STREETS[row]}`,
          position: [round(lot.x), round(lot.z)],
          footprint: [w, d],
          height,
          floors: Math.max(2, Math.round(height / 3.2)),
          shape,
          color,
          windowStyle,
          tier,
        });
      });
    }
  }

  // Assign the platform-operated flagships to specific Exchange Square towers.
  const exchange = buildings
    .filter((b) => b.districtId === "dst-exchange")
    .sort((a, b) => b.height - a.height);
  const flagships: Record<string, { name: string; shape?: BuildingShape }> = {};
  if (exchange[0]) flagships[exchange[0].id] = { name: "Second Wall Street Tower" };
  if (exchange[1]) flagships[exchange[1].id] = { name: "Open15 Rotunda", shape: "cylinder" };
  if (exchange[2]) flagships[exchange[2].id] = { name: "Research Lab Building" };
  const flagshipOrg = new Map<string, string>([
    [exchange[0]?.id ?? "", "org-swst-hq"],
    [exchange[1]?.id ?? "", "org-open15"],
    [exchange[2]?.id ?? "", "org-research-lab"],
  ]);
  for (const b of buildings) {
    const f = flagships[b.id];
    if (!f) continue;
    b.name = f.name;
    if (f.shape === "cylinder") {
      const s = Math.min(b.footprint[0], b.footprint[1]);
      b.footprint = [s, s];
      b.shape = "cylinder";
    }
    b.windowStyle = "cyan-band";
  }

  const offices: Office[] = [];
  for (const b of buildings) {
    const suites = Math.min(4, Math.max(1, Math.ceil(b.floors / 8)));
    const per = Math.ceil(b.floors / suites);
    const orgId = flagshipOrg.get(b.id) ?? null;
    for (let i = 0; i < suites; i++) {
      const from = i * per + 1;
      const to = Math.min(b.floors, (i + 1) * per);
      if (from > to) break;
      offices.push({
        id: `${b.id.replace("bld-", "ofc-")}-${i + 1}`,
        buildingId: b.id,
        label: from === to ? `Floor ${from}` : `Floors ${from}–${to}`,
        tier: b.tier,
        status: orgId ? "platform" : "available",
        organizationId: orgId,
      });
    }
  }

  const districts: District[] = (Object.keys(DISTRICT_DEFS) as DistrictKey[]).map((key) => {
    const cells = districtCells.get(key) ?? [];
    const cx = cells.reduce((s, c) => s + c[0], 0) / Math.max(1, cells.length);
    const cz = cells.reduce((s, c) => s + c[1], 0) / Math.max(1, cells.length);
    return {
      id: `dst-${key}`,
      slug: key,
      name: DISTRICT_DEFS[key].name,
      tagline: DISTRICT_DEFS[key].tagline,
      center: [round(cx), round(cz)],
    };
  });

  return {
    source: "demo",
    districts,
    buildings,
    offices,
    organizations: PLATFORM_ORGS,
    agents: PLATFORM_AGENTS,
    bounds: { minX: ORIGIN_X, maxX: -ORIGIN_X, minZ: ORIGIN_Z, maxZ: -ORIGIN_Z },
    parks,
    water: { position: [-ORIGIN_X + 70, 0], size: [120, DEPTH + 160] },
    grid: { cols: COLS, rows: ROWS, block: BLOCK, street: STREET, originX: ORIGIN_X, originZ: ORIGIN_Z },
  };
}
