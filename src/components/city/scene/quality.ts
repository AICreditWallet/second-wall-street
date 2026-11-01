/**
 * Rendering budget. The white-screen bug came from GPU overload → WebGL context
 * loss, so resolution is capped by a pixel budget rather than trusting the
 * device pixel ratio, and devices that have already lost a context drop a tier.
 */
export type QualityTier = "high" | "medium" | "low";

const LOSS_KEY = "sws:gl-losses";

export function recordContextLoss() {
  try {
    const n = Number(sessionStorage.getItem(LOSS_KEY) ?? "0") + 1;
    sessionStorage.setItem(LOSS_KEY, String(n));
    return n;
  } catch {
    return 1;
  }
}

export function contextLossCount() {
  try {
    return Number(sessionStorage.getItem(LOSS_KEY) ?? "0");
  } catch {
    return 0;
  }
}

export function detectQuality(): QualityTier {
  if (typeof window === "undefined") return "medium";
  const losses = contextLossCount();
  if (losses >= 1) return "low";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  if (mobile || cores <= 4 || memory <= 4) return "medium";
  return "high";
}

/** Max rendered pixels per frame for each tier (≈ 2.6 MP is 1080p+). */
const PIXEL_BUDGET: Record<QualityTier, number> = { high: 3_200_000, medium: 2_000_000, low: 1_100_000 };

export function dprFor(tier: QualityTier, cssWidth: number, cssHeight: number) {
  const device = Math.min(window.devicePixelRatio || 1, tier === "high" ? 2 : 1.5);
  const budget = Math.sqrt(PIXEL_BUDGET[tier] / Math.max(1, cssWidth * cssHeight));
  return Math.max(0.75, Math.min(device, budget));
}

export const TIER_SETTINGS: Record<QualityTier, { antialias: boolean; traffic: number; people: number; beacons: boolean }> = {
  high: { antialias: true, traffic: 1, people: 1, beacons: true },
  medium: { antialias: true, traffic: 0.6, people: 0.6, beacons: true },
  low: { antialias: false, traffic: 0.3, people: 0.35, beacons: false },
};
