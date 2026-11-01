import { describe, expect, it } from "vitest";
import { TEMPLATE_SLOTS } from "@/lib/city/interiors";
import { getLayout, type LayoutKind } from "./layout";
import { buildNavGrid, findPath, isWalkable } from "./pathfinding";

const KINDS: LayoutKind[] = ["studio", "startup", "research", "lobby"];

describe.each(KINDS)("%s layout", (kind) => {
  const layout = getLayout(kind);
  const grid = buildNavGrid(layout.width, layout.depth, layout.obstacles);

  it("keeps all furniture inside the room", () => {
    for (const o of layout.obstacles) {
      expect(Math.abs(o.x) + o.w / 2).toBeLessThanOrEqual(layout.width / 2 + 0.01);
      expect(Math.abs(o.z) + o.d / 2).toBeLessThanOrEqual(layout.depth / 2 + 0.01);
    }
  });

  it("has the template's agent workstation slots", () => {
    const pods = layout.items.filter((i) => i.kind === "pod").length;
    expect(pods).toBe(kind === "lobby" ? 0 : TEMPLATE_SLOTS[kind]);
  });

  it("can walk from the entrance to every seat and standing spot", () => {
    for (const p of [...layout.seats, ...layout.standSpots]) {
      const path = findPath(grid, layout.entrance, [p.x, p.z]);
      expect(path, `${kind} → ${p.x},${p.z}`).not.toBeNull();
      // Every path point must be on walkable floor (never through furniture).
      for (const [x, z] of path!) expect(isWalkable(grid, x, z)).toBe(true);
    }
  });

  it("has enough seats for its population", () => {
    expect(layout.seats.length).toBeGreaterThanOrEqual(Math.min(layout.population, 4));
  });
});

describe("pathfinding", () => {
  it("routes around a wall instead of through it", () => {
    const grid = buildNavGrid(10, 10, [{ x: 0, z: 0, w: 0.3, d: 7 }]);
    const path = findPath(grid, [-3, 0], [3, 0])!;
    expect(path.some(([, z]) => Math.abs(z) > 3.4)).toBe(true);
  });
});
