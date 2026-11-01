"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { textTexture } from "./textures";
import type { StreetLayout } from "./layout";

/**
 * Street names painted on the road surface, like a premium navigation map.
 * They fade in as the camera gets closer, and flip so they always read the
 * right way up from the current camera angle.
 */

// North–south roads (west → east) and east–west roads (north → south).
// Names match the addresses already stored for each building.
export const AVENUE_NAMES = ["Founders Ave", "Cipher Ave", "Exchange Ave", "Liberty Ave", "Quorum Ave", "Harbor Ave", "Pier Ave", "Harbor Drive"];
export const STREET_NAMES = ["Atlas St", "Ticker St", "Ledger St", "Merit St", "Signal St", "Vector St", "Wall Street"];

const SHOW_BELOW = 300; // camera distance where names start to appear
const FULL_BELOW = 200;

export function Streets({ layout }: { layout: StreetLayout }) {
  const { roadsX, roadsZ, extent, pitch } = layout;
  const textures = useMemo(() => {
    const map = new Map<string, { texture: THREE.Texture; aspect: number }>();
    for (const n of [...AVENUE_NAMES, ...STREET_NAMES]) map.set(n, textTexture(n.toUpperCase(), { height: 96, color: "#f1f5ff", font: '700 54px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' }));
    return map;
  }, []);
  const materials = useMemo(() => {
    const m = new Map<string, THREE.MeshBasicMaterial>();
    textures.forEach((t, k) => m.set(k, new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })));
    return m;
  }, [textures]);
  const plane = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  useEffect(
    () => () => {
      textures.forEach((t) => t.texture.dispose());
      materials.forEach((m) => m.dispose());
      plane.dispose();
    },
    [textures, materials, plane],
  );

  const labels = useMemo(() => {
    const out: { name: string; x: number; z: number; alongX: boolean }[] = [];
    // One label per block-length segment, alternating to avoid clutter.
    roadsX.forEach((x, i) => {
      for (let r = 0; r < roadsZ.length - 1; r++) {
        if ((r + i) % 2) continue;
        out.push({ name: AVENUE_NAMES[i] ?? "", x, z: (roadsZ[r]! + roadsZ[r + 1]!) / 2, alongX: false });
      }
    });
    roadsZ.forEach((z, i) => {
      for (let c = 0; c < roadsX.length - 1; c++) {
        if ((c + i) % 2) continue;
        out.push({ name: STREET_NAMES[i] ?? "", x: (roadsX[c]! + roadsX[c + 1]!) / 2, z, alongX: true });
      }
    });
    return out.filter((l) => l.name && l.x > extent.minX - 1 && l.x < extent.maxX + 1);
  }, [roadsX, roadsZ, extent]);

  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, controls }) => {
    const target = (controls as unknown as { target?: THREE.Vector3 } | null)?.target ?? new THREE.Vector3();
    const dist = camera.position.distanceTo(target);
    const opacity = THREE.MathUtils.clamp((SHOW_BELOW - dist) / (SHOW_BELOW - FULL_BELOW), 0, 1) * 0.92;
    materials.forEach((m) => (m.opacity = opacity));
    camera.getWorldDirection(dir);
    labels.forEach((l, i) => {
      const m = meshes.current[i];
      if (!m) return;
      m.visible = opacity > 0.01;
      // Text "up" should point away from the camera: flip 180° when needed.
      if (l.alongX) m.rotation.y = dir.z > 0 ? Math.PI : 0;
      else m.rotation.y = dir.x > 0 ? -Math.PI / 2 : Math.PI / 2;
    });
  });

  const height = Math.min(4.2, layout.street * 0.5);
  return (
    <group>
      {labels.map((l, i) => {
        const t = textures.get(l.name)!;
        const w = Math.min(height * t.aspect, pitch * 0.7);
        return (
          <mesh
            key={`${l.name}-${i}`}
            ref={(el) => void (meshes.current[i] = el)}
            geometry={plane}
            material={materials.get(l.name)}
            position={[l.x, 0.06, l.z]}
            scale={[w, 1, (w / t.aspect)]}
            renderOrder={3}
          />
        );
      })}
    </group>
  );
}
