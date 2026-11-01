"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mulberry32 } from "@/lib/city/generator";
import type { StreetLayout } from "./layout";

const CAR_COLORS = ["#f2c14e", "#f2c14e", "#e8ecf5", "#c0392b", "#2f6fdc", "#1c2333", "#9aa3b5", "#2fbf8f"];

interface Car {
  axis: "x" | "z";
  lane: number; // fixed coordinate on the other axis
  dir: 1 | -1;
  t: number;
  speed: number;
}

interface Walker {
  axis: "x" | "z";
  line: number;
  min: number;
  max: number;
  t: number;
  speed: number;
}

/** Instanced cars and pedestrians. Static when `animate` is false (reduced motion / hidden). */
export function Traffic({ layout, animate, density = 1 }: { layout: StreetLayout; animate: boolean; density?: number }) {
  const { extent, roadsX, roadsZ, blockCenters, block } = layout;

  const { cars, walkers } = useMemo(() => {
    const rand = mulberry32(4242);
    const cars: Car[] = [];
    const count = Math.round(70 * density);
    for (let i = 0; i < count; i++) {
      const vertical = rand() < 0.5;
      const roads = vertical ? roadsX : roadsZ;
      const road = roads[Math.floor(rand() * roads.length)]!;
      const dir = rand() < 0.5 ? 1 : -1;
      cars.push({
        axis: vertical ? "z" : "x",
        lane: road + dir * 1.7,
        dir,
        t: rand(),
        speed: 6 + rand() * 6,
      });
    }
    const walkers: Walker[] = [];
    const wcount = Math.round(110 * density);
    for (let i = 0; i < wcount; i++) {
      const [cx, cz] = blockCenters[Math.floor(rand() * blockCenters.length)]!;
      const side = Math.floor(rand() * 4);
      const half = block / 2 - 0.5;
      const alongX = side < 2;
      walkers.push({
        axis: alongX ? "x" : "z",
        line: alongX ? cz + (side === 0 ? -half : half) : cx + (side === 2 ? -half : half),
        min: (alongX ? cx : cz) - half,
        max: (alongX ? cx : cz) + half,
        t: rand(),
        speed: (0.6 + rand() * 0.6) * (rand() < 0.5 ? 1 : -1),
      });
    }
    return { cars, walkers };
  }, [roadsX, roadsZ, blockCenters, block, density]);

  const geos = useMemo(
    () => ({
      body: new THREE.BoxGeometry(1.7, 0.75, 3.4).translate(0, 0.55, 0),
      cabin: new THREE.BoxGeometry(1.4, 0.55, 1.8).translate(0, 1.2, -0.2),
      head: new THREE.BoxGeometry(1.5, 0.22, 0.08).translate(0, 0.6, 1.72),
      tail: new THREE.BoxGeometry(1.5, 0.2, 0.08).translate(0, 0.65, -1.72),
      walker: new THREE.CapsuleGeometry(0.22, 0.7, 2, 6).translate(0, 0.95, 0),
    }),
    [],
  );
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.4 }),
      cabin: new THREE.MeshStandardMaterial({ color: "#0d1526", roughness: 0.2, metalness: 0.6 }),
      head: new THREE.MeshBasicMaterial({ color: "#fff6dc", toneMapped: false }),
      tail: new THREE.MeshBasicMaterial({ color: "#ff3b4a", toneMapped: false }),
      walker: new THREE.MeshStandardMaterial({ roughness: 0.8 }),
    }),
    [],
  );

  const refs = {
    body: useRef<THREE.InstancedMesh>(null),
    cabin: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    tail: useRef<THREE.InstancedMesh>(null),
    walker: useRef<THREE.InstancedMesh>(null),
  };

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) }), []);

  const write = (dt: number) => {
    const span = { x: [extent.minX - 20, extent.maxX + 2] as const, z: [extent.minZ - 20, extent.maxZ + 20] as const };
    cars.forEach((car, i) => {
      const [lo, hi] = span[car.axis];
      const len = hi - lo;
      car.t = (car.t + (car.dir * car.speed * dt) / len + 1) % 1;
      const along = lo + car.t * len;
      if (car.axis === "z") tmp.p.set(car.lane, 0, along);
      else tmp.p.set(along, 0, car.lane);
      const angle = car.axis === "z" ? (car.dir === 1 ? 0 : Math.PI) : car.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      tmp.q.setFromAxisAngle(tmp.up, angle);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      for (const key of ["body", "cabin", "head", "tail"] as const) refs[key].current?.setMatrixAt(i, tmp.m);
    });
    walkers.forEach((w, i) => {
      const range = w.max - w.min;
      w.t += (w.speed * dt) / range;
      if (w.t > 1 || w.t < 0) {
        w.speed *= -1;
        w.t = Math.min(1, Math.max(0, w.t));
      }
      const along = w.min + w.t * range;
      if (w.axis === "x") tmp.p.set(along, 0.35, w.line);
      else tmp.p.set(w.line, 0.35, along);
      tmp.q.identity();
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      refs.walker.current?.setMatrixAt(i, tmp.m);
    });
    for (const r of Object.values(refs)) if (r.current) r.current.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const col = new THREE.Color();
    const rand = mulberry32(17);
    cars.forEach((_, i) => refs.body.current?.setColorAt(i, col.set(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]!)));
    walkers.forEach((_, i) => refs.walker.current?.setColorAt(i, col.setHSL(rand(), 0.35, 0.55)));
    if (refs.body.current?.instanceColor) refs.body.current.instanceColor.needsUpdate = true;
    if (refs.walker.current?.instanceColor) refs.walker.current.instanceColor.needsUpdate = true;
    write(0);
    for (const r of Object.values(refs)) r.current?.computeBoundingSphere();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars, walkers]);

  useFrame((_, delta) => {
    if (animate) write(Math.min(delta, 0.1));
  });

  return (
    <group>
      <instancedMesh ref={refs.body} args={[geos.body, mats.body, cars.length]} frustumCulled={false} />
      <instancedMesh ref={refs.cabin} args={[geos.cabin, mats.cabin, cars.length]} frustumCulled={false} />
      <instancedMesh ref={refs.head} args={[geos.head, mats.head, cars.length]} frustumCulled={false} />
      <instancedMesh ref={refs.tail} args={[geos.tail, mats.tail, cars.length]} frustumCulled={false} />
      <instancedMesh ref={refs.walker} args={[geos.walker, mats.walker, walkers.length]} frustumCulled={false} />
    </group>
  );
}
