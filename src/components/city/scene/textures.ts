import * as THREE from "three";
import type { WindowStyle } from "@/lib/city/types";
import { mulberry32 } from "@/lib/city/generator";

/** Tile texture is CELLS x CELLS windows; geometry UVs are scaled so one cell = one bay x one floor. */
export const CELLS = 8;
export const BAY = 2.6;
export const FLOOR = 3.2;

const PX = 16;

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function finish(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const LIT: Record<WindowStyle, string[]> = {
  "cyan-band": ["#22d3ee", "#2fe0e8", "#5eead4"],
  "cyan-grid": ["#38d6f0", "#7ee8f5", "#22b8d6"],
  "warm-grid": ["#ffb547", "#ffa23a", "#ffd27a", "#ff8f3a"],
};

const cache = new Map<WindowStyle, { map: THREE.Texture; emissive: THREE.Texture }>();

/**
 * Diffuse map: wall stays white (tinted by vertex colour), panes darker.
 * Emissive map: lit panes only.
 */
export function windowTextures(style: WindowStyle) {
  const hit = cache.get(style);
  if (hit) return hit;
  const rand = mulberry32(style.length * 7919 + style.charCodeAt(0));
  const size = CELLS * PX;
  const diffuse = canvas(size);
  const emissive = canvas(size);
  const d = diffuse.getContext("2d")!;
  const e = emissive.getContext("2d")!;
  d.fillStyle = "#ffffff";
  d.fillRect(0, 0, size, size);
  e.fillStyle = "#000000";
  e.fillRect(0, 0, size, size);
  const lit = LIT[style];

  for (let row = 0; row < CELLS; row++) {
    const y = row * PX;
    if (style === "cyan-band") {
      // Continuous horizontal light strips, as in the concept art.
      const on = rand() < 0.82;
      d.fillStyle = "#3a4660";
      d.fillRect(0, y + 5, size, 6);
      if (on) {
        e.fillStyle = lit[Math.floor(rand() * lit.length)]!;
        let x = 0;
        while (x < size) {
          const len = PX * (1 + Math.floor(rand() * 4));
          if (rand() < 0.85) e.fillRect(x, y + 5, len - 2, 6);
          x += len;
        }
      }
      continue;
    }
    for (let col = 0; col < CELLS; col++) {
      const x = col * PX;
      d.fillStyle = "#3a4660";
      d.fillRect(x + 4, y + 4, 8, 8);
      if (rand() < (style === "warm-grid" ? 0.55 : 0.6)) {
        e.fillStyle = lit[Math.floor(rand() * lit.length)]!;
        e.fillRect(x + 4, y + 4, 8, 8);
      }
    }
  }
  const result = { map: finish(diffuse), emissive: finish(emissive) };
  cache.set(style, result);
  return result;
}

let glow: THREE.Texture | null = null;
/** Soft radial gradient used for street-light pools and beacons. */
export function glowTexture() {
  if (glow) return glow;
  const c = canvas(64);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glow = finish(c);
  return glow;
}

/**
 * One baked texture holding every street-lamp light pool. Replaces ~500
 * overlapping additive planes (huge GPU overdraw up close) with one quad.
 */
export function lightPoolTexture(
  lamps: { x: number; z: number }[],
  extent: { minX: number; maxX: number; minZ: number; maxZ: number },
  size = 2048,
) {
  const c = canvas(size);
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const w = extent.maxX - extent.minX;
  const d = extent.maxZ - extent.minZ;
  const r = (3.6 / w) * size;
  g.globalCompositeOperation = "lighter";
  for (const l of lamps) {
    const px = ((l.x - extent.minX) / w) * size;
    const py = ((l.z - extent.minZ) / d) * size;
    const grad = g.createRadialGradient(px, py, 0, px, py, r);
    grad.addColorStop(0, "rgba(255,174,85,0.55)");
    grad.addColorStop(0.45, "rgba(255,150,70,0.22)");
    grad.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = grad;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Crisp text on a transparent canvas, for road-surface street names and signs. */
export function textTexture(text: string, opts: { font?: string; color?: string; height?: number; padding?: number; background?: string } = {}) {
  const height = opts.height ?? 64;
  const font = opts.font ?? `600 ${Math.round(height * 0.62)}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const pad = opts.padding ?? height * 0.35;
  const width = Math.ceil(measure.measureText(text).width + pad * 2);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d")!;
  if (opts.background) {
    g.fillStyle = opts.background;
    g.beginPath();
    g.roundRect(0, 0, width, height, height / 2);
    g.fill();
  }
  g.font = font;
  g.fillStyle = opts.color ?? "#e8eefc";
  g.textBaseline = "middle";
  g.fillText(text, pad, height / 2 + 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture: t, aspect: width / height };
}
