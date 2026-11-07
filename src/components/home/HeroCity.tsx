"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CityIndex } from "@/lib/city/queries";
import { useMediaQuery, useReducedMotion, useWebGLSupport } from "@/components/city/hooks";

const CityCanvas = dynamic(() => import("@/components/city/scene/CityCanvas"), { ssr: false });

/**
 * A picture of the city appears straight away. On computers, the live 3D city
 * fades in over it once the page has settled; phones, data-saver users and
 * reduced-motion users keep the picture and never download the 3D engine here.
 */
export function HeroCity() {
  const webgl = useWebGLSupport();
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 1024px)");
  const ref = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState<CityIndex | null>(null);
  const live = Boolean(webgl && wide && !reduced);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), { threshold: 0.02 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!live || connection?.saveData) return;
    let cancelled = false;
    const start = async () => {
      // The layout never changes with who rents what, so the hero builds it locally rather than shipping data in the page.
      const [{ generateCity }, { indexCity }] = await Promise.all([import("@/lib/city/generator"), import("@/lib/city/queries")]);
      if (!cancelled) setIndex(indexCity(generateCity()));
    };
    const timer = window.setTimeout(() => void start(), 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [live]);

  return (
    <div ref={ref} className="absolute inset-0" aria-hidden="true">
      <Image src="/brand/city-poster.webp" alt="" fill priority unoptimized sizes="100vw" className="object-cover" />
      {index && (
        <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}>
          <CityCanvas index={index} mode="showcase" animate={onScreen} paused={!onScreen} onReady={() => setReady(true)} />
        </div>
      )}
    </div>
  );
}
