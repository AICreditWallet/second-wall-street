"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { Building, Office, Organization } from "@/lib/city/types";
import { parseFloors } from "@/lib/city/interiors";
import { textTexture } from "./textures";

/** Building view: glass "x-ray" bands for every office, slightly exploded outward. */

export function officeColor(o: Office) {
  if (o.status === "platform") return "#a78bfa";
  if (o.status === "occupied") return "#8b93a7";
  return o.tier === "standard" ? "#38e1ff" : "#e2b86b";
}

export function officeStatusText(o: Office, orgName?: string) {
  if (o.status === "available") return o.tier === "standard" ? "Available · Free" : "Available · Premium";
  return orgName ?? "Occupied";
}

function Band({
  building,
  office,
  org,
  index,
  selected,
  onSelect,
}: {
  building: Building;
  office: Office;
  org?: Organization;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const { from, to } = parseFloors(office.label);
  const perFloor = building.height / building.floors;
  const y0 = (from - 1) * perFloor;
  const h = Math.max(perFloor, (to - from + 1) * perFloor) - 0.35;
  const color = officeColor(office);
  const grow = 1.2 + (selected ? 0.8 : 0);
  // "Exploded" view: each office band is lifted a little above the one below.
  const lift = index * 1.4;
  const [w, d] = building.footprint;
  const round = building.shape === "cylinder";

  const geo = useMemo(
    () => (round ? new THREE.CylinderGeometry(w / 2 + grow, w / 2 + grow, h, 32) : new THREE.BoxGeometry(w + grow * 2, h, d + grow * 2)),
    [round, w, d, h, grow],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(geo, 30), [geo]);
  const fill = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: selected ? 0.45 : hover ? 0.36 : 0.24, depthWrite: false, toneMapped: false }),
    [color, selected, hover],
  );
  const line = useMemo(() => new THREE.LineBasicMaterial({ color, transparent: true, opacity: selected || hover ? 1 : 0.7, toneMapped: false }), [color, selected, hover]);
  const label = useMemo(
    () => textTexture(`${office.label} · ${officeStatusText(office, org?.name)}`, { height: 64, color: "#ffffff", background: "rgba(9,15,32,0.85)" }),
    [office, org],
  );
  const spriteMat = useMemo(() => new THREE.SpriteMaterial({ map: label.texture, depthTest: false, toneMapped: false }), [label]);
  useEffect(() => () => [geo, edges].forEach((g) => g.dispose()), [geo, edges]);
  useEffect(() => () => [fill, line].forEach((m) => m.dispose()), [fill, line]);
  useEffect(() => () => {
    label.texture.dispose();
    spriteMat.dispose();
  }, [label, spriteMat]);

  const labelH = 4;
  return (
    <group position={[building.position[0], y0 + h / 2 + 0.2 + lift, building.position[1]]}>
      <mesh
        geometry={geo}
        material={fill}
        renderOrder={4}
        onClick={(e) => {
          if (e.delta > 6) return;
          e.stopPropagation();
          onSelect(office.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      />
      <lineSegments geometry={edges} material={line} />
      <sprite material={spriteMat} position={[(round ? w / 2 : w / 2) + grow + labelH * label.aspect * 0.5 + 0.6, 0, 0]} scale={[labelH * label.aspect, labelH, 1]} renderOrder={10} />
    </group>
  );
}

export function FloorStack({
  building,
  offices,
  orgs,
  selectedOfficeId,
  onSelectOffice,
}: {
  building: Building;
  offices: Office[];
  orgs: Map<string, Organization>;
  selectedOfficeId: string | null;
  onSelectOffice: (id: string) => void;
}) {
  return (
    <group>
      {offices.map((o, i) => (
        <Band
          key={o.id}
          building={building}
          office={o}
          org={o.organizationId ? orgs.get(o.organizationId) : undefined}
          index={i}
          selected={o.id === selectedOfficeId}
          onSelect={onSelectOffice}
        />
      ))}
    </group>
  );
}
