"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import type { BuildingIndicator, CitySnapshot } from "@/lib/city/types";
import type { CityIndex } from "@/lib/city/queries";
import type { CameraCommand } from "../camera-store";
import { Buildings } from "./Buildings";
import { CameraRig } from "./CameraRig";
import { Ground } from "./Ground";
import { streetLayout } from "./layout";
import { Beacons, Highlight, LabelProjector, type LabelAnchor } from "./Markers";
import { Traffic } from "./Traffic";

export interface CityCanvasProps {
  index: CityIndex;
  mode: "explore" | "showcase";
  /** False when reduced motion is requested or the canvas is off-screen. */
  animate: boolean;
  /** Stop rendering entirely (e.g. hero scrolled out of view). */
  paused?: boolean;
  selectedId?: string | null;
  hoveredId?: string | null;
  visibleIndicators?: Set<BuildingIndicator>;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  onMiss?: () => void;
  commands?: RefObject<((c: CameraCommand) => void) | null>;
  labels?: { anchors: LabelAnchor[]; elements: RefObject<Map<string, HTMLElement>> };
  /** Screen area covered by UI panels, so the camera centres on what is still visible. */
  inset?: { right: number; bottom: number };
  /** Called once the first frames have actually been drawn. */
  onReady?: () => void;
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
    if (right === 0 && bottom === 0) camera.clearViewOffset();
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
  selectedId,
  hoveredId,
  visibleIndicators = ALL,
  onHover,
  onSelect,
  onMiss,
  commands,
  labels,
  inset,
  onReady,
}: CityCanvasProps) {
  const snapshot: CitySnapshot = index.snapshot;
  const layout = useMemo(() => streetLayout(snapshot.grid), [snapshot.grid]);
  const [dpr, setDpr] = useState(1.5);
  const [lowPower, setLowPower] = useState(false);
  const interactive = mode === "explore";
  const selected = selectedId ? index.buildingById.get(selectedId) : undefined;
  const hovered = hoveredId && hoveredId !== selectedId ? index.buildingById.get(hoveredId) : undefined;

  return (
    <Canvas
      dpr={dpr}
      frameloop={paused ? "never" : animate ? "always" : "demand"}
      camera={{ fov: 35, near: 1, far: 1600, position: [190, 170, 190] }}
      gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.1;
      }}
      onPointerMissed={() => onMiss?.()}
      style={{ touchAction: "none" }}
      aria-hidden="true"
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr(1);
          setLowPower(true);
        }}
        onIncline={() => setDpr((d) => Math.min(d + 0.25, Math.min(2, window.devicePixelRatio)))}
        flipflops={3}
        onFallback={() => setLowPower(true)}
      />
      <color attach="background" args={["#050a18"]} />
      <fog attach="fog" args={["#050a18", 260, 720]} />
      <hemisphereLight args={["#6f86d6", "#0a0f22", 2.4]} />
      <ambientLight intensity={0.35} color="#8fa4ff" />
      <directionalLight position={[-120, 200, 80]} intensity={1.6} color="#a9c0ff" />
      <directionalLight position={[140, 60, -60]} intensity={0.6} color="#ffb070" />

      <Ground snapshot={snapshot} layout={layout} />
      <Buildings buildings={snapshot.buildings} interactive={interactive} onHover={onHover} onSelect={onSelect} />
      <Traffic layout={layout} animate={animate} density={lowPower ? 0.5 : 1} />
      <Beacons buildings={snapshot.buildings} indicators={index.indicatorByBuilding} visible={visibleIndicators} animate={animate && !lowPower} />
      <ReadySignal onReady={onReady} />
      <ViewOffset right={inset?.right ?? 0} bottom={inset?.bottom ?? 0} />
      {labels && <LabelProjector anchors={labels.anchors} elements={labels.elements} />}
      {hovered && <Highlight building={hovered} tone="hover" />}
      {selected && <Highlight building={selected} tone="selected" />}

      <CameraRig buildings={snapshot.buildings} bounds={snapshot.bounds} interactive={interactive} animate={animate} commands={commands} />
    </Canvas>
  );
}
