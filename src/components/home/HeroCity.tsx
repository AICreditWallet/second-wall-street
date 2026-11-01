"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CitySnapshot } from "@/lib/city/types";
import { indexCity } from "@/lib/city/queries";
import { useReducedMotion, useWebGLSupport } from "@/components/city/hooks";

const CityCanvas = dynamic(() => import("@/components/city/scene/CityCanvas"), { ssr: false });

/** Non-interactive, slowly orbiting city behind the hero. Stops rendering when off-screen. */
export function HeroCity({ snapshot }: { snapshot: CitySnapshot }) {
  const index = useMemo(() => indexCity(snapshot), [snapshot]);
  const webgl = useWebGLSupport();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { threshold: 0.02 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="absolute inset-0" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_60%_40%,#0f2147_0%,#050a18_60%)]" />
      {webgl && (
        <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}>
          <CityCanvas index={index} mode="showcase" animate={!reduced && onScreen} paused={!onScreen} onReady={() => setReady(true)} />
        </div>
      )}
    </div>
  );
}
