import { describe, expect, it } from "vitest";
import { generateCity } from "./generator";
import { indexCity, indicatorFor, searchCity } from "./queries";

describe("generateCity", () => {
  it("is deterministic for the same seed", () => {
    expect(generateCity(42)).toEqual(generateCity(42));
    expect(generateCity().buildings.map((b) => b.id)).toEqual(generateCity().buildings.map((b) => b.id));
  });

  it("produces unique building and office ids", () => {
    const city = generateCity();
    expect(new Set(city.buildings.map((b) => b.id)).size).toBe(city.buildings.length);
    expect(new Set(city.offices.map((o) => o.id)).size).toBe(city.offices.length);
    expect(city.buildings.length).toBeGreaterThan(80);
  });

  it("links every office to an existing building and org", () => {
    const city = generateCity();
    const ids = new Set(city.buildings.map((b) => b.id));
    const orgs = new Set(city.organizations.map((o) => o.id));
    for (const o of city.offices) {
      expect(ids.has(o.buildingId)).toBe(true);
      if (o.organizationId) expect(orgs.has(o.organizationId)).toBe(true);
    }
  });

  it("keeps buildings inside the city bounds and off each other", () => {
    const city = generateCity();
    for (const b of city.buildings) {
      expect(b.position[0] - b.footprint[0] / 2).toBeGreaterThanOrEqual(city.bounds.minX);
      expect(b.position[0] + b.footprint[0] / 2).toBeLessThanOrEqual(city.bounds.maxX);
    }
    for (let i = 0; i < city.buildings.length; i++) {
      for (let j = i + 1; j < city.buildings.length; j++) {
        const a = city.buildings[i]!;
        const b = city.buildings[j]!;
        const overlapX = Math.abs(a.position[0] - b.position[0]) < (a.footprint[0] + b.footprint[0]) / 2;
        const overlapZ = Math.abs(a.position[1] - b.position[1]) < (a.footprint[1] + b.footprint[1]) / 2;
        expect(overlapX && overlapZ, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("assigns all three platform organisations and leaves most offices free", () => {
    const city = generateCity();
    const occupiedOrgs = new Set(city.offices.map((o) => o.organizationId).filter(Boolean));
    expect(occupiedOrgs).toEqual(new Set(["org-swst-hq", "org-open15", "org-research-lab"]));
    const free = city.offices.filter((o) => o.status === "available" && o.tier === "standard").length;
    expect(free / city.offices.length).toBeGreaterThan(0.5);
  });

  it("seeds no community organisations or reviews", () => {
    expect(generateCity().organizations.every((o) => o.operator === "platform")).toBe(true);
  });
});

describe("queries", () => {
  it("derives indicators from office state", () => {
    const base = { buildingId: "b", label: "", organizationId: null };
    expect(indicatorFor([{ ...base, id: "1", tier: "standard", status: "available" }])).toBe("free");
    expect(indicatorFor([{ ...base, id: "1", tier: "premium", status: "available" }])).toBe("premium");
    expect(indicatorFor([{ ...base, id: "1", tier: "standard", status: "occupied" }])).toBe("occupied");
    expect(indicatorFor([{ ...base, id: "1", tier: "standard", status: "platform" }])).toBe("platform");
  });

  it("searches organisations, districts and buildings", () => {
    const index = indexCity(generateCity());
    expect(searchCity(index, "open15")[0]?.title).toBe("Open15 AI");
    expect(searchCity(index, "harbor").some((r) => r.kind === "district")).toBe(true);
    expect(searchCity(index, "   ")).toEqual([]);
  });
});
