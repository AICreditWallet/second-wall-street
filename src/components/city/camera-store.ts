"use client";

import { useSyncExternalStore } from "react";

/** Tiny external store so the minimap can follow the camera without re-rendering the scene. */
export interface CameraState {
  target: [number, number];
  azimuth: number;
  distance: number;
}

let state: CameraState = { target: [0, 0], azimuth: 0, distance: 240 };
const listeners = new Set<() => void>();

export const cameraStore = {
  get: () => state,
  set(next: CameraState) {
    state = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useCameraState() {
  return useSyncExternalStore(cameraStore.subscribe, cameraStore.get, cameraStore.get);
}

export type CameraCommand =
  | { type: "focus-building"; id: string }
  | { type: "focus-point"; x: number; z: number; distance?: number }
  | { type: "view"; view: "aerial" | "street" }
  | { type: "reset" }
  | { type: "pan"; dx: number; dz: number }
  | { type: "zoom"; factor: number }
  | { type: "rotate"; angle: number };
