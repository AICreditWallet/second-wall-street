import { describe, expect, it } from "vitest";
import { generateCity } from "./generator";
import { floorDirectory, parseFloors, resolveInterior } from "./interiors";

describe("interiors", () => {
  const city = generateCity();

  it("parses floor labels", () => {
    expect(parseFloors("Floors 8–14")).toEqual({ from: 8, to: 14 });
    expect(parseFloors("Floor 3")).toEqual({ from: 3, to: 3 });
  });

  it("orders a floor directory top floor first", () => {
    const building = city.buildings.find((b) => city.offices.filter((o) => o.buildingId === b.id).length > 2)!;
    const dir = floorDirectory(city.offices.filter((o) => o.buildingId === building.id));
    const froms = dir.map((o) => parseFloors(o.label).from);
    expect([...froms].sort((a, b) => b - a)).toEqual(froms);
  });

  it("puts the research lab's six agents in a research-firm office", () => {
    const offices = city.offices.filter((o) => o.organizationId === "org-research-lab");
    const hq = floorDirectory(offices)[0]!;
    const r = resolveInterior(city, hq);
    expect(r.template).toBe("research");
    expect(r.agents.filter(Boolean)).toHaveLength(6);
    expect(r.derived).toBe(true);
    // Other floors of the same organisation don't duplicate the agents.
    for (const o of offices.filter((x) => x.id !== hq.id)) expect(resolveInterior(city, o).agents.filter(Boolean)).toHaveLength(0);
  });

  it("shows empty studios for free offices and never invents agents", () => {
    const office = city.offices.find((o) => o.status === "available" && o.tier === "standard")!;
    const r = resolveInterior(city, office);
    expect(r.template).toBe("studio");
    expect(r.agents.filter(Boolean)).toHaveLength(0);
  });

  it("prefers database rows over derived defaults", () => {
    const office = city.offices.find((o) => o.organizationId === "org-open15")!;
    const agent = city.agents.find((a) => a.organizationId === "org-open15")!;
    const r = resolveInterior(
      { ...city, interiors: [{ officeId: office.id, template: "studio", accent: "#e2b86b" }], workstations: [{ officeId: office.id, slot: 1, agentId: agent.id }] },
      office,
    );
    expect(r).toMatchObject({ template: "studio", accent: "#e2b86b", derived: false });
    expect(r.agents[1]).toBe(agent.id);
  });
});
