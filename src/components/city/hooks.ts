"use client";

import { useSyncExternalStore } from "react";

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  };
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

let webglSupport: boolean | undefined;
function detectWebGL() {
  if (webglSupport === undefined) {
    try {
      const c = document.createElement("canvas");
      webglSupport = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}
const noop = () => () => {};

/** null during SSR / hydration, then true/false. */
export function useWebGLSupport(): boolean | null {
  return useSyncExternalStore(noop, detectWebGL, () => null);
}

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

export function useViewportHeight() {
  return useSyncExternalStore(subscribeResize, () => window.innerHeight, () => 800);
}
