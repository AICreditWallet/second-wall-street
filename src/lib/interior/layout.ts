import type { InteriorTemplate } from "@/lib/city/types";
import { TEMPLATE_SLOTS } from "@/lib/city/interiors";
import type { Rect } from "./pathfinding";

/**
 * Reusable office layouts generated from a few parameters, so every office in
 * the city shares the same handful of geometries instead of unique models.
 * Coordinates are metres; the room is centred on the origin, the window wall
 * is at -z and the open (camera) side is +z. A furniture item's local +z is
 * where a person sits; seated people face local -z.
 */

export type LayoutKind = InteriorTemplate | "lobby";

export type Item =
  | { kind: "desk"; x: number; z: number; rot: number; monitors: 1 | 2 | 3 }
  | { kind: "pod"; x: number; z: number; rot: number; slot: number }
  | { kind: "table"; x: number; z: number; w: number; d: number }
  | { kind: "glassRoom"; x: number; z: number; w: number; d: number; door: "left" | "right" | "front" }
  | { kind: "sofa"; x: number; z: number; rot: number }
  | { kind: "plant"; x: number; z: number; scale: number }
  | { kind: "reception"; x: number; z: number; rot: number }
  | { kind: "kitchen"; x: number; z: number; rot: number }
  | { kind: "screen"; x: number; y: number; z: number; rot: number; w: number; h: number }
  | { kind: "elevator"; x: number; z: number; index: number }
  | { kind: "rug"; x: number; z: number; w: number; d: number };

export interface Seat {
  id: string;
  x: number;
  z: number;
  /** Rotation (y) of a seated person. */
  facing: number;
  kind: "desk" | "meeting" | "sofa" | "stool";
}

export interface InteriorLayout {
  kind: LayoutKind;
  width: number;
  depth: number;
  items: Item[];
  seats: Seat[];
  /** Places people walk to and stand at (coffee, screens, reception). */
  standSpots: { x: number; z: number; facing: number }[];
  obstacles: Rect[];
  /** Where visitors appear, on the open side. */
  entrance: [number, number];
  /** Suggested number of people at full quality. */
  population: number;
}

const DESK_W = 1.6;
const DESK_D = 0.8;
const SEAT_OFFSET = 0.75;

function local(x: number, z: number, rot: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}

function rotatedRect(x: number, z: number, w: number, d: number, rot: number): Rect {
  const quarter = Math.abs(Math.sin(rot)) > 0.7;
  return { x, z, w: quarter ? d : w, d: quarter ? w : d };
}

class Builder {
  items: Item[] = [];
  seats: Seat[] = [];
  standSpots: { x: number; z: number; facing: number }[] = [];
  obstacles: Rect[] = [];
  private n = 0;

  desk(x: number, z: number, rot: number, monitors: 1 | 2 | 3 = 1) {
    this.items.push({ kind: "desk", x, z, rot, monitors });
    this.obstacles.push(rotatedRect(x, z, DESK_W, DESK_D, rot));
    const [sx, sz] = local(x, z, rot, 0, SEAT_OFFSET);
    this.seats.push({ id: `s${this.n++}`, x: sx, z: sz, facing: rot + Math.PI, kind: "desk" });
  }

  pod(x: number, z: number, rot: number, slot: number) {
    this.items.push({ kind: "pod", x, z, rot, slot });
    this.obstacles.push({ x, z, w: 1.7, d: 1.7 });
  }

  meetingRoom(x: number, z: number, w: number, d: number, door: "left" | "right" | "front", seatsPerSide: number) {
    this.items.push({ kind: "glassRoom", x, z, w, d, door });
    const tw = Math.max(1.4, seatsPerSide * 0.9);
    this.table(x, z, tw, 1.0, seatsPerSide);
    // Glass walls are obstacles except for a doorway.
    const t = 0.12;
    const gap = 1.2;
    const walls: Rect[] = [
      { x, z: z - d / 2, w, d: t },
      { x: x - w / 2, z, w: t, d },
      { x: x + w / 2, z, w: t, d },
      { x, z: z + d / 2, w, d: t },
    ];
    const doorIndex = door === "front" ? 3 : door === "left" ? 1 : 2;
    walls.forEach((r, i) => {
      if (i !== doorIndex) return this.obstacles.push(r);
      if (door === "front") {
        const seg = (w - gap) / 2;
        this.obstacles.push({ x: x - w / 2 + seg / 2, z: r.z, w: seg, d: t }, { x: x + w / 2 - seg / 2, z: r.z, w: seg, d: t });
      } else {
        const seg = (d - gap) / 2;
        this.obstacles.push({ x: r.x, z: z - d / 2 + seg / 2, w: t, d: seg }, { x: r.x, z: z + d / 2 - seg / 2, w: t, d: seg });
      }
    });
  }

  table(x: number, z: number, w: number, d: number, seatsPerSide: number) {
    this.items.push({ kind: "table", x, z, w, d });
    this.obstacles.push({ x, z, w, d });
    for (let i = 0; i < seatsPerSide; i++) {
      const sx = x - w / 2 + (w / seatsPerSide) * (i + 0.5);
      this.seats.push({ id: `s${this.n++}`, x: sx, z: z - d / 2 - 0.55, facing: 0, kind: "meeting" });
      this.seats.push({ id: `s${this.n++}`, x: sx, z: z + d / 2 + 0.55, facing: Math.PI, kind: "meeting" });
    }
  }

  sofa(x: number, z: number, rot: number) {
    this.items.push({ kind: "sofa", x, z, rot });
    this.obstacles.push(rotatedRect(x, z, 2.2, 0.9, rot));
    for (const lx of [-0.55, 0.55]) {
      const [sx, sz] = local(x, z, rot, lx, 0.05);
      this.seats.push({ id: `s${this.n++}`, x: sx, z: sz, facing: rot, kind: "sofa" });
    }
  }

  kitchen(x: number, z: number, rot: number) {
    this.items.push({ kind: "kitchen", x, z, rot });
    this.obstacles.push(rotatedRect(x, z, 3, 0.8, rot));
    for (const lx of [-1, 0, 1]) {
      const [sx, sz] = local(x, z, rot, lx, 0.8);
      this.standSpots.push({ x: sx, z: sz, facing: rot + Math.PI });
    }
  }

  plant(x: number, z: number, scale = 1) {
    this.items.push({ kind: "plant", x, z, scale });
    this.obstacles.push({ x, z, w: 0.7 * scale, d: 0.7 * scale });
  }

  screen(x: number, y: number, z: number, rot: number, w: number, h: number, standAt?: [number, number]) {
    this.items.push({ kind: "screen", x, y, z, rot, w, h });
    if (standAt) this.standSpots.push({ x: standAt[0], z: standAt[1], facing: rot + Math.PI });
  }

  reception(x: number, z: number, rot: number) {
    this.items.push({ kind: "reception", x, z, rot });
    this.obstacles.push(rotatedRect(x, z, 3.2, 1.0, rot));
    const [sx, sz] = local(x, z, rot, 0, -0.9);
    this.seats.push({ id: `s${this.n++}`, x: sx, z: sz, facing: rot, kind: "stool" });
    const [vx, vz] = local(x, z, rot, 0, 1.3);
    this.standSpots.push({ x: vx, z: vz, facing: rot + Math.PI });
  }

  build(kind: LayoutKind, width: number, depth: number, population: number): InteriorLayout {
    return {
      kind,
      width,
      depth,
      items: this.items,
      seats: this.seats,
      standSpots: this.standSpots,
      obstacles: this.obstacles,
      entrance: [0, depth / 2 - 1.2],
      population,
    };
  }
}

function studio(): InteriorLayout {
  const b = new Builder();
  const W = 12;
  const D = 9;
  // Four desks in a facing pair of pairs.
  b.items.push({ kind: "rug", x: -2.4, z: -0.6, w: 4.6, d: 3.8 });
  b.desk(-3.2, -1.05, Math.PI, 2);
  b.desk(-1.6, -1.05, Math.PI, 1);
  b.desk(-3.2, -0.15, 0, 1);
  b.desk(-1.6, -0.15, 0, 2);
  // Agent pods along the right.
  const pods = TEMPLATE_SLOTS.studio;
  for (let i = 0; i < pods; i++) b.pod(3.6, -2.4 + i * 2.3, -Math.PI / 2, i);
  b.table(0.9, 2.4, 1.6, 0.9, 2);
  b.sofa(-3.6, 3.1, Math.PI);
  b.plant(-5.3, -3.7, 1.2);
  b.plant(5.3, -3.7);
  b.plant(5.3, 3.6, 0.9);
  b.screen(-W / 2 + 0.06, 1.7, -0.6, Math.PI / 2, 2.6, 1.4, [-4.6, -0.6]);
  return b.build("studio", W, D, 4);
}

function startup(): InteriorLayout {
  const b = new Builder();
  const W = 18;
  const D = 12;
  for (const cx of [-5.2, 0.6]) {
    b.items.push({ kind: "rug", x: cx, z: -0.6, w: 4.8, d: 3.6 });
    for (let i = 0; i < 3; i++) {
      const x = cx - DESK_W + i * DESK_W;
      b.desk(x, -1.05, Math.PI, (i % 2) + 1 as 1 | 2);
      b.desk(x, -0.15, 0, ((i + 1) % 2) + 1 as 1 | 2);
    }
  }
  b.meetingRoom(5.6, -3.4, 5, 3.8, "left", 3);
  const pods = TEMPLATE_SLOTS.startup;
  for (let i = 0; i < pods; i++) b.pod(4 + (i % 2) * 2.6, 1.6 + Math.floor(i / 2) * 2.4, 0, i);
  b.kitchen(-5.6, 4.2, 0);
  b.sofa(-1.4, 4.4, Math.PI);
  b.plant(-8.3, -5.2, 1.3);
  b.plant(2.6, -5.2);
  b.plant(8.3, 5.3, 1.1);
  b.plant(-8.3, 2.2);
  b.screen(-2.3, 1.9, -D / 2 + 0.06, 0, 4, 1.6, [-2.3, -3.6]);
  return b.build("startup", W, D, 8);
}

function research(): InteriorLayout {
  const b = new Builder();
  const W = 26;
  const D = 16;
  // Trading rows facing the video wall.
  for (let row = 0; row < 3; row++) {
    const z = -2.6 + row * 2.4;
    for (let i = 0; i < 5; i++) b.desk(-10.2 + i * DESK_W, z, 0, 3);
  }
  b.screen(0, 2.3, -D / 2 + 0.06, 0, 6, 2.6, [0, -5.8]);
  b.meetingRoom(-9.2, -5.6, 6, 3.6, "right", 3);
  b.meetingRoom(9.4, -5.6, 6, 3.6, "left", 3);
  const pods = TEMPLATE_SLOTS.research;
  for (let i = 0; i < pods; i++) b.pod(1.8 + (i % 4) * 2.5, -0.8 + Math.floor(i / 4) * 2.8, 0, i);
  b.reception(-8.4, 6.2, Math.PI);
  b.kitchen(9.6, 6.6, 0);
  b.sofa(4.4, 6.4, Math.PI);
  b.table(0.6, 6.2, 2.0, 1.0, 2);
  for (const [x, z, s] of [[-12.3, -7.2, 1.3], [12.3, -7.2, 1.3], [-12.3, 4, 1], [12.3, 3.4, 1], [-3, -7.3, 1]] as const) b.plant(x, z, s);
  return b.build("research", W, D, 14);
}

function lobby(): InteriorLayout {
  const b = new Builder();
  const W = 20;
  const D = 14;
  for (let i = 0; i < 3; i++) b.items.push({ kind: "elevator", x: -3.2 + i * 3.2, z: -D / 2 + 0.3, index: i });
  b.obstacles.push({ x: 0, z: -D / 2 + 0.4, w: 10, d: 0.6 });
  for (let i = 0; i < 3; i++) b.standSpots.push({ x: -3.2 + i * 3.2, z: -D / 2 + 1.8, facing: Math.PI });
  b.reception(0, -0.8, 0);
  b.items.push({ kind: "rug", x: -6.4, z: 2.6, w: 5, d: 4 });
  b.sofa(-6.4, 1.4, 0);
  b.sofa(-6.4, 3.9, Math.PI);
  b.items.push({ kind: "rug", x: 6.4, z: 2.6, w: 5, d: 4 });
  b.sofa(6.4, 1.4, 0);
  b.sofa(6.4, 3.9, Math.PI);
  for (const [x, z, s] of [[-9.2, -6.2, 1.4], [9.2, -6.2, 1.4], [-9.2, 6.2, 1], [9.2, 6.2, 1], [-5.6, -6.3, 1], [5.6, -6.3, 1]] as const) b.plant(x, z, s);
  b.screen(8.6, 2, -D / 2 + 0.06, 0, 2.6, 3.2);
  return b.build("lobby", W, D, 7);
}

const cache = new Map<LayoutKind, InteriorLayout>();

export function getLayout(kind: LayoutKind): InteriorLayout {
  let l = cache.get(kind);
  if (!l) {
    l = kind === "studio" ? studio() : kind === "startup" ? startup() : kind === "research" ? research() : lobby();
    cache.set(kind, l);
  }
  return l;
}
