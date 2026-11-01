"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Building, BuildingIndicator } from "@/lib/city/types";
import { INDICATOR_META } from "@/lib/city/queries";

export function roofTop(b: Building) {
  if (b.shape === "spire") return b.height + 6;
  if (b.shape === "cylinder") return b.height + 3.6;
  if (b.shape === "stepped") return b.height + 2.5;
  return b.height + 2.5;
}

/** Floating availability beacons above each building (instanced, one draw call). */
export function Beacons({
  buildings,
  indicators,
  visible,
  animate,
}: {
  buildings: Building[];
  indicators: Map<string, BuildingIndicator>;
  visible: Set<BuildingIndicator>;
  animate: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(
    () =>
      buildings
        .map((b) => ({ b, ind: indicators.get(b.id) ?? "occupied" }))
        .filter((x) => x.ind !== "occupied" && visible.has(x.ind)),
    [buildings, indicators, visible],
  );
  const geo = useMemo(() => new THREE.OctahedronGeometry(1, 0).scale(0.65, 1.1, 0.65), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) }), []);

  const write = (time: number) => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach(({ b }, i) => {
      const bob = animate ? Math.sin(time * 1.6 + i) * 0.5 : 0;
      tmp.p.set(b.position[0], roofTop(b) + 4 + bob, b.position[1]);
      tmp.q.setFromAxisAngle(tmp.up, animate ? time * 0.8 + i : 0);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      mesh.setMatrixAt(i, tmp.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const c = new THREE.Color();
    items.forEach(({ ind }, i) => mesh.setColorAt(i, c.set(INDICATOR_META[ind].color)));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    write(0);
    mesh.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useFrame(({ clock }) => {
    if (animate) write(clock.elapsedTime);
  });

  if (items.length === 0) return null;
  return <instancedMesh key={items.length} ref={ref} args={[geo, mat, items.length]} />;
}

/** Outline + ground ring around the hovered / selected building. */
export function Highlight({ building, tone }: { building: Building; tone: "selected" | "hover" }) {
  const top = roofTop(building);
  const geo = useMemo(() => {
    const [w, d] = building.footprint;
    const base =
      building.shape === "cylinder"
        ? new THREE.CylinderGeometry(w / 2 + 0.4, w / 2 + 0.4, top, 28)
        : new THREE.BoxGeometry(w + 0.8, top, d + 0.8);
    const edges = new THREE.EdgesGeometry(base, 30);
    base.dispose();
    return edges;
  }, [building, top]);
  const color = tone === "selected" ? "#38e1ff" : "#cfe9ff";
  return (
    <group position={[building.position[0], 0, building.position[1]]}>
      <lineSegments geometry={geo} position={[0, top / 2, 0]}>
        <lineBasicMaterial color={color} transparent opacity={tone === "selected" ? 0.95 : 0.5} toneMapped={false} />
      </lineSegments>
      {tone === "selected" && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.45, 0]}>
          <ringGeometry args={[Math.max(...building.footprint) * 0.75, Math.max(...building.footprint) * 0.75 + 0.6, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export interface LabelAnchor {
  id: string;
  position: [number, number, number];
}

/**
 * Projects world-space anchors to screen space and moves plain DOM labels
 * (rendered outside the canvas) every frame. Avoids one React root per label.
 */
export function LabelProjector({
  anchors,
  elements,
}: {
  anchors: LabelAnchor[];
  elements: RefObject<Map<string, HTMLElement>>;
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const a of anchors) {
      const el = elements.current?.get(a.id);
      if (!el) continue;
      v.set(a.position[0], a.position[1], a.position[2]).project(camera);
      const hidden = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      el.style.opacity = hidden ? "0" : "1";
      if (!hidden) {
        const x = ((v.x + 1) / 2) * size.width;
        const y = ((1 - v.y) / 2) * size.height;
        el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      }
    }
  });
  return null;
}
