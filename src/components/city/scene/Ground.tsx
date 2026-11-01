"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CitySnapshot } from "@/lib/city/types";
import { mulberry32 } from "@/lib/city/generator";
import { glowTexture } from "./textures";
import type { StreetLayout } from "./layout";

type Placement = { x: number; y: number; z: number; sx?: number; sy?: number; sz?: number; ry?: number; color?: string };

/** Static instanced mesh: matrices are written once. */
function Instances({
  items,
  geometry,
  material,
}: {
  items: Placement[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    items.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.ry ?? 0, 0));
      m.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1));
      mesh.setMatrixAt(i, m);
      if (it.color) mesh.setColorAt(i, col.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} frustumCulled />;
}

export function Ground({ snapshot, layout }: { snapshot: CitySnapshot; layout: StreetLayout }) {
  const { extent, roadsX, roadsZ, block, street } = layout;
  const parkKeys = useMemo(() => new Set(snapshot.parks.map((p) => `${p.position[0]},${p.position[1]}`)), [snapshot.parks]);

  const mats = useMemo(
    () => ({
      asphalt: new THREE.MeshStandardMaterial({ color: "#0a1120", roughness: 0.95 }),
      sidewalk: new THREE.MeshStandardMaterial({ color: "#1a2438", roughness: 0.9 }),
      grass: new THREE.MeshStandardMaterial({ color: "#123a2a", roughness: 1 }),
      path: new THREE.MeshStandardMaterial({ color: "#2a3448", roughness: 0.9 }),
      marking: new THREE.MeshBasicMaterial({ color: "#8a7a4a", toneMapped: false }),
      crosswalk: new THREE.MeshBasicMaterial({ color: "#4a5570", toneMapped: false }),
      trunk: new THREE.MeshStandardMaterial({ color: "#3a2a20" }),
      crown: new THREE.MeshStandardMaterial({ color: "#1f6a44", roughness: 0.8 }),
      water: new THREE.MeshStandardMaterial({ color: "#061a30", roughness: 0.2, metalness: 0.7, emissive: "#03101f" }),
      pier: new THREE.MeshStandardMaterial({ color: "#2a3346", roughness: 0.9 }),
      post: new THREE.MeshStandardMaterial({ color: "#1b2233", metalness: 0.5, roughness: 0.5 }),
      bulb: new THREE.MeshBasicMaterial({ color: "#ffd9a0", toneMapped: false }),
      pool: new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: "#ffae55",
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      glint: new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: "#38e1ff",
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    }),
    [],
  );

  const geos = useMemo(
    () => ({
      slab: new THREE.BoxGeometry(1, 1, 1),
      flat: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      trunk: new THREE.CylinderGeometry(0.15, 0.2, 1.4, 5).translate(0, 0.7, 0),
      crown: new THREE.IcosahedronGeometry(1.3, 0).translate(0, 2.3, 0),
      post: new THREE.CylinderGeometry(0.09, 0.12, 3.4, 5).translate(0, 1.7, 0),
      bulb: new THREE.SphereGeometry(0.28, 6, 4).translate(0, 3.45, 0),
    }),
    [],
  );

  const data = useMemo(() => {
    const rand = mulberry32(911);
    const slabs: Placement[] = [];
    const grass: Placement[] = [];
    const paths: Placement[] = [];
    const trees: Placement[] = [];
    const markings: Placement[] = [];
    const crosswalks: Placement[] = [];
    const lamps: Placement[] = [];

    for (const [cx, cz] of layout.blockCenters) {
      slabs.push({ x: cx, y: 0.175, z: cz, sx: block, sy: 0.35, sz: block });
      const isPark = parkKeys.has(`${cx},${cz}`);
      if (isPark) {
        grass.push({ x: cx, y: 0.36, z: cz, sx: block - 3, sy: 1, sz: block - 3 });
        paths.push({ x: cx, y: 0.37, z: cz, sx: block - 3, sy: 1, sz: 1.6 });
        paths.push({ x: cx, y: 0.37, z: cz, sx: 1.6, sy: 1, sz: block - 3 });
        for (let i = 0; i < 22; i++) {
          const tx = cx + (rand() - 0.5) * (block - 5);
          const tz = cz + (rand() - 0.5) * (block - 5);
          if (Math.abs(tx - cx) < 1.6 || Math.abs(tz - cz) < 1.6) continue;
          const s = 0.8 + rand() * 0.6;
          trees.push({ x: tx, y: 0.35, z: tz, sx: s, sy: s, sz: s, ry: rand() * 6 });
        }
      }
      // Street lamps around each block edge.
      const half = block / 2 - 0.7;
      for (const t of [-0.66, 0, 0.66]) {
        const o = t * half;
        lamps.push({ x: cx + o, y: 0.35, z: cz - half }, { x: cx + o, y: 0.35, z: cz + half });
        lamps.push({ x: cx - half, y: 0.35, z: cz + o }, { x: cx + half, y: 0.35, z: cz + o });
      }
    }

    // Dashed centre lines.
    const zLen = extent.maxZ - extent.minZ;
    const xLen = extent.maxX - extent.minX;
    for (const x of roadsX) {
      for (let z = extent.minZ + 2; z < extent.minZ + zLen - 2; z += 5.5) {
        if (roadsZ.some((rz) => Math.abs(rz - z) < street / 2 + 1.5)) continue;
        markings.push({ x, y: 0.02, z, sx: 0.18, sy: 1, sz: 2.4 });
      }
    }
    for (const z of roadsZ) {
      for (let x = extent.minX + 2; x < extent.minX + xLen - 2; x += 5.5) {
        if (roadsX.some((rx) => Math.abs(rx - x) < street / 2 + 1.5)) continue;
        markings.push({ x, y: 0.02, z, sx: 2.4, sy: 1, sz: 0.18 });
      }
    }
    // Zebra crossings on each side of every intersection.
    for (const x of roadsX) {
      for (const z of roadsZ) {
        for (const side of [-1, 1]) {
          for (let k = -2; k <= 2; k++) {
            crosswalks.push({ x: x + k * 1.4, y: 0.025, z: z + side * (street / 2 + 1), sx: 0.7, sy: 1, sz: 1.8 });
            crosswalks.push({ x: x + side * (street / 2 + 1), y: 0.025, z: z + k * 1.4, sx: 1.8, sy: 1, sz: 0.7 });
          }
        }
      }
    }

    // Waterfront promenade lamps and trees.
    const shoreX = extent.maxX + 3;
    for (let z = extent.minZ; z <= extent.maxZ; z += 9) {
      lamps.push({ x: shoreX + 2.4, y: 0.35, z });
      if (rand() < 0.7) trees.push({ x: shoreX - 0.5, y: 0.35, z: z + 4.5, sx: 0.8, sy: 0.8, sz: 0.8 });
    }
    const pools = lamps.map((l) => ({ ...l, y: 0.4, sx: 7, sy: 1, sz: 7 }));
    return { slabs, grass, paths, trees, markings, crosswalks, lamps, pools };
  }, [layout, parkKeys, block, extent, roadsX, roadsZ, street]);

  const water = snapshot.water;
  const shoreX = extent.maxX + 3;
  const glints = useMemo(() => {
    const rand = mulberry32(77);
    return Array.from({ length: 18 }, () => ({
      x: shoreX + 8 + rand() * 40,
      y: 0.05,
      z: extent.minZ + rand() * (extent.maxZ - extent.minZ),
      sx: 2 + rand() * 3,
      sy: 1,
      sz: 10 + rand() * 18,
    }));
  }, [shoreX, extent]);

  return (
    <group>
      {/* Asphalt */}
      <mesh geometry={geos.flat} material={mats.asphalt} position={[(extent.minX + extent.maxX) / 2 - 40, 0, 0]} scale={[extent.maxX - extent.minX + 80, 1, extent.maxZ - extent.minZ + 160]} />
      {/* Promenade */}
      <mesh geometry={geos.slab} material={mats.sidewalk} position={[shoreX + 1, 0.175, 0]} scale={[6, 0.35, extent.maxZ - extent.minZ + 160]} />
      {/* Water */}
      <mesh geometry={geos.flat} material={mats.water} position={[water.position[0], -0.4, water.position[1]]} scale={[water.size[0], 1, water.size[1]]} />
      <Instances items={glints} geometry={geos.flat} material={mats.glint} />
      {[-60, 0, 60].map((z) => (
        <mesh key={z} geometry={geos.slab} material={mats.pier} position={[shoreX + 14, 0.1, z]} scale={[18, 0.5, 4]} />
      ))}

      <Instances items={data.slabs} geometry={geos.slab} material={mats.sidewalk} />
      <Instances items={data.grass} geometry={geos.flat} material={mats.grass} />
      <Instances items={data.paths} geometry={geos.flat} material={mats.path} />
      <Instances items={data.trees} geometry={geos.trunk} material={mats.trunk} />
      <Instances items={data.trees} geometry={geos.crown} material={mats.crown} />
      <Instances items={data.markings} geometry={geos.flat} material={mats.marking} />
      <Instances items={data.crosswalks} geometry={geos.flat} material={mats.crosswalk} />
      <Instances items={data.lamps} geometry={geos.post} material={mats.post} />
      <Instances items={data.lamps} geometry={geos.bulb} material={mats.bulb} />
      <Instances items={data.pools} geometry={geos.flat} material={mats.pool} />
    </group>
  );
}
