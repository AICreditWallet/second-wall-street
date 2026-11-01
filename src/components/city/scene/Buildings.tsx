"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Building, WindowStyle } from "@/lib/city/types";
import { buildCityGeometry, type MergedBucket } from "./build-geometry";
import { windowTextures } from "./textures";

interface Props {
  buildings: Building[];
  interactive: boolean;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}

const EMISSIVE_INTENSITY: Record<WindowStyle, number> = {
  "cyan-band": 1.15,
  "cyan-grid": 1.05,
  "warm-grid": 1.0,
};

export function Buildings({ buildings, interactive, onHover, onSelect }: Props) {
  const geo = useMemo(() => buildCityGeometry(buildings), [buildings]);

  const facadeMaterials = useMemo(() => {
    const out: Partial<Record<WindowStyle, THREE.MeshStandardMaterial>> = {};
    for (const style of Object.keys(geo.facades) as WindowStyle[]) {
      const t = windowTextures(style);
      out[style] = new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: t.map,
        emissiveMap: t.emissive,
        emissive: new THREE.Color("#ffffff"),
        emissiveIntensity: EMISSIVE_INTENSITY[style],
        roughness: 0.7,
        metalness: 0.1,
      });
    }
    return out;
  }, [geo]);

  const roofMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 }),
    [],
  );

  useEffect(
    () => () => {
      Object.values(geo.facades).forEach((f) => f?.geometry.dispose());
      geo.roofs.geometry.dispose();
      Object.values(facadeMaterials).forEach((m) => m?.dispose());
    },
    [geo, facadeMaterials],
  );
  useEffect(() => () => roofMaterial.dispose(), [roofMaterial]);

  const handlers = (bucket: MergedBucket) => {
    if (!interactive) return {};
    const idFor = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
      const tri = e.faceIndex ?? -1;
      const index = tri >= 0 ? bucket.triBuilding[tri] : undefined;
      return index === undefined ? null : (buildings[index]?.id ?? null);
    };
    return {
      onPointerMove: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover?.(idFor(e));
      },
      onPointerOut: () => onHover?.(null),
      onClick: (e: ThreeEvent<MouseEvent>) => {
        // Ignore clicks that were really camera drags.
        if (e.delta > 6) return;
        e.stopPropagation();
        const id = idFor(e);
        if (id) onSelect?.(id);
      },
    };
  };

  return (
    <group>
      {(Object.entries(geo.facades) as [WindowStyle, MergedBucket][]).map(([style, bucket]) => (
        <mesh key={style} geometry={bucket.geometry} material={facadeMaterials[style]} {...handlers(bucket)} />
      ))}
      <mesh geometry={geo.roofs.geometry} material={roofMaterial} {...handlers(geo.roofs)} />
    </group>
  );
}
