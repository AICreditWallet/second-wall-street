"use client";

import type { ReactNode } from "react";
import * as THREE from "three";
import type { Item } from "@/lib/interior/layout";
import type { InteriorKit } from "./kit";

type V3 = [number, number, number];

function Box({ kit, mat, p, s, r }: { kit: InteriorKit; mat: THREE.Material; p: V3; s: V3; r?: V3 }) {
  return <mesh geometry={kit.geos.box} material={mat} position={p} scale={s} rotation={r} castShadow receiveShadow />;
}

function Group({ x, z, rot = 0, y = 0, children }: { x: number; z: number; rot?: number; y?: number; children: ReactNode }) {
  return (
    <group position={[x, y, z]} rotation-y={rot}>
      {children}
    </group>
  );
}

function Chair({ kit, z = 0.62, facing = Math.PI }: { kit: InteriorKit; z?: number; facing?: number }) {
  return (
    <group position={[0, 0, z]} rotation-y={facing}>
      <Box kit={kit} mat={kit.mats.chair} p={[0, 0.46, 0]} s={[0.5, 0.08, 0.48]} />
      <Box kit={kit} mat={kit.mats.chair} p={[0, 0.78, -0.23]} s={[0.48, 0.56, 0.06]} />
      <mesh geometry={kit.geos.cyl} material={kit.mats.metal} position={[0, 0.22, 0]} scale={[0.06, 0.44, 0.06]} />
      <mesh geometry={kit.geos.cyl} material={kit.mats.metal} position={[0, 0.03, 0]} scale={[0.5, 0.04, 0.5]} />
    </group>
  );
}

function Monitor({ kit, x }: { kit: InteriorKit; x: number }) {
  return (
    <group position={[x, 0.76, -0.22]}>
      <Box kit={kit} mat={kit.mats.dark} p={[0, 0.3, 0]} s={[0.56, 0.34, 0.03]} />
      <mesh geometry={kit.geos.plane} material={kit.mats.screen} position={[0, 0.3, 0.017]} scale={[0.52, 0.3, 1]} />
      <Box kit={kit} mat={kit.mats.metal} p={[0, 0.08, -0.02]} s={[0.05, 0.16, 0.05]} />
    </group>
  );
}

export function Desk({ kit, monitors }: { kit: InteriorKit; monitors: number }) {
  const xs = monitors === 3 ? [-0.55, 0, 0.55] : monitors === 2 ? [-0.3, 0.3] : [0];
  return (
    <>
      <Box kit={kit} mat={kit.mats.deskTop} p={[0, 0.74, 0]} s={[1.6, 0.05, 0.8]} />
      {[-0.74, 0.74].map((x) => (
        <Box key={x} kit={kit} mat={kit.mats.metal} p={[x, 0.36, 0]} s={[0.05, 0.72, 0.7]} />
      ))}
      {xs.map((x) => (
        <Monitor key={x} kit={kit} x={x} />
      ))}
      <Box kit={kit} mat={kit.mats.dark} p={[0, 0.775, 0.12]} s={[0.42, 0.02, 0.14]} />
      <Chair kit={kit} />
    </>
  );
}

function Table({ kit, w, d }: { kit: InteriorKit; w: number; d: number }) {
  return (
    <>
      <Box kit={kit} mat={kit.mats.deskWood} p={[0, 0.74, 0]} s={[w, 0.06, d]} />
      <Box kit={kit} mat={kit.mats.metal} p={[0, 0.36, 0]} s={[0.12, 0.72, d * 0.5]} />
    </>
  );
}

function GlassRoom({ kit, w, d, door }: { kit: InteriorKit; w: number; d: number; door: "left" | "right" | "front" }) {
  const h = 2.6;
  const panes: { p: V3; s: V3; r?: V3 }[] = [];
  const add = (cx: number, cz: number, len: number, alongX: boolean) =>
    panes.push({ p: [cx, h / 2, cz], s: [len, h, 1], r: alongX ? undefined : [0, Math.PI / 2, 0] });
  const gap = 1.2;
  add(0, -d / 2, w, true);
  const sides: { key: "left" | "right" | "front"; x: number; z: number; len: number; alongX: boolean }[] = [
    { key: "left", x: -w / 2, z: 0, len: d, alongX: false },
    { key: "right", x: w / 2, z: 0, len: d, alongX: false },
    { key: "front", x: 0, z: d / 2, len: w, alongX: true },
  ];
  for (const s of sides) {
    if (s.key !== door) {
      add(s.x, s.z, s.len, s.alongX);
      continue;
    }
    const seg = (s.len - gap) / 2;
    if (s.alongX) {
      add(-s.len / 2 + seg / 2, s.z, seg, true);
      add(s.len / 2 - seg / 2, s.z, seg, true);
    } else {
      add(s.x, -s.len / 2 + seg / 2, seg, false);
      add(s.x, s.len / 2 - seg / 2, seg, false);
    }
  }
  return (
    <>
      {panes.map((p, i) => (
        <group key={i} position={p.p} rotation={p.r}>
          <mesh geometry={kit.geos.plane} material={kit.mats.glass} scale={[p.s[0], p.s[1], 1]} renderOrder={2} />
          <mesh geometry={kit.geos.box} material={kit.mats.frame} position={[0, h / 2 - 0.03, 0]} scale={[p.s[0], 0.06, 0.06]} />
          <mesh geometry={kit.geos.box} material={kit.mats.frame} position={[0, -h / 2 + 0.03, 0]} scale={[p.s[0], 0.06, 0.06]} />
        </group>
      ))}
    </>
  );
}

function Sofa({ kit }: { kit: InteriorKit }) {
  return (
    <>
      <Box kit={kit} mat={kit.mats.fabric} p={[0, 0.25, 0]} s={[2.2, 0.4, 0.9]} />
      <Box kit={kit} mat={kit.mats.fabric} p={[0, 0.62, -0.36]} s={[2.2, 0.56, 0.2]} />
      <Box kit={kit} mat={kit.mats.fabric} p={[-1.02, 0.48, 0]} s={[0.18, 0.36, 0.9]} />
      <Box kit={kit} mat={kit.mats.fabric} p={[1.02, 0.48, 0]} s={[0.18, 0.36, 0.9]} />
    </>
  );
}

function Plant({ kit, scale }: { kit: InteriorKit; scale: number }) {
  return (
    <group scale={scale}>
      <mesh geometry={kit.geos.cone} material={kit.mats.pot} position={[0, 0.25, 0]} scale={[0.5, 0.5, 0.5]} castShadow />
      <mesh geometry={kit.geos.leaf} material={kit.mats.leaf} position={[0, 0.85, 0]} scale={[0.75, 0.9, 0.75]} castShadow />
      <mesh geometry={kit.geos.leaf} material={kit.mats.leaf} position={[0.18, 1.2, 0.05]} scale={[0.45, 0.6, 0.45]} castShadow />
    </group>
  );
}

function Kitchen({ kit }: { kit: InteriorKit }) {
  return (
    <>
      <Box kit={kit} mat={kit.mats.counter} p={[0, 0.5, 0]} s={[3, 1, 0.8]} />
      <Box kit={kit} mat={kit.mats.dark} p={[-0.9, 1.06, -0.15]} s={[0.35, 0.12, 0.3]} />
      {[-1, 0, 1].map((x) => (
        <group key={x} position={[x, 0, 0.75]}>
          <mesh geometry={kit.geos.cyl} material={kit.mats.dark} position={[0, 0.72, 0]} scale={[0.36, 0.06, 0.36]} />
          <mesh geometry={kit.geos.cyl} material={kit.mats.metal} position={[0, 0.36, 0]} scale={[0.05, 0.72, 0.05]} />
        </group>
      ))}
    </>
  );
}

function Reception({ kit }: { kit: InteriorKit }) {
  return (
    <>
      <Box kit={kit} mat={kit.mats.counter} p={[0, 0.55, 0]} s={[3.2, 1.1, 1]} />
      <Box kit={kit} mat={kit.mats.accent} p={[0, 0.9, 0.51]} s={[3.0, 0.04, 0.02]} />
      <Monitor kit={kit} x={0.6} />
      <Chair kit={kit} z={-0.9} facing={0} />
    </>
  );
}

export function FurnitureItem({ kit, item }: { kit: InteriorKit; item: Item }) {
  switch (item.kind) {
    case "desk":
      return (
        <Group x={item.x} z={item.z} rot={item.rot}>
          <Desk kit={kit} monitors={item.monitors} />
        </Group>
      );
    case "table":
      return (
        <Group x={item.x} z={item.z}>
          <Table kit={kit} w={item.w} d={item.d} />
        </Group>
      );
    case "glassRoom":
      return (
        <Group x={item.x} z={item.z}>
          <GlassRoom kit={kit} w={item.w} d={item.d} door={item.door} />
        </Group>
      );
    case "sofa":
      return (
        <Group x={item.x} z={item.z} rot={item.rot}>
          <Sofa kit={kit} />
        </Group>
      );
    case "plant":
      return (
        <Group x={item.x} z={item.z}>
          <Plant kit={kit} scale={item.scale} />
        </Group>
      );
    case "kitchen":
      return (
        <Group x={item.x} z={item.z} rot={item.rot}>
          <Kitchen kit={kit} />
        </Group>
      );
    case "reception":
      return (
        <Group x={item.x} z={item.z} rot={item.rot}>
          <Reception kit={kit} />
        </Group>
      );
    case "rug":
      return (
        <mesh geometry={kit.geos.box} material={kit.mats.rug} position={[item.x, 0.01, item.z]} scale={[item.w, 0.02, item.d]} receiveShadow />
      );
    default:
      return null;
  }
}
