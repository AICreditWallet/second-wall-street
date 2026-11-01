import * as THREE from "three";
import type { Building, WindowStyle } from "@/lib/city/types";
import { mulberry32 } from "@/lib/city/generator";
import { BAY, CELLS, FLOOR } from "./textures";

/**
 * Merges every building into a handful of geometries (one per window style for
 * facades, one for roofs) so the whole skyline renders in ~4 draw calls.
 * `triBuilding[i]` maps triangle i back to its building for picking.
 */

export interface MergedBucket {
  geometry: THREE.BufferGeometry;
  triBuilding: Uint16Array;
}

export interface CityGeometry {
  facades: Partial<Record<WindowStyle, MergedBucket>>;
  roofs: MergedBucket;
}

class Bucket {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  tri: number[] = [];

  toMerged(): MergedBucket {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return { geometry: g, triBuilding: Uint16Array.from(this.tri) };
  }
}

type Role = "facade" | "roof";

const tmpN = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();

function addPart(
  source: THREE.BufferGeometry,
  role: Role,
  facade: Bucket,
  roof: Bucket,
  index: number,
  wall: THREE.Color,
  top: THREE.Color,
  curved = 0,
) {
  const g = source.index ? source.toNonIndexed() : source;
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    tmpN.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    if (tmpN.y < -0.5) continue; // bottoms are never visible
    const isRoof = role === "roof" || tmpN.y > 0.5;
    const target = isRoof ? roof : facade;
    const color = isRoof ? top : wall;
    for (let k = 0; k < 3; k++) {
      const v = i + k;
      const x = p.getX(v);
      const y = p.getY(v);
      const z = p.getZ(v);
      target.pos.push(x, y, z);
      target.nor.push(n.getX(v), n.getY(v), n.getZ(v));
      if (isRoof) {
        target.uv.push(0, 0);
      } else if (curved > 0) {
        target.uv.push((uv.getX(v) * curved) / (BAY * CELLS), y / (FLOOR * CELLS));
      } else {
        // Planar facade: project onto the horizontal tangent of the face.
        const u = x * -tmpN.z + z * tmpN.x;
        target.uv.push(u / (BAY * CELLS), y / (FLOOR * CELLS));
      }
      target.col.push(color.r, color.g, color.b);
    }
    target.tri.push(index);
  }
  if (g !== source) g.dispose();
  source.dispose();
}

function box(w: number, h: number, d: number, x: number, y0: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y0 + h / 2, z);
  return g;
}

export function buildCityGeometry(buildings: Building[]): CityGeometry {
  const facades = new Map<WindowStyle, Bucket>();
  const roofs = new Bucket();
  const wall = new THREE.Color();
  const top = new THREE.Color();
  const roofTint = new THREE.Color("#2b3654");

  buildings.forEach((bld, index) => {
    const facade = facades.get(bld.windowStyle) ?? new Bucket();
    facades.set(bld.windowStyle, facade);
    const rand = mulberry32(index * 2654435761);
    const [x, z] = bld.position;
    const [w, d] = bld.footprint;
    const h = bld.height;
    wall.set(bld.color).convertSRGBToLinear();
    top.set(bld.color).lerp(roofTint, 0.55).convertSRGBToLinear();
    const add = (g: THREE.BufferGeometry, role: Role = "facade", curved = 0) =>
      addPart(g, role, facade, roofs, index, wall, top, curved);

    switch (bld.shape) {
      case "cylinder": {
        const r = Math.min(w, d) / 2;
        const side = new THREE.CylinderGeometry(r, r, h, 28, 1, true);
        side.translate(x, h / 2, z);
        add(side, "facade", 2 * Math.PI * r);
        const cap = new THREE.CylinderGeometry(r * 1.02, r * 1.02, 1.2, 28);
        cap.translate(x, h + 0.6, z);
        add(cap, "roof");
        const crown = new THREE.CylinderGeometry(r * 0.55, r * 0.6, 2.4, 20);
        crown.translate(x, h + 2.4, z);
        add(crown, "roof");
        break;
      }
      case "stepped": {
        const h1 = h * 0.58;
        add(box(w, h1, d, x, 0, z));
        add(box(w * 0.72, h - h1, d * 0.72, x, h1, z));
        add(box(w * 0.4, 2.5, d * 0.4, x, h, z), "roof");
        break;
      }
      case "spire": {
        const hb = h * 0.84;
        add(box(w * 0.92, hb, d * 0.92, x, 0, z));
        const cone = new THREE.ConeGeometry(Math.max(w, d) * 0.92 * 0.7, h - hb + 6, 4);
        cone.rotateY(Math.PI / 4);
        cone.scale(w / Math.max(w, d), 1, d / Math.max(w, d));
        cone.translate(x, hb + (h - hb + 6) / 2, z);
        add(cone, "roof");
        break;
      }
      default: {
        add(box(w, h, d, x, 0, z));
        add(box(w * 1.02, 0.6, d * 1.02, x, h, z), "roof");
        const units = 1 + Math.floor(rand() * 3);
        for (let i = 0; i < units; i++) {
          const s = 1.2 + rand() * 2.2;
          add(box(s, 1 + rand() * 1.6, s, x + (rand() - 0.5) * (w - s - 1), h + 0.6, z + (rand() - 0.5) * (d - s - 1)), "roof");
        }
      }
    }
  });

  return {
    facades: Object.fromEntries([...facades].map(([k, v]) => [k, v.toMerged()])),
    roofs: roofs.toMerged(),
  };
}
