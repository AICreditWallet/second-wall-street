"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
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
  useEffect(() => () => geo.dispose(), [geo]);
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
  kind: "district" | "building";
  /** Higher wins when labels overlap. */
  priority: number;
  /** Building this label belongs to (ignored for its own occlusion test). */
  buildingId?: string;
  /** Always shown (flagships, occupied buildings). */
  pinned?: boolean;
}

export interface LabelFocus {
  hoveredId: string | null;
  selectedId: string | null;
  hidden: boolean;
  /** Building view: only the selected building keeps its label. */
  isolate: boolean;
}

const ray = new THREE.Ray();
const box = new THREE.Box3();
const hit = new THREE.Vector3();

/**
 * Projects anchors to screen space and positions plain DOM labels (rendered
 * outside the canvas). Handles zoom-based visibility, occlusion by buildings
 * and overlap: higher-priority labels win, the rest are hidden.
 */
export function LabelProjector({
  anchors,
  elements,
  buildings,
  focus,
}: {
  anchors: LabelAnchor[];
  elements: RefObject<Map<string, HTMLElement>>;
  buildings: Building[];
  focus: RefObject<LabelFocus>;
}) {
  const v = useMemo(() => new THREE.Vector3(), []);
  const boxes = useMemo(
    () =>
      buildings.map((b) => ({
        id: b.id,
        box: new THREE.Box3(
          new THREE.Vector3(b.position[0] - b.footprint[0] / 2, 0, b.position[1] - b.footprint[1] / 2),
          new THREE.Vector3(b.position[0] + b.footprint[0] / 2, roofTop(b), b.position[1] + b.footprint[1] / 2),
        ),
      })),
    [buildings],
  );
  const frame = useRef(0);

  useFrame(({ camera, size, controls }) => {
    // Re-layout every other frame; positions in between follow the camera smoothly enough.
    frame.current++;
    const f = focus.current;
    const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    const dist = target ? camera.position.distanceTo(target) : 300;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const items: { a: LabelAnchor; el: HTMLElement; x: number; y: number; pr: number; d: number }[] = [];

    for (const a of anchors) {
      const el = elements.current?.get(a.id);
      if (!el) continue;
      const isFocus = a.buildingId && (a.buildingId === f?.selectedId || a.buildingId === f?.hoveredId);
      let show = !f?.hidden && (!f?.isolate || a.buildingId === f.selectedId);
      if (a.kind === "district") show &&= dist > 230; // zoomed in: street names take over
      else if (!isFocus && !a.pinned) show &&= dist < 170 && Boolean(target) && Math.hypot(a.position[0] - target!.x, a.position[2] - target!.z) < 110;
      if (!show) {
        el.style.opacity = "0";
        continue;
      }
      v.set(a.position[0], a.position[1], a.position[2]).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) {
        el.style.opacity = "0";
        continue;
      }
      const d = camera.position.distanceTo(new THREE.Vector3(...a.position));
      items.push({ a, el, x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, pr: (isFocus ? 1000 : 0) + a.priority - d * 0.01, d });
    }

    items.sort((p, q) => q.pr - p.pr);
    for (const it of items) {
      // Occlusion: hide building labels sitting behind other buildings.
      if (it.a.kind === "building" && frame.current % 2 === 0) {
        ray.origin.copy(camera.position);
        ray.direction.set(it.a.position[0], it.a.position[1], it.a.position[2]).sub(camera.position).normalize();
        let blocked = false;
        for (const b of boxes) {
          if (b.id === it.a.buildingId) continue;
          box.copy(b.box);
          if (ray.intersectBox(box, hit) && hit.distanceTo(camera.position) < it.d - 2) {
            blocked = true;
            break;
          }
        }
        it.el.dataset.occluded = blocked ? "1" : "";
      }
      const occluded = it.el.dataset.occluded === "1";
      const w = it.el.offsetWidth || 80;
      const h = it.el.offsetHeight || 20;
      const rect = { x0: it.x - w / 2 - 4, y0: it.y - h / 2 - 2, x1: it.x + w / 2 + 4, y1: it.y + h / 2 + 2 };
      const overlaps = placed.some((p) => rect.x0 < p.x1 && rect.x1 > p.x0 && rect.y0 < p.y1 && rect.y1 > p.y0);
      const isFocus = it.pr >= 1000;
      if ((overlaps || occluded) && !isFocus) {
        it.el.style.opacity = "0";
        continue;
      }
      placed.push(rect);
      it.el.style.opacity = "1";
      it.el.dataset.focus = isFocus ? "1" : "";
      it.el.style.transform = `translate(-50%, -50%) translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
    }
  });
  return null;
}

/**
 * Light beam and expanding ring over buildings whose agents ran in the latest
 * session. Driven by real run records (CityActivity), never decoration; at most
 * a handful of meshes, so it stays cheap on mobile GPUs.
 */
export function ActivityBeams({ buildings, animate }: { buildings: Building[]; animate: boolean }) {
  const beamGeo = useMemo(() => new THREE.CylinderGeometry(0.9, 2.4, 1, 20, 1, true).translate(0, 0.5, 0), []);
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), []);
  const beamMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#38e1ff", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    [],
  );
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#8ff0ff", transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), []);
  useEffect(() => () => [beamGeo, ringGeo, beamMat, ringMat].forEach((x) => x.dispose()), [beamGeo, ringGeo, beamMat, ringMat]);
  const rings = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = animate ? clock.elapsedTime : 0.5;
    const phase = (t * 0.45) % 1;
    rings.current.forEach((m, i) => {
      if (!m) return;
      const b = buildings[i]!;
      const r = Math.max(b.footprint[0], b.footprint[1]) * (0.7 + phase * 1.6);
      m.scale.set(r, 1, r);
    });
    ringMat.opacity = animate ? 0.85 * (1 - phase) : 0.6;
    beamMat.opacity = animate ? 0.16 + Math.sin(t * 2) * 0.06 : 0.2;
  });

  return (
    <group>
      {buildings.map((b, i) => {
        const top = roofTop(b);
        return (
          <group key={b.id} position={[b.position[0], 0, b.position[1]]}>
            <mesh geometry={beamGeo} material={beamMat} position={[0, top, 0]} scale={[1, 70, 1]} renderOrder={2} />
            <mesh ref={(el) => void (rings.current[i] = el)} geometry={ringGeo} material={ringMat} position={[0, top + 0.3, 0]} renderOrder={2} />
          </group>
        );
      })}
    </group>
  );
}
