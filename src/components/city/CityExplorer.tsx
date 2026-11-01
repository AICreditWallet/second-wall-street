"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Box, ChevronRight, Compass, Eye, Layers, List, Map as MapIcon, Minus, Plus, RotateCcw, RotateCw, Search, X } from "lucide-react";
import type { BuildingIndicator, CitySnapshot } from "@/lib/city/types";
import { INDICATOR_META, TIER_LABEL, indexCity, organizationForBuilding, searchCity, type SearchResult } from "@/lib/city/queries";
import { floorDirectory, resolveInterior } from "@/lib/city/interiors";
import { LogoMark } from "@/components/site/logo";
import { buttonClass } from "@/components/ui/button";
import type { CameraCommand } from "./camera-store";
import { CityMap2D } from "./CityMap2D";
import { BuildingPanel } from "./BuildingPanel";
import { LobbyPanel, OfficeInteriorPanel } from "./InteriorPanel";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { useMediaQuery, useReducedMotion, useViewportHeight, useWebGLSupport } from "./hooks";
import { roofTop, type LabelAnchor, type LabelFocus } from "./scene/Markers";
import type { WorldView } from "./scene/CityCanvas";
import { contextLossCount, recordContextLoss } from "./scene/quality";
import { officeStatusText } from "./scene/FloorStack";

const CityCanvas = dynamic(() => import("./scene/CityCanvas"), { ssr: false, loading: () => <CityLoading /> });

function CityLoading({ text = "Lighting up the district…" }: { text?: string }) {
  return (
    <div className="grid h-full place-items-center bg-[#050a18]" role="status">
      <p className="animate-pulse text-sm text-fg-muted">{text}</p>
    </div>
  );
}

const FILTERS: BuildingIndicator[] = ["free", "premium", "platform"];
const ID_B = /^bld-[a-z]{2}-\d{3}$/;
const ID_O = /^ofc-[a-z]{2}-\d{3}-\d{1,2}$/;

interface Nav {
  view: WorldView;
  buildingId: string | null;
  officeId: string | null;
}

/** URL ⇄ navigation state: /city?b=…, &view=building|lobby, &office=… */
function navFromUrl(index: ReturnType<typeof indexCity>): Nav {
  const p = new URLSearchParams(window.location.search);
  const b = p.get("b");
  const o = p.get("office");
  const v = p.get("view");
  const buildingId = b && ID_B.test(b) && index.buildingById.has(b) ? b : null;
  if (!buildingId) return { view: "city", buildingId: null, officeId: null };
  const office = o && ID_O.test(o) ? index.snapshot.offices.find((x) => x.id === o && x.buildingId === buildingId) : undefined;
  if (office) return { view: "office", buildingId, officeId: office.id };
  if (v === "lobby" || v === "building") return { view: v, buildingId, officeId: null };
  return { view: "city", buildingId, officeId: null };
}

function urlFromNav(n: Nav) {
  const url = new URL(window.location.href);
  for (const k of ["b", "view", "office"]) url.searchParams.delete(k);
  if (n.buildingId) url.searchParams.set("b", n.buildingId);
  if (n.view === "building" || n.view === "lobby") url.searchParams.set("view", n.view);
  if (n.view === "office" && n.officeId) url.searchParams.set("office", n.officeId);
  return url;
}

export function CityExplorer({ snapshot }: { snapshot: CitySnapshot }) {
  const index = useMemo(() => indexCity(snapshot), [snapshot]);
  const webgl = useWebGLSupport();
  const reducedMotion = useReducedMotion();
  const wide = useMediaQuery("(min-width: 640px)");
  const viewportH = useViewportHeight();
  const commands = useRef<((c: CameraCommand) => void) | null>(null);

  const [nav, setNav] = useState<Nav>({ view: "city", buildingId: null, officeId: null });
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [visible, setVisible] = useState<Set<BuildingIndicator>>(() => new Set(FILTERS));
  const [legendOpen, setLegendOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [glLost, setGlLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [transitionKey, setTransitionKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });

  const selectedId = nav.buildingId;
  const inside = nav.view === "lobby" || nav.view === "office";
  const effectiveMode = webgl === false ? "2d" : mode;
  const threeD = effectiveMode === "3d" && webgl === true;

  // Labels: districts, plus every building (organisation name when occupied).
  const labelEls = useRef(new Map<string, HTMLElement>());
  const labelFocus = useRef<LabelFocus>({ hoveredId: null, selectedId: null, hidden: false, isolate: false });
  useEffect(() => {
    labelFocus.current = { hoveredId, selectedId, hidden: inside, isolate: nav.view === "building" };
  }, [hoveredId, selectedId, inside, nav.view]);
  const labels = useMemo(() => {
    const anchors: (LabelAnchor & { text: string; sub?: string })[] = snapshot.districts.map((d) => ({
      id: d.id,
      text: d.name,
      kind: "district" as const,
      priority: 5,
      position: [d.center[0], 1, d.center[1]] as [number, number, number],
    }));
    for (const b of snapshot.buildings) {
      const org = organizationForBuilding(index, b.id);
      anchors.push({
        id: b.id,
        buildingId: b.id,
        text: org?.name ?? b.name,
        sub: org ? b.name : undefined,
        kind: "building",
        pinned: Boolean(org),
        priority: org ? 60 : 10 + b.height / 10,
        position: [b.position[0], roofTop(b) + 7, b.position[1]],
      });
    }
    return anchors;
  }, [snapshot, index]);
  const labelConfig = useMemo(() => ({ anchors: labels, elements: labelEls, focus: labelFocus }), [labels]);

  // Commands issued before the lazily-loaded scene is ready are retried briefly.
  const send = useCallback((c: CameraCommand) => {
    const started = performance.now();
    const attempt = () => {
      if (commands.current) commands.current(c);
      else if (performance.now() - started < 10_000) window.setTimeout(attempt, 100);
    };
    attempt();
  }, []);

  const go = useCallback(
    (next: Nav, opts: { push?: boolean; fly?: boolean } = {}) => {
      setNav((prev) => {
        const insideBefore = prev.view === "lobby" || prev.view === "office";
        const insideAfter = next.view === "lobby" || next.view === "office";
        if (insideBefore !== insideAfter || prev.officeId !== next.officeId) setTransitionKey((k) => k + 1);
        return next;
      });
      setSelectedAgentId(null);
      setShowWorkflow(false);
      if (next.view !== "building") setSelectedOfficeId(null);
      const url = urlFromNav(next);
      if (opts.push) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
      if (opts.fly !== false && next.buildingId) {
        if (next.view === "city") send({ type: "focus-building", id: next.buildingId });
        if (next.view === "building") send({ type: "building-view", id: next.buildingId });
      }
    },
    [send],
  );

  const select = useCallback((id: string | null) => go({ view: "city", buildingId: id, officeId: null }), [go]);
  const exploreFloors = useCallback((id: string) => go({ view: "building", buildingId: id, officeId: null }, { push: true }), [go]);
  const enterLobby = useCallback((id: string) => go({ view: "lobby", buildingId: id, officeId: null }, { push: true }), [go]);
  const enterOffice = useCallback(
    (officeId: string) => {
      const o = snapshot.offices.find((x) => x.id === officeId);
      if (o) go({ view: "office", buildingId: o.buildingId, officeId }, { push: true });
    },
    [go, snapshot.offices],
  );
  const back = useCallback(() => {
    if (nav.view === "office" && nav.buildingId) go({ view: "lobby", buildingId: nav.buildingId, officeId: null }, { push: true });
    else if (nav.view === "lobby" && nav.buildingId) go({ view: "building", buildingId: nav.buildingId, officeId: null }, { push: true });
    else if (nav.view === "building" && nav.buildingId) go({ view: "city", buildingId: nav.buildingId, officeId: null }, { push: true });
    else select(null);
  }, [go, nav, select]);

  // Initial deep link + browser back/forward.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const district = params.get("district");
    const filter = params.get("filter");
    const t = window.setTimeout(() => {
      const n = navFromUrl(index);
      if (n.buildingId) go(n);
      else if (district) {
        const d = snapshot.districts.find((x) => x.slug === district);
        if (d) send({ type: "focus-point", x: d.center[0], z: d.center[1], distance: 150 });
      }
      if (filter === "free" || filter === "premium") setVisible(new Set([filter]));
    }, 300);
    const onPop = () => go(navFromUrl(index));
    window.addEventListener("popstate", onPop);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("popstate", onPop);
    };
  }, [index, snapshot.districts, go, send]);

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
      if (k === "escape") {
        if (selectedAgentId) return setSelectedAgentId(null);
        if (nav.view !== "city" || nav.buildingId) return back();
        return;
      }
      if (inside) return;
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
  }, [send, back, nav, inside, selectedAgentId]);

  const results = useMemo(() => searchCity(index, query), [index, query]);
  const pickResult = (r: SearchResult) => {
    setQuery("");
    setSearchOpen(false);
    if (r.buildingId) select(r.buildingId);
    else if (r.center) send({ type: "focus-point", x: r.center[0], z: r.center[1], distance: 150 });
  };

  const onContextLost = useCallback(() => {
    recordContextLoss();
    setGlLost(true);
  }, []);
  const restart3D = () => {
    setGlLost(false);
    setSceneReady(false);
    setCanvasKey((k) => k + 1);
  };
  const tooManyLosses = glLost && contextLossCount() >= 3;

  // Clicking the elevators or directory screen highlights the floor list.
  const focusDirectory = useCallback(() => {
    const list = document.querySelector<HTMLElement>('[aria-label="Floor directory"]');
    list?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    list?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  // Interior props for the current building / office.
  const building = selectedId ? index.buildingById.get(selectedId) : undefined;
  const office = nav.officeId ? snapshot.offices.find((o) => o.id === nav.officeId) : undefined;
  const resolved = useMemo(() => (office ? resolveInterior(snapshot, office) : null), [snapshot, office]);
  const interior = useMemo(() => {
    if (!building) return undefined;
    const district = snapshot.districts.find((d) => d.id === building.districtId);
    if (nav.view === "lobby") {
      const dir = floorDirectory(index.officesByBuilding.get(building.id) ?? []).map(
        (o) => `${o.label} · ${officeStatusText(o, o.organizationId ? index.orgById.get(o.organizationId)?.name : undefined)}`,
      );
      return { kind: "lobby" as const, accent: "#38e1ff", title: building.name, subtitle: district?.name, directory: dir, onElevator: focusDirectory, people: 7, seed: building.height };
    }
    if (nav.view === "office" && office && resolved) {
      const org = office.organizationId ? index.orgById.get(office.organizationId) : undefined;
      const agents = resolved.agents.map((id) => {
        const a = id ? snapshot.agents.find((x) => x.id === id) : undefined;
        return a ? { id: a.id, name: a.name, status: a.status } : undefined;
      });
      return {
        kind: resolved.template,
        accent: resolved.accent,
        title: org?.name ?? "Available office",
        subtitle: `${building.name} · ${office.label}`,
        agents,
        selectedAgentId,
        onSelectAgent: setSelectedAgentId,
        showWorkflow,
        people: office.status === "available" ? 0 : resolved.template === "research" ? 14 : resolved.template === "startup" ? 8 : 4,
        seed: office.id.length * 31 + building.floors,
      };
    }
    return undefined;
  }, [building, nav.view, office, resolved, snapshot, index, selectedAgentId, showWorkflow, focusDirectory]);

  const hovered = hoveredId ? index.buildingById.get(hoveredId) : undefined;
  const hoveredOrg = hoveredId ? organizationForBuilding(index, hoveredId) : null;
  const hoveredOffices = hoveredId ? (index.officesByBuilding.get(hoveredId) ?? []) : [];
  const freeCount = snapshot.offices.filter((o) => o.status === "available" && o.tier === "standard").length;
  const panelOpen = Boolean(selectedId);

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-[#050a18]"
      onPointerMove={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY };
        if (tooltip.current) tooltip.current.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 16}px)`;
      }}
    >
      <h1 className="sr-only">Second Wall Street — interactive city</h1>

      {/* Scene */}
      <div className="absolute inset-0 bg-[#050a18]" style={{ cursor: hoveredId && !inside ? "pointer" : undefined }} data-testid="scene">
        {threeD ? (
          <SceneErrorBoundary
            onError={() => recordContextLoss()}
            fallback={(reset) => (
              <GraphicsProblem
                message="The 3D view hit a problem."
                onRetry={() => {
                  reset();
                  restart3D();
                }}
                on2D={() => setMode("2d")}
              />
            )}
          >
            <CityCanvas
              key={canvasKey}
              index={index}
              mode="explore"
              animate={!reducedMotion}
              view={nav.view}
              selectedId={selectedId}
              hoveredId={inside ? null : hoveredId}
              selectedOfficeId={selectedOfficeId}
              onSelectOffice={setSelectedOfficeId}
              visibleIndicators={visible}
              onHover={setHoveredId}
              onSelect={(id) => select(id)}
              onEnter={exploreFloors}
              onMiss={() => setHoveredId(null)}
              commands={commands}
              labels={labelConfig}
              interior={interior}
              tier={canvasKey > 0 || contextLossCount() > 0 ? "low" : undefined}
              onReady={() => setSceneReady(true)}
              onContextLost={onContextLost}
              inset={panelOpen ? (wide ? { right: 432, bottom: 0 } : { right: 0, bottom: Math.round(viewportH * 0.55) }) : undefined}
            />
          </SceneErrorBoundary>
        ) : webgl === null ? (
          <CityLoading />
        ) : (
          <div className="grid h-full place-items-center p-4 pb-28 pt-24 sm:pb-6">
            <CityMap2D index={index} selectedId={selectedId} onSelect={(id) => go({ view: "city", buildingId: id, officeId: null }, { fly: false })} className="h-full max-h-[78dvh] w-full" title="2D map of Second Wall Street" />
          </div>
        )}
      </div>

      {/* Loading veil, and a short fade when stepping in or out of a building. */}
      {threeD && (
        <div className={`pointer-events-none absolute inset-0 z-[6] transition-opacity duration-700 ${sceneReady ? "opacity-0" : "opacity-100"}`} aria-hidden={sceneReady}>
          <CityLoading />
        </div>
      )}
      {threeD && transitionKey > 0 && !reducedMotion && <div key={transitionKey} className="animate-scene-fade pointer-events-none absolute inset-0 z-[7] bg-[#050a18]" aria-hidden="true" />}

      {/* Lost graphics context: never show a white canvas — cover it and offer recovery. */}
      {threeD && glLost && (
        <div className="absolute inset-0 z-40">
          <GraphicsProblem
            message={tooManyLosses ? "Your device's graphics keep resetting, so we recommend the 2D map." : "The 3D view paused to protect your device's graphics."}
            onRetry={tooManyLosses ? undefined : restart3D}
            on2D={() => {
              setGlLost(false);
              setMode("2d");
            }}
          />
        </div>
      )}

      {webgl === false && (
        <p role="status" className="glass absolute inset-x-3 bottom-20 z-20 mx-auto max-w-lg rounded-2xl px-4 py-3 text-center text-xs text-fg-muted sm:bottom-6">
          3D graphics aren&apos;t available in this browser right now, so you&apos;re seeing the 2D map. If 3D normally works, restarting your browser usually fixes it.
        </p>
      )}

      {/* Projected labels (positioned by LabelProjector inside the canvas) */}
      {threeD && !inside && (
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden="true">
          {labels.map((l) => (
            <span
              key={l.id}
              ref={(el) => {
                if (el) labelEls.current.set(l.id, el);
                else labelEls.current.delete(l.id);
              }}
              className={`absolute left-0 top-0 whitespace-nowrap opacity-0 transition-opacity duration-200 ${
                l.kind === "district"
                  ? "text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 [text-shadow:0_1px_8px_#000]"
                  : `rounded-full border px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur data-[focus=1]:border-cyan data-[focus=1]:bg-cyan/20 ${l.pinned ? "border-violet/50 bg-ink-900/85" : "border-line bg-ink-900/75"}`
              }`}
            >
              {l.text}
            </span>
          ))}
        </div>
      )}

      {/* Hover tooltip (desktop) */}
      {hovered && wide && threeD && !inside && (
        <div
          ref={(el) => {
            tooltip.current = el;
            if (el) el.style.transform = `translate(${pointer.current.x + 16}px, ${pointer.current.y + 16}px)`;
          }}
          className="pointer-events-none fixed left-0 top-0 z-30"
          aria-hidden="true"
        >
          <div className="glass min-w-48 rounded-xl px-3 py-2.5 text-xs">
            <p className="text-sm font-medium text-fg">{hoveredOrg?.name ?? hovered.name}</p>
            {hoveredOrg && <p className="text-fg-muted">{hovered.name}</p>}
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-fg-muted">
              <dt>District</dt>
              <dd className="text-fg">{snapshot.districts.find((d) => d.id === hovered.districtId)?.name}</dd>
              <dt>Floors</dt>
              <dd className="text-fg">{hovered.floors}</dd>
              <dt>Available</dt>
              <dd className="text-fg">
                {hoveredOffices.filter((o) => o.status === "available").length} of {hoveredOffices.length} offices
              </dd>
              <dt>Category</dt>
              <dd className="text-fg">{TIER_LABEL[hovered.tier]}</dd>
            </dl>
            <p className="mt-1.5 text-[10px] text-fg-subtle">Click to select · double-click for floors</p>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3 sm:p-4" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <Link href="/" className="glass pointer-events-auto flex h-11 shrink-0 items-center gap-2 rounded-full pl-1.5 pr-4 text-sm font-medium" aria-label="Back to Second Wall Street home">
          <LogoMark className="size-8" />
          <span className="hidden sm:inline">Second Wall Street</span>
        </Link>

        {!inside && (
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
                <button
                  type="button"
                  className="absolute inset-0 rounded-full"
                  aria-label="Open search"
                  onClick={() => {
                    setSearchOpen(true);
                    requestAnimationFrame(() => searchRef.current?.focus());
                  }}
                />
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
        )}

        <div className="pointer-events-auto ml-auto hidden items-center gap-2 md:flex">
          <span className="glass flex h-11 items-center rounded-full px-4 text-xs text-fg-muted">
            <span className="mr-2 size-2 rounded-full bg-cyan" aria-hidden="true" />
            {freeCount} free offices
          </span>
          <Link href="/city?filter=free" className="flex h-11 items-center rounded-full bg-cyan px-5 text-sm font-medium text-ink-950 hover:bg-cyan-soft">
            Claim a Free Office
          </Link>
        </div>
      </div>

      {/* Second row: district shortcuts in the city, breadcrumbs everywhere else. */}
      <div className="pointer-events-none absolute inset-x-0 z-10 px-3 sm:px-4" style={{ top: "calc(max(0.75rem, env(safe-area-inset-top)) + 3.4rem)" }}>
        {nav.view === "city" && !selectedId && threeD ? (
          <nav aria-label="Districts" className="hidden sm:block">
            <ul className="pointer-events-auto flex w-max max-w-full gap-1.5 overflow-x-auto">
              {snapshot.districts.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => send({ type: "focus-point", x: d.center[0], z: d.center[1], distance: 150 })} className="glass h-9 whitespace-nowrap rounded-full px-3.5 text-xs text-fg-muted hover:text-fg">
                    {d.name}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          building && (
            <nav aria-label="You are here" className="pointer-events-auto flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full glass p-1 pr-3 text-xs">
              <button type="button" onClick={back} className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-fg hover:bg-white/20" aria-label="Back">
                <ArrowLeft className="size-4" />
              </button>
              <Crumb onClick={() => go({ view: "city", buildingId: null, officeId: null }, { push: true, fly: false })}>City</Crumb>
              <ChevronRight className="hidden size-3.5 shrink-0 text-fg-subtle sm:block" aria-hidden="true" />
              <Crumb current={nav.view === "city" || nav.view === "building"} onClick={() => go({ view: "building", buildingId: building.id, officeId: null }, { push: true })}>
                {organizationForBuilding(index, building.id)?.name ?? building.name}
              </Crumb>
              {inside && (
                <>
                  <ChevronRight className="hidden size-3.5 shrink-0 text-fg-subtle sm:block" aria-hidden="true" />
                  <Crumb current={nav.view === "lobby"} onClick={() => enterLobby(building.id)}>
                    Lobby
                  </Crumb>
                </>
              )}
              {office && (
                <>
                  <ChevronRight className="hidden size-3.5 shrink-0 text-fg-subtle sm:block" aria-hidden="true" />
                  <Crumb current>{office.label}</Crumb>
                </>
              )}
            </nav>
          )
        )}
      </div>

      {/* City camera toolbar */}
      {!inside && (
        <div className={`absolute bottom-4 left-3 z-20 flex-col gap-2 sm:left-4 ${panelOpen ? "hidden sm:flex" : "flex"}`} style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
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
            {threeD && (
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
      )}

      {/* Minimap and zoom (desktop city view) */}
      {threeD && !inside && !panelOpen && (
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
      {!panelOpen && (
        <p className="pointer-events-none absolute inset-x-0 bottom-20 z-10 mx-auto w-fit max-w-[90vw] rounded-full bg-black/40 px-4 py-2 text-center text-xs text-fg-muted backdrop-blur sm:bottom-6">
          {effectiveMode === "2d"
            ? "Select a building to see its offices"
            : wide
              ? "Drag to pan · right-drag to rotate · scroll to zoom · click a building"
              : "Drag to move · pinch to zoom · tap a building"}
        </p>
      )}

      {/* Details panel: bottom sheet on mobile, side panel on desktop */}
      {panelOpen && selectedId && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[7.75rem]">
          {nav.view === "lobby" ? (
            <LobbyPanel index={index} buildingId={selectedId} onClose={back} onEnterOffice={enterOffice} />
          ) : nav.view === "office" && office && resolved ? (
            <OfficeInteriorPanel
              index={index}
              officeId={office.id}
              interior={resolved}
              selectedAgentId={selectedAgentId}
              showWorkflow={showWorkflow}
              onSelectAgent={setSelectedAgentId}
              onToggleWorkflow={() => setShowWorkflow((v) => !v)}
              onClose={back}
            />
          ) : (
            <BuildingPanel
              index={index}
              buildingId={selectedId}
              view={nav.view === "building" ? "building" : "city"}
              selectedOfficeId={selectedOfficeId}
              canEnter={threeD}
              onSelectOffice={setSelectedOfficeId}
              onClose={() => (nav.view === "building" ? back() : select(null))}
              onExploreFloors={() => exploreFloors(selectedId)}
              onEnterLobby={() => enterLobby(selectedId)}
              onEnterOffice={enterOffice}
            />
          )}
        </div>
      )}

      {snapshot.source === "demo" && <p className="sr-only">This city uses a development dataset.</p>}
    </div>
  );
}

function Crumb({ children, onClick, current }: { children: React.ReactNode; onClick?: () => void; current?: boolean }) {
  if (current || !onClick) {
    return (
      <span className="max-w-[60vw] truncate px-1.5 font-medium text-fg sm:max-w-none" aria-current="page">
        {children}
      </span>
    );
  }
  // On phones only the back button and the current step are shown.
  return (
    <button type="button" onClick={onClick} className="hidden truncate rounded-full px-1.5 py-1 text-fg-muted hover:text-fg sm:inline">
      {children}
    </button>
  );
}

function GraphicsProblem({ message, onRetry, on2D }: { message: string; onRetry?: () => void; on2D: () => void }) {
  return (
    <div className="grid h-full place-items-center bg-[#050a18] p-6" role="alert" data-testid="graphics-problem">
      <div className="max-w-sm text-center">
        <p className="text-base font-medium text-fg">{message}</p>
        <p className="mt-2 text-sm text-fg-muted">Everything still works in the 2D map, including claiming offices.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {onRetry && (
            <button type="button" onClick={onRetry} className={buttonClass("primary")}>
              Restart 3D view
            </button>
          )}
          <button type="button" onClick={on2D} className={buttonClass("secondary")}>
            Use 2D map
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ label, onClick, children, pressed, controls }: { label: string; onClick: () => void; children: React.ReactNode; pressed?: boolean; controls?: string }) {
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
