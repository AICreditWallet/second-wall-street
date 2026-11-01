"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Compass,
  Eye,
  List,
  Map as MapIcon,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Layers,
  X,
} from "lucide-react";
import type { BuildingIndicator, CitySnapshot } from "@/lib/city/types";
import { INDICATOR_META, indexCity, searchCity, type SearchResult } from "@/lib/city/queries";
import { LogoMark } from "@/components/site/logo";
import type { CameraCommand } from "./camera-store";
import { CityMap2D } from "./CityMap2D";
import { OfficePanel } from "./OfficePanel";
import { useMediaQuery, useReducedMotion, useViewportHeight, useWebGLSupport } from "./hooks";
import { roofTop } from "./scene/Markers";

const CityCanvas = dynamic(() => import("./scene/CityCanvas"), { ssr: false, loading: () => <CityLoading /> });

function CityLoading() {
  return (
    <div className="grid h-full place-items-center bg-[#050a18]" role="status">
      <p className="animate-pulse text-sm text-fg-muted">Lighting up the district…</p>
    </div>
  );
}

const FILTERS: BuildingIndicator[] = ["free", "premium", "platform"];

export function CityExplorer({ snapshot }: { snapshot: CitySnapshot }) {
  const index = useMemo(() => indexCity(snapshot), [snapshot]);
  const webgl = useWebGLSupport();
  const reducedMotion = useReducedMotion();
  const wide = useMediaQuery("(min-width: 640px)");
  const viewportH = useViewportHeight();
  const commands = useRef<((c: CameraCommand) => void) | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [visible, setVisible] = useState<Set<BuildingIndicator>>(() => new Set(FILTERS));
  const [legendOpen, setLegendOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pointer = useRef<HTMLDivElement>(null);

  const labelEls = useRef(new Map<string, HTMLElement>());
  const labels = useMemo(() => {
    const flagships = snapshot.buildings.filter((b) => index.indicatorByBuilding.get(b.id) === "platform");
    return [
      ...snapshot.districts.map((d) => ({ id: d.id, text: d.name, kind: "district" as const, position: [d.center[0], 1, d.center[1]] as [number, number, number] })),
      ...flagships.map((b) => ({ id: b.id, text: b.name, kind: "building" as const, position: [b.position[0], roofTop(b) + 10, b.position[1]] as [number, number, number] })),
    ];
  }, [snapshot, index]);
  const labelConfig = useMemo(() => ({ anchors: labels, elements: labelEls }), [labels]);

  // Commands issued before the lazily-loaded scene is ready are retried briefly.
  const send = useCallback((c: CameraCommand) => {
    const started = performance.now();
    const attempt = () => {
      if (commands.current) commands.current(c);
      else if (performance.now() - started < 10_000) window.setTimeout(attempt, 100);
    };
    attempt();
  }, []);
  const effectiveMode = webgl === false ? "2d" : mode;

  const select = useCallback(
    (id: string | null, fly = true) => {
      setSelectedId(id);
      const url = new URL(window.location.href);
      if (id) url.searchParams.set("b", id);
      else url.searchParams.delete("b");
      window.history.replaceState(null, "", url);
      if (id && fly) send({ type: "focus-building", id });
    },
    [send],
  );

  // Deep links: /city?b=<building>, ?district=<slug>, ?filter=free
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const b = params.get("b");
    const district = params.get("district");
    const filter = params.get("filter");
    const t = window.setTimeout(() => {
      if (b && index.buildingById.has(b)) select(b);
      else if (district) {
        const d = snapshot.districts.find((x) => x.slug === district);
        if (d) send({ type: "focus-point", x: d.center[0], z: d.center[1], distance: 150 });
      }
      if (filter === "free" || filter === "premium") setVisible(new Set([filter]));
    }, 400);
    return () => window.clearTimeout(t);
  }, [index, snapshot.districts, select, send]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]")) {
        if (e.key === "Escape") {
          setSearchOpen(false);
          (el as HTMLInputElement).blur();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map: Record<string, CameraCommand> = {
        arrowup: { type: "pan", dx: 0, dz: 1 },
        w: { type: "pan", dx: 0, dz: 1 },
        arrowdown: { type: "pan", dx: 0, dz: -1 },
        s: { type: "pan", dx: 0, dz: -1 },
        arrowleft: { type: "pan", dx: -1, dz: 0 },
        a: { type: "pan", dx: -1, dz: 0 },
        arrowright: { type: "pan", dx: 1, dz: 0 },
        d: { type: "pan", dx: 1, dz: 0 },
        "+": { type: "zoom", factor: 0.75 },
        "=": { type: "zoom", factor: 0.75 },
        "-": { type: "zoom", factor: 1.33 },
        q: { type: "rotate", angle: 0.35 },
        e: { type: "rotate", angle: -0.35 },
        r: { type: "reset" },
      };
      if (k === "escape") return select(null);
      if (k === "/") {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }
      const cmd = map[k];
      if (cmd) {
        e.preventDefault();
        send(cmd);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send, select]);

  const results = useMemo(() => searchCity(index, query), [index, query]);
  const pickResult = (r: SearchResult) => {
    setQuery("");
    setSearchOpen(false);
    if (r.buildingId) select(r.buildingId);
    else if (r.center) send({ type: "focus-point", x: r.center[0], z: r.center[1], distance: 150 });
  };

  const hovered = hoveredId ? index.buildingById.get(hoveredId) : undefined;
  const freeCount = snapshot.offices.filter((o) => o.status === "available" && o.tier === "standard").length;

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-[#050a18]"
      onPointerMove={(e) => {
        if (pointer.current) pointer.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`;
      }}
    >
      <h1 className="sr-only">Second Wall Street — interactive city</h1>

      {/* Scene */}
      <div className="absolute inset-0" style={{ cursor: hoveredId ? "pointer" : undefined }}>
        {effectiveMode === "3d" && webgl ? (
          <CityCanvas
            index={index}
            mode="explore"
            animate={!reducedMotion}
            selectedId={selectedId}
            hoveredId={hoveredId}
            visibleIndicators={visible}
            onHover={setHoveredId}
            onSelect={(id) => select(id)}
            onMiss={() => setHoveredId(null)}
            commands={commands}
            labels={labelConfig}
            onReady={() => setSceneReady(true)}
            inset={selectedId ? (wide ? { right: 432, bottom: 0 } : { right: 0, bottom: Math.round(viewportH * 0.55) }) : undefined}
          />
        ) : webgl === null ? (
          <CityLoading />
        ) : (
          <div className="grid h-full place-items-center p-4 pb-28 pt-20 sm:pb-6">
            <CityMap2D index={index} selectedId={selectedId} onSelect={(id) => select(id, false)} className="h-full max-h-[80dvh] w-full" title="2D map of Second Wall Street" />
          </div>
        )}
      </div>

      {effectiveMode === "3d" && webgl && (
        <div
          className={`pointer-events-none absolute inset-0 z-[6] transition-opacity duration-700 ${sceneReady ? "opacity-0" : "opacity-100"}`}
          aria-hidden={sceneReady}
        >
          <CityLoading />
        </div>
      )}

      {/* Projected labels (positioned by LabelProjector inside the canvas) */}
      {effectiveMode === "3d" && webgl && (
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden="true">
          {labels.map((l) => (
            <span
              key={l.id}
              ref={(el) => {
                if (el) labelEls.current.set(l.id, el);
                else labelEls.current.delete(l.id);
              }}
              className={`absolute left-0 top-0 whitespace-nowrap opacity-0 transition-opacity duration-300 ${
                l.kind === "district"
                  ? "text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60 [text-shadow:0_1px_8px_#000]"
                  : "glass rounded-full px-2.5 py-1 text-[11px] font-medium text-white"
              }`}
            >
              {l.text}
            </span>
          ))}
        </div>
      )}

      {/* Hover tooltip (desktop) */}
      {hovered && wide && effectiveMode === "3d" && (
        <div ref={pointer} className="pointer-events-none fixed left-0 top-0 z-30 will-change-transform" aria-hidden="true">
          <div className="glass rounded-xl px-3 py-2 text-xs">
            <p className="font-medium text-fg">{hovered.name}</p>
            <p className="text-fg-muted">{INDICATOR_META[index.indicatorByBuilding.get(hovered.id) ?? "occupied"].label}</p>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3 sm:p-4" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <Link href="/" className="glass pointer-events-auto flex h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-medium" aria-label="Back to Second Wall Street home">
          <LogoMark className="size-8" />
          <span className="hidden sm:inline">Second Wall Street</span>
        </Link>

        <div className="pointer-events-auto relative ml-auto w-full max-w-sm sm:ml-0">
          <div className={`glass flex h-11 items-center gap-2 rounded-full px-3.5 ${searchOpen || wide ? "" : "ml-auto w-11 justify-center px-0"}`}>
            <Search className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            {(searchOpen || wide) && (
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) pickResult(results[0]);
                }}
                placeholder="Search offices, organisations, districts"
                aria-label="Search the city"
                maxLength={80}
                className="h-full w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              />
            )}
            {!wide && !searchOpen && (
              <button type="button" className="absolute inset-0 rounded-full" aria-label="Open search" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchRef.current?.focus()); }} />
            )}
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-fg-muted hover:text-fg">
                <X className="size-4" />
              </button>
            )}
          </div>
          {query && searchOpen && (
            <ul className="glass absolute inset-x-0 top-12 max-h-80 overflow-y-auto rounded-2xl p-1.5" role="listbox" aria-label="Search results">
              {results.length === 0 && <li className="px-3 py-2.5 text-sm text-fg-muted">No matches</li>}
              {results.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <button type="button" onClick={() => pickResult(r)} className="flex w-full flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-white/5" role="option" aria-selected={false}>
                    <span className="text-sm text-fg">{r.title}</span>
                    <span className="text-xs text-fg-subtle">{r.kind === "building" ? r.subtitle : `${r.kind === "district" ? "District" : "Organisation"} · ${r.subtitle}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pointer-events-auto ml-auto hidden items-center gap-2 md:flex">
          <span className="glass flex h-11 items-center rounded-full px-4 text-xs text-fg-muted">
            <span className="mr-2 size-2 rounded-full bg-cyan" aria-hidden="true" />
            {freeCount} free offices
          </span>
          <Link href="/get-started" className="flex h-11 items-center rounded-full bg-cyan px-5 text-sm font-medium text-ink-950 hover:bg-cyan-soft">
            Claim a Free Office
          </Link>
        </div>
      </div>

      {/* District chips */}
      <nav aria-label="Districts" className={`pointer-events-none absolute inset-x-0 top-16 z-10 hidden px-4 pt-2 ${effectiveMode === "3d" ? "sm:block" : ""}`} style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 3.25rem)" }}>
        <ul className="pointer-events-auto flex w-max max-w-full gap-1.5 overflow-x-auto">
          {snapshot.districts.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => send({ type: "focus-point", x: d.center[0], z: d.center[1], distance: 150 })}
                className="glass h-9 whitespace-nowrap rounded-full px-3.5 text-xs text-fg-muted hover:text-fg"
              >
                {d.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Camera toolbar */}
      <div className={`absolute bottom-4 left-3 z-20 flex-col gap-2 sm:left-4 ${selectedId ? "hidden sm:flex" : "flex"}`} style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {legendOpen && (
          <div className="glass w-60 rounded-2xl p-3" id="legend">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">Show on map</p>
            <ul className="space-y-1">
              {FILTERS.map((f) => (
                <li key={f}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-cyan-400"
                      checked={visible.has(f)}
                      onChange={(e) => {
                        const next = new Set(visible);
                        if (e.target.checked) next.add(f);
                        else next.delete(f);
                        setVisible(next);
                      }}
                    />
                    <span className="size-2.5 rotate-45 rounded-[2px]" style={{ background: INDICATOR_META[f].color }} aria-hidden="true" />
                    {INDICATOR_META[f].label}
                  </label>
                </li>
              ))}
              <li className="flex min-h-9 items-center gap-2.5 px-1 text-sm text-fg-muted">
                <span className="ml-[26px] size-2.5 rounded-full" style={{ background: INDICATOR_META.occupied.color }} aria-hidden="true" />
                Occupied (no marker)
              </li>
            </ul>
          </div>
        )}
        <div className="glass flex items-center gap-0.5 rounded-full p-1">
          <ToolButton label="Legend and filters" onClick={() => setLegendOpen((v) => !v)} pressed={legendOpen} controls="legend">
            <Layers className="size-4" />
          </ToolButton>
          {effectiveMode === "3d" && (
            <>
              <ToolButton label="Aerial view" onClick={() => send({ type: "view", view: "aerial" })}>
                <Compass className="size-4" />
              </ToolButton>
              <ToolButton label="Street-level view" onClick={() => send({ type: "view", view: "street" })}>
                <Eye className="size-4" />
              </ToolButton>
              <ToolButton label="Reset view" onClick={() => send({ type: "reset" })}>
                <RotateCcw className="size-4" />
              </ToolButton>
            </>
          )}
          {webgl !== false && (
            <ToolButton label={effectiveMode === "3d" ? "Switch to 2D map" : "Switch to 3D city"} onClick={() => setMode((m) => (m === "3d" ? "2d" : "3d"))}>
              {effectiveMode === "3d" ? <MapIcon className="size-4" /> : <Box className="size-4" />}
            </ToolButton>
          )}
          <Link href="/directory" className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-white/10 hover:text-fg" aria-label="Office directory (list view)" title="Office directory (list view)">
            <List className="size-4" />
          </Link>
        </div>
      </div>

      {/* Zoom / rotate (desktop) */}
      {effectiveMode === "3d" && !selectedId && (
        <div className="absolute bottom-4 right-4 z-10 hidden flex-col items-end gap-2 sm:flex" style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div className="glass overflow-hidden rounded-2xl">
            <CityMap2D index={index} selectedId={selectedId} showCamera onPoint={(x, z) => send({ type: "focus-point", x, z })} className="block h-36 w-48 cursor-crosshair" title="Minimap — click to move the camera" />
          </div>
          <div className="glass flex items-center gap-0.5 rounded-full p-1">
            <ToolButton label="Rotate left" onClick={() => send({ type: "rotate", angle: 0.4 })}>
              <RotateCcw className="size-4" />
            </ToolButton>
            <ToolButton label="Zoom out" onClick={() => send({ type: "zoom", factor: 1.35 })}>
              <Minus className="size-4" />
            </ToolButton>
            <ToolButton label="Zoom in" onClick={() => send({ type: "zoom", factor: 0.72 })}>
              <Plus className="size-4" />
            </ToolButton>
            <ToolButton label="Rotate right" onClick={() => send({ type: "rotate", angle: -0.4 })}>
              <RotateCw className="size-4" />
            </ToolButton>
          </div>
        </div>
      )}

      {/* Hint */}
      {!selectedId && (
        <p className="pointer-events-none absolute inset-x-0 bottom-20 z-10 mx-auto w-fit max-w-[90vw] rounded-full bg-black/40 px-4 py-2 text-center text-xs text-fg-muted backdrop-blur sm:bottom-6">
          {effectiveMode === "2d"
            ? "Select a building to see its offices"
            : wide
              ? "Drag to pan · right-drag to rotate · scroll to zoom · click a building"
              : "Drag to move · pinch to zoom · tap a building"}
        </p>
      )}

      {/* Details panel: bottom sheet on mobile, side panel on desktop */}
      {selectedId && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[7.5rem]">
          <OfficePanel index={index} buildingId={selectedId} onClose={() => select(null)} onFocus={() => send({ type: "focus-building", id: selectedId })} />
        </div>
      )}

      {snapshot.source === "demo" && (
        <p className="sr-only">This city uses a development dataset. Offices shown as available are real inventory for launch; no community organisations have joined yet.</p>
      )}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
  pressed,
  controls,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  controls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-controls={controls}
      className={`grid size-10 place-items-center rounded-full transition-colors hover:bg-white/10 hover:text-fg ${pressed ? "bg-white/10 text-fg" : "text-fg-muted"}`}
    >
      {children}
    </button>
  );
}
