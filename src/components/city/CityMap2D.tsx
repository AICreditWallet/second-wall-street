"use client";

import { useMemo, type MouseEvent } from "react";
import type { CityIndex } from "@/lib/city/queries";
import { INDICATOR_META } from "@/lib/city/queries";
import { streetLayout } from "./scene/layout";
import { useCameraState } from "./camera-store";

interface Props {
  index: CityIndex;
  selectedId?: string | null;
  /** Minimap: click to move camera. */
  onPoint?: (x: number, z: number) => void;
  /** Full 2D map: click a building to select it. */
  onSelect?: (id: string) => void;
  showCamera?: boolean;
  className?: string;
  title?: string;
}

export function CityMap2D({ index, selectedId, onPoint, onSelect, showCamera, className, title = "City map" }: Props) {
  const { snapshot } = index;
  const layout = useMemo(() => streetLayout(snapshot.grid), [snapshot.grid]);
  const { extent } = layout;
  const pad = 6;
  const vb = { x: extent.minX - pad, y: extent.minZ - pad, w: extent.maxX - extent.minX + 40 + pad, h: extent.maxZ - extent.minZ + pad * 2 };

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onPoint) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    onPoint(p.x, p.y);
  };

  return (
    <svg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className={className}
      role="img"
      aria-label={title}
      onClick={handleClick}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#0a1120" />
      <rect x={extent.maxX + 6} y={vb.y} width={60} height={vb.h} fill="#082038" />
      {layout.blockCenters.map(([x, z]) => (
        <rect key={`${x},${z}`} x={x - layout.block / 2} y={z - layout.block / 2} width={layout.block} height={layout.block} rx={1.5} fill="#16203a" />
      ))}
      {snapshot.parks.map((p) => (
        <rect key={p.id} x={p.position[0] - p.size[0] / 2} y={p.position[1] - p.size[1] / 2} width={p.size[0]} height={p.size[1]} rx={1.5} fill="#14432f" />
      ))}
      {snapshot.buildings.map((b) => {
        const ind = index.indicatorByBuilding.get(b.id) ?? "occupied";
        const selected = b.id === selectedId;
        const common = {
          fill: selected ? "#ffffff" : INDICATOR_META[ind].color,
          fillOpacity: selected ? 1 : ind === "free" ? 0.55 : 0.85,
          stroke: selected ? "#38e1ff" : "none",
          strokeWidth: 1.5,
        };
        const shape =
          b.shape === "cylinder" ? (
            <circle cx={b.position[0]} cy={b.position[1]} r={b.footprint[0] / 2} {...common} />
          ) : (
            <rect x={b.position[0] - b.footprint[0] / 2} y={b.position[1] - b.footprint[1] / 2} width={b.footprint[0]} height={b.footprint[1]} rx={0.8} {...common} />
          );
        if (!onSelect) return <g key={b.id}>{shape}</g>;
        return (
          <g
            key={b.id}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(b.id);
            }}
          >
            <title>{`${b.name} — ${INDICATOR_META[ind].label}`}</title>
            {shape}
          </g>
        );
      })}
      {showCamera && <CameraMarker />}
    </svg>
  );
}

function CameraMarker() {
  const cam = useCameraState();
  const [x, z] = cam.target;
  const r = Math.max(14, Math.min(60, cam.distance * 0.18));
  // View direction on the ground plane (camera looks toward the target).
  const dx = -Math.sin(cam.azimuth);
  const dz = -Math.cos(cam.azimuth);
  const spread = 0.55;
  const l = { x: dx * Math.cos(spread) - dz * Math.sin(spread), z: dx * Math.sin(spread) + dz * Math.cos(spread) };
  const rr = { x: dx * Math.cos(-spread) - dz * Math.sin(-spread), z: dx * Math.sin(-spread) + dz * Math.cos(-spread) };
  return (
    <g pointerEvents="none">
      <path d={`M ${x} ${z} L ${x + l.x * r} ${z + l.z * r} L ${x + rr.x * r} ${z + rr.z * r} Z`} fill="#38e1ff" fillOpacity={0.22} />
      <circle cx={x} cy={z} r={3} fill="#38e1ff" stroke="#04070f" strokeWidth={1} />
    </g>
  );
}
