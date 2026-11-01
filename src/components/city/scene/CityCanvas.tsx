"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import type { BuildingIndicator, CitySnapshot } from "@/lib/city/types";
import type { CityIndex } from "@/lib/city/queries";
import type { CameraCommand } from "../camera-store";
import type { InteriorProps } from "../interior/Interior";
import { Buildings } from "./Buildings";
import { CameraRig } from "./CameraRig";
import { FloorStack } from "./FloorStack";
import { Ground } from "./Ground";
import { streetLayout } from "./layout";
import { Beacons, Highlight, LabelProjector, type LabelAnchor, type LabelFocus } from "./Markers";
import { detectQuality, dprFor, TIER_SETTINGS, type QualityTier } from "./quality";
import { Streets } from "./Streets";
import { Traffic } from "./Traffic";

// Interiors are code-split: their furniture/people code loads only when someone enters a building.
const Interior = lazy(() => import("../interior/Interior"));

export type WorldView = "city" | "building" | "lobby" | "office";

export interface CityCanvasProps {
  index: CityIndex;
  mode: "explore" | "showcase";
  /** False when reduced motion is requested or the canvas is off-screen. */
  animate: boolean;
  /** Stop rendering entirely (e.g. hero scrolled out of view). */
  paused?: boolean;
  view?: WorldView;
  selectedId?: string | null;
  hoveredId?: string | null;
  selectedOfficeId?: string | null;
  onSelectOffice?: (id: string) => void;
  visibleIndicators?: Set<BuildingIndicator>;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  onEnter?: (id: string) => void;
  onMiss?: () => void;
  commands?: RefObject<((c: CameraCommand) => void) | null>;
  labels?: { anchors: LabelAnchor[]; elements: RefObject<Map<string, HTMLElement>>; focus: RefObject<LabelFocus> };
  /** Screen area covered by UI panels, so the camera centres on what is still visible. */
  inset?: { right: number; bottom: number };
  /** Lobby/office scene props when inside a building. */
  interior?: Omit<InteriorProps, "animate" | "shadows" | "people"> & { people: number };
  tier?: QualityTier;
  /** Called once the first frames have actually been drawn. */
  onReady?: () => void;
  onContextLost?: () => void;
}

function ReadySignal({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    frames.current += 1;
    if (frames.current === 3) onReady?.();
  });
  return null;
}

function ViewOffset({ right, bottom }: { right: number; bottom: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const { width, height } = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if ((right === 0 && bottom === 0) || width < 2 || height < 2) camera.clearViewOffset();
    else camera.setViewOffset(width, height, right / 2, bottom / 2, width, height);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, width, height, right, bottom, invalidate]);
  return null;
}

const ALL: Set<BuildingIndicator> = new Set(["free", "premium", "platform"]);

export default function CityCanvas({
  index,
  mode,
  animate,
  paused = false,
  view = "city",
  selectedId,
  hoveredId,
  selectedOfficeId = null,
  onSelectOffice,
  visibleIndicators = ALL,
  onHover,
  onSelect,
  onEnter,
  onMiss,
  commands,
  labels,
  inset,
  interior,
  tier: tierProp,
  onReady,
  onContextLost,
}: CityCanvasProps) {
  const snapshot: CitySnapshot = index.snapshot;
  const layout = useMemo(() => streetLayout(snapshot.grid), [snapshot.grid]);
  const [tier, setTier] = useState<QualityTier>(() => tierProp ?? detectQuality());
  const settings = TIER_SETTINGS[tier];
  const [dpr, setDpr] = useState(1);
  const interactive = mode === "explore";
  const inside = view === "lobby" || view === "office";
  const cityAnimate = animate && !inside;
  const selected = selectedId ? index.buildingById.get(selectedId) : undefined;
  const hovered = hoveredId && hoveredId !== selectedId ? index.buildingById.get(hoveredId) : undefined;

  // Resolution follows a pixel budget (prevents GPU overload on large retina screens).
  useEffect(() => {
    const update = () => setDpr(dprFor(tier, window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [tier]);

  return (
    <Canvas
      dpr={dpr}
      shadows={tier === "high"}
      frameloop={paused ? "never" : animate ? "always" : "demand"}
      camera={{ fov: 35, near: 0.5, far: 1600, position: [190, 170, 190] }}
      gl={{ antialias: settings.antialias, powerPreference: "high-performance", alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.1;
        gl.setClearColor("#050a18");
        // The white-screen bug was an unhandled lost WebGL context. Report it so
        // the UI can cover the canvas and offer a recovery path.
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          // R3F deliberately releases the context when a canvas unmounts; only a
          // loss on a canvas that is still on the page is a real GPU problem.
          if (!gl.domElement.isConnected) return;
          onContextLost?.();
        });
      }}
      onPointerMissed={() => onMiss?.()}
      style={{ touchAction: "none", background: "#050a18" }}
      aria-hidden="true"
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr((d) => Math.max(0.75, d * 0.8));
          if (tier === "high") setTier("medium");
        }}
        onFallback={() => setTier("low")}
      />
      <ReadySignal onReady={onReady} />
      <ViewOffset right={inset?.right ?? 0} bottom={inset?.bottom ?? 0} />

      {!inside && (
        <>
          <color attach="background" args={["#050a18"]} />
          <fog attach="fog" args={["#050a18", 260, 720]} />
          <hemisphereLight args={["#6f86d6", "#0a0f22", 2.4]} />
          <ambientLight intensity={0.35} color="#8fa4ff" />
          <directionalLight position={[-120, 200, 80]} intensity={1.6} color="#a9c0ff" />
          <directionalLight position={[140, 60, -60]} intensity={0.6} color="#ffb070" />
        </>
      )}

      {/* The city stays mounted inside buildings so returning is instant; it is just hidden. */}
      <group visible={!inside}>
        <Ground snapshot={snapshot} layout={layout} />
        <Buildings buildings={snapshot.buildings} interactive={interactive && !inside} onHover={onHover} onSelect={onSelect} onEnter={onEnter} />
        {interactive && <Streets layout={layout} />}
        <Traffic layout={layout} animate={cityAnimate} density={settings.traffic} />
        {settings.beacons && <Beacons buildings={snapshot.buildings} indicators={index.indicatorByBuilding} visible={visibleIndicators} animate={cityAnimate && tier !== "low"} />}
        {!inside && labels && <LabelProjector anchors={labels.anchors} elements={labels.elements} buildings={snapshot.buildings} focus={labels.focus} />}
        {hovered && <Highlight building={hovered} tone="hover" />}
        {selected && view === "city" && <Highlight building={selected} tone="selected" />}
        {selected && view === "building" && onSelectOffice && (
          <FloorStack
            building={selected}
            offices={index.officesByBuilding.get(selected.id) ?? []}
            orgs={index.orgById}
            selectedOfficeId={selectedOfficeId}
            onSelectOffice={onSelectOffice}
          />
        )}
      </group>

      {inside ? (
        interior && (
          <Suspense fallback={null}>
            <Interior {...interior} people={Math.round(interior.people * settings.people)} animate={animate} shadows={tier === "high"} />
          </Suspense>
        )
      ) : (
        <CameraRig buildings={snapshot.buildings} bounds={snapshot.bounds} interactive={interactive} animate={animate} commands={commands} />
      )}
    </Canvas>
  );
}
