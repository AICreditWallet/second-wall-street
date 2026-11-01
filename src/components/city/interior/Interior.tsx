"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { getLayout, type LayoutKind } from "@/lib/interior/layout";
import { textTexture } from "../scene/textures";
import { FurnitureItem } from "./Furniture";
import { displayTexture, skylineTexture, useInteriorKit, type InteriorKit } from "./kit";
import { People } from "./People";

export interface PodAgent {
  id: string;
  name: string;
  status: string;
}

export interface InteriorProps {
  kind: LayoutKind;
  accent: string;
  /** Large wall sign: organisation or building name. */
  title: string;
  subtitle?: string;
  /** Agents by workstation slot. */
  agents?: (PodAgent | undefined)[];
  selectedAgentId?: string | null;
  onSelectAgent?: (id: string | null) => void;
  /** Lobby: floor directory lines shown on the elevator screen. */
  directory?: string[];
  onElevator?: () => void;
  people: number;
  animate: boolean;
  shadows: boolean;
  showWorkflow?: boolean;
  seed?: number;
}

const WALL_H = 3.2;

/** Disposes a GPU resource when it is replaced or the component unmounts. */
function useDisposable<T extends { dispose(): void }>(value: T) {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

function Shell({ kit, width, depth, lobby, title, subtitle }: { kit: InteriorKit; width: number; depth: number; lobby: boolean; title: string; subtitle?: string }) {
  const sky = useDisposable(useMemo(() => skylineTexture(width * 7 + depth), [width, depth]));
  const sign = useDisposable(useMemo(() => textTexture(title, { height: 128, color: "#16203a" }).texture, [title]));
  const signAspect = useMemo(() => {
    const t = sign.image as HTMLCanvasElement;
    return t.width / t.height;
  }, [sign]);
  const sub = useDisposable(useMemo(() => textTexture(subtitle ?? "", { height: 64, color: "#5d6779" }).texture, [subtitle]));
  const subAspect = (sub.image as HTMLCanvasElement).width / (sub.image as HTMLCanvasElement).height;
  const skyMat = useMemo(() => new THREE.MeshBasicMaterial({ map: sky, toneMapped: false }), [sky]);
  const signMat = useMemo(() => new THREE.MeshBasicMaterial({ map: sign, transparent: true }), [sign]);
  const subMat = useMemo(() => new THREE.MeshBasicMaterial({ map: sub, transparent: true }), [sub]);
  useEffect(() => () => [skyMat, signMat, subMat].forEach((m) => m.dispose()), [skyMat, signMat, subMat]);

  const W = width;
  const D = depth;
  const signH = lobby ? 0.75 : 0.55;
  const windowWall = lobby ? "left" : "back";
  return (
    <group>
      {/* Floor slab with a visible cut edge, like an architectural cutaway. */}
      <mesh geometry={kit.geos.box} material={lobby ? kit.mats.floor : kit.mats.floorWood} position={[0, -0.05, 0]} scale={[W, 0.1, D]} receiveShadow />
      <mesh geometry={kit.geos.box} material={kit.mats.wallAccent} position={[0, -0.32, 0]} scale={[W + 0.2, 0.44, D + 0.2]} />
      {/* Back wall */}
      {windowWall === "back" ? (
        <group position={[0, 0, -D / 2]}>
          <mesh geometry={kit.geos.box} material={kit.mats.wall} position={[0, 0.45, 0]} scale={[W, 0.9, 0.2]} receiveShadow />
          <mesh geometry={kit.geos.plane} material={skyMat} position={[0, 1.85, 0.02]} scale={[W, 1.9, 1]} />
          <mesh geometry={kit.geos.box} material={kit.mats.wall} position={[0, 3.0, 0]} scale={[W, 0.4, 0.2]} />
          {Array.from({ length: Math.floor(W / 2) + 1 }, (_, i) => (
            <mesh key={i} geometry={kit.geos.box} material={kit.mats.frame} position={[-W / 2 + i * (W / Math.floor(W / 2)), 1.85, 0.08]} scale={[0.08, 1.9, 0.08]} />
          ))}
        </group>
      ) : (
        <mesh geometry={kit.geos.box} material={kit.mats.wall} position={[0, WALL_H / 2, -D / 2]} scale={[W, WALL_H, 0.2]} receiveShadow />
      )}
      {/* Left wall with the organisation sign */}
      {windowWall === "left" ? (
        <group position={[-W / 2, 0, 0]} rotation-y={Math.PI / 2}>
          <mesh geometry={kit.geos.box} material={kit.mats.wall} position={[0, 0.45, 0]} scale={[D, 0.9, 0.2]} />
          <mesh geometry={kit.geos.plane} material={skyMat} position={[0, 1.85, 0.11]} scale={[D, 1.9, 1]} />
          <mesh geometry={kit.geos.box} material={kit.mats.wall} position={[0, 3.0, 0]} scale={[D, 0.4, 0.2]} />
        </group>
      ) : (
        <mesh geometry={kit.geos.box} material={kit.mats.wall} position={[-W / 2, WALL_H / 2, 0]} scale={[0.2, WALL_H, D]} receiveShadow />
      )}
      {/* Sign: back wall in the lobby, left wall in offices */}
      {lobby ? (
        <group position={[0, 2.75, -D / 2 + 0.12]}>
          <mesh geometry={kit.geos.plane} material={signMat} scale={[signH * signAspect, signH, 1]} />
          <mesh geometry={kit.geos.box} material={kit.mats.accent} position={[0, -signH / 2 - 0.08, 0]} scale={[signH * signAspect * 0.6, 0.03, 0.02]} />
        </group>
      ) : (
        <group position={[-W / 2 + 0.12, 2.35, D / 2 - 3.2]} rotation-y={Math.PI / 2}>
          <mesh geometry={kit.geos.plane} material={signMat} scale={[signH * signAspect, signH, 1]} />
          {subtitle && <mesh geometry={kit.geos.plane} material={subMat} position={[0, -0.45, 0]} scale={[0.28 * subAspect, 0.28, 1]} />}
          <mesh geometry={kit.geos.box} material={kit.mats.accent} position={[0, -0.7, 0]} scale={[1.2, 0.03, 0.02]} />
        </group>
      )}
    </group>
  );
}

function Screen({ kit, x, y, z, rot, w, h, title, accent }: { kit: InteriorKit; x: number; y: number; z: number; rot: number; w: number; h: number; title: string; accent: string }) {
  const tex = useDisposable(useMemo(() => displayTexture(accent, title), [accent, title]));
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group position={[x, y, z]} rotation-y={rot}>
      <mesh geometry={kit.geos.box} material={kit.mats.dark} position={[0, 0, -0.03]} scale={[w + 0.12, h + 0.12, 0.05]} />
      <mesh geometry={kit.geos.plane} material={mat} scale={[w, h, 1]} />
    </group>
  );
}

function DirectoryBoard({ kit, x, y, z, w, h, lines, onClick }: { kit: InteriorKit; x: number; y: number; z: number; w: number; h: number; lines: string[]; onClick?: () => void }) {
  const key = lines.join("|");
  const tex = useDisposable(useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 640;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0b1426";
    g.fillRect(0, 0, 512, 640);
    g.fillStyle = "#8ff0ff";
    g.font = "600 30px ui-sans-serif, system-ui, sans-serif";
    g.fillText("Floor directory", 28, 52);
    g.font = "22px ui-sans-serif, system-ui, sans-serif";
    key.split("|").slice(0, 14).forEach((l, i) => {
      g.fillStyle = i % 2 ? "#c9d4ea" : "#e8eefc";
      g.fillText(l.slice(0, 34), 28, 100 + i * 38);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [key]));
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group position={[x, y, z]}>
      <mesh geometry={kit.geos.box} material={kit.mats.dark} position={[0, 0, -0.03]} scale={[w + 0.12, h + 0.12, 0.05]} />
      <mesh
        geometry={kit.geos.plane}
        material={mat}
        scale={[w, h, 1]}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      />
    </group>
  );
}

function Elevator({ kit, x, z, onClick }: { kit: InteriorKit; x: number; z: number; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh geometry={kit.geos.box} material={kit.mats.dark} position={[0, 1.3, 0]} scale={[1.9, 2.6, 0.1]} />
      <mesh geometry={kit.geos.box} material={kit.mats.elevator} position={[-0.42, 1.2, 0.07]} scale={[0.82, 2.3, 0.04]} />
      <mesh geometry={kit.geos.box} material={kit.mats.elevator} position={[0.42, 1.2, 0.07]} scale={[0.82, 2.3, 0.04]} />
      <mesh geometry={kit.geos.box} material={hover ? kit.mats.accent : kit.mats.frame} position={[0, 2.5, 0.09]} scale={[0.5, 0.12, 0.02]} />
      <mesh geometry={kit.geos.box} material={kit.mats.accent} position={[1.05, 1.15, 0.08]} scale={[0.08, 0.16, 0.02]} />
    </group>
  );
}

function Pod({
  kit,
  x,
  z,
  rot,
  agent,
  selected,
  animate,
  onSelect,
}: {
  kit: InteriorKit;
  x: number;
  z: number;
  rot: number;
  agent?: PodAgent;
  selected: boolean;
  animate: boolean;
  onSelect?: (id: string | null) => void;
}) {
  const core = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const name = agent?.name;
  const label = useDisposable(
    useMemo(
      () => textTexture(name ?? "Open workstation", { height: 72, color: name ? "#ffffff" : "#c9d4ea", background: name ? "rgba(11,20,38,0.88)" : "rgba(40,48,66,0.7)" }).texture,
      [name],
    ),
  );
  const labelMat = useMemo(() => new THREE.SpriteMaterial({ map: label, depthTest: false, toneMapped: false }), [label]);
  useEffect(() => () => labelMat.dispose(), [labelMat]);
  const aspect = (label.image as HTMLCanvasElement).width / (label.image as HTMLCanvasElement).height;

  useFrame(({ clock }) => {
    if (!core.current) return;
    const t = animate ? clock.elapsedTime : 0;
    core.current.rotation.y = t * 0.8;
    core.current.position.y = 1.75 + Math.sin(t * 1.6 + x) * 0.05;
  });

  const active = Boolean(agent);
  return (
    <group
      position={[x, 0, z]}
      rotation-y={rot}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(agent?.id ?? null);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh geometry={kit.geos.disc} material={active ? kit.mats.accentSoft : kit.mats.idle} position={[0, 0.012, 0]} />
      <mesh geometry={kit.geos.ring} material={active ? kit.mats.accent : kit.mats.frame} position={[0, 0.02, 0]} scale={selected || hover ? 1.12 : 1} />
      {/* Curved console */}
      <mesh geometry={kit.geos.box} material={kit.mats.counter} position={[0, 0.45, -0.25]} scale={[1.3, 0.9, 0.55]} castShadow />
      <mesh geometry={kit.geos.box} material={active ? kit.mats.accent : kit.mats.frame} position={[0, 0.91, 0.03]} scale={[1.3, 0.02, 0.02]} />
      {[-0.36, 0.36].map((sx) => (
        <group key={sx} position={[sx, 1.25, -0.4]} rotation-y={-sx * 0.6}>
          <mesh geometry={kit.geos.box} material={kit.mats.dark} scale={[0.62, 0.4, 0.03]} />
          <mesh geometry={kit.geos.plane} material={active ? kit.mats.screen : kit.mats.dark} position={[0, 0, 0.017]} scale={[0.58, 0.36, 1]} />
        </group>
      ))}
      {active && <mesh ref={core} geometry={kit.geos.core} material={kit.mats.holo} position={[0, 1.75, 0]} />}
      <sprite material={labelMat} position={[0, 2.35, 0]} scale={[0.32 * aspect, 0.32, 1]} />
      {(selected || hover) && <mesh geometry={kit.geos.ring} material={kit.mats.accent} position={[0, 0.03, 0]} scale={1.35} />}
    </group>
  );
}

/** Animated pulses between agent workstations — only used as a labelled demonstration. */
function Workflow({ points, accent }: { points: THREE.Vector3[]; accent: string }) {
  const curves = useMemo(
    () =>
      points.slice(1).map((p, i) => {
        const a = points[i]!;
        const mid = a.clone().lerp(p, 0.5).setY(3.2);
        return new THREE.QuadraticBezierCurve3(a.clone().setY(1.8), mid, p.clone().setY(1.8));
      }),
    [points],
  );
  const tubes = useMemo(() => curves.map((c) => new THREE.TubeGeometry(c, 32, 0.02, 6)), [curves]);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.5, toneMapped: false }), [accent]);
  const dot = useMemo(() => new THREE.SphereGeometry(0.09, 12, 8), []);
  const dotMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }), []);
  useEffect(() => () => [...tubes, dot].forEach((g) => g.dispose()), [tubes, dot]);
  useEffect(() => () => [mat, dotMat].forEach((m) => m.dispose()), [mat, dotMat]);
  const dots = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.35;
    curves.forEach((c, i) => {
      const m = dots.current[i];
      if (!m) return;
      const local = (t - i * 0.5) % (curves.length * 0.5);
      m.visible = local >= 0 && local < 1;
      if (m.visible) m.position.copy(c.getPoint(Math.min(1, local)));
    });
  });
  return (
    <group>
      {tubes.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} />
      ))}
      {curves.map((_, i) => (
        <mesh key={i} ref={(el) => void (dots.current[i] = el)} geometry={dot} material={dotMat} />
      ))}
    </group>
  );
}

function InteriorCamera({ width, depth }: { width: number; depth: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const goal = useRef<THREE.Vector3 | null>(null);
  const span = Math.max(width, depth);

  useEffect(() => {
    camera.position.set(width * 0.62, span * 0.82, depth * 1.12);
    camera.lookAt(0, 0.8, 0);
    controls.current?.target.set(0, 0.8, 0);
    controls.current?.update();
  }, [camera, width, depth, span]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    if (goal.current) {
      const k = 1 - Math.exp(-delta * 4);
      const before = c.target.clone();
      c.target.lerp(goal.current, k);
      camera.position.add(c.target.clone().sub(before));
      if (c.target.distanceTo(goal.current) < 0.02) goal.current = null;
    }
    c.target.x = THREE.MathUtils.clamp(c.target.x, -width / 2, width / 2);
    c.target.z = THREE.MathUtils.clamp(c.target.z, -depth / 2, depth / 2);
    c.target.y = 0.8;
    c.update();
  });

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={3}
        maxDistance={span * 1.6}
        minPolarAngle={0.25}
        maxPolarAngle={1.32}
        screenSpacePanning={false}
      />
      {/* Click the floor to move the view there. */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.005, 0]}
        visible={false}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 6) return;
          goal.current = new THREE.Vector3(e.point.x, 0.8, e.point.z);
        }}
      >
        <planeGeometry args={[width, depth]} />
      </mesh>
    </>
  );
}

export default function Interior({
  kind,
  accent,
  title,
  subtitle,
  agents = [],
  selectedAgentId,
  onSelectAgent,
  directory,
  onElevator,
  people,
  animate,
  shadows,
  showWorkflow,
  seed = 1,
}: InteriorProps) {
  const layout = getLayout(kind);
  const kit = useInteriorKit(accent);
  const lobby = kind === "lobby";

  const podPoints = useMemo(
    () =>
      layout.items
        .filter((i): i is Extract<typeof i, { kind: "pod" }> => i.kind === "pod" && Boolean(agents[i.slot]))
        .map((p) => new THREE.Vector3(p.x, 0, p.z)),
    [layout, agents],
  );

  return (
    <group>
      <color attach="background" args={["#dfe5ee"]} />
      <hemisphereLight args={["#ffffff", "#b9c3d4", 1.5]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[layout.width * 0.4, 12, layout.depth * 0.6]}
        intensity={1.7}
        color="#fff4e6"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-layout.width / 2 - 2}
        shadow-camera-right={layout.width / 2 + 2}
        shadow-camera-top={layout.depth / 2 + 2}
        shadow-camera-bottom={-layout.depth / 2 - 2}
        shadow-bias={-0.0005}
      />
      <pointLight position={[0, 2.8, 0]} intensity={8} distance={14} color="#ffe2b8" />

      <Shell kit={kit} width={layout.width} depth={layout.depth} lobby={lobby} title={title} subtitle={subtitle} />

      {layout.items.map((item, i) => {
        if (item.kind === "pod") {
          return (
            <Pod
              key={i}
              kit={kit}
              x={item.x}
              z={item.z}
              rot={item.rot}
              agent={agents[item.slot]}
              selected={Boolean(selectedAgentId) && agents[item.slot]?.id === selectedAgentId}
              animate={animate}
              onSelect={onSelectAgent}
            />
          );
        }
        if (item.kind === "screen") {
          return lobby && directory ? (
            <DirectoryBoard key={i} kit={kit} x={item.x} y={item.y} z={item.z} w={item.w} h={item.h} lines={directory} onClick={onElevator} />
          ) : (
            <Screen key={i} kit={kit} {...item} title={title} accent={accent} />
          );
        }
        if (item.kind === "elevator") return <Elevator key={i} kit={kit} x={item.x} z={item.z} onClick={onElevator} />;
        return <FurnitureItem key={i} kit={kit} item={item} />;
      })}

      {people > 0 && <People layout={layout} count={people} animate={animate} seed={seed} />}
      {showWorkflow && podPoints.length >= 2 && <Workflow points={podPoints.slice(0, 4)} accent={accent} />}

      <InteriorCamera width={layout.width} depth={layout.depth} />
    </group>
  );
}
