"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** Shared geometries/materials for interiors: one set per scene, disposed on unmount. */
export function useInteriorKit(accent: string) {
  const kit = useMemo(() => {
    const m = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...extra });
    const mats = {
      floor: m("#d9dee6", { roughness: 0.55 }),
      floorWood: m("#c9a27a", { roughness: 0.6 }),
      wall: m("#eef1f6", { roughness: 0.9 }),
      wallAccent: m("#24304f", { roughness: 0.8 }),
      deskTop: m("#f4f1ea", { roughness: 0.5 }),
      deskWood: m("#a87a52", { roughness: 0.55 }),
      metal: m("#7d8796", { metalness: 0.6, roughness: 0.35 }),
      dark: m("#2a3142", { roughness: 0.6 }),
      chair: m("#33405e", { roughness: 0.7 }),
      fabric: m("#5b6b8c", { roughness: 0.95 }),
      fabricWarm: m("#c8875a", { roughness: 0.95 }),
      rug: m("#3d5a54", { roughness: 1 }),
      rugAlt: m("#4a4f7a", { roughness: 1 }),
      pot: m("#e7e2d9", { roughness: 0.8 }),
      leaf: m("#3f8a57", { roughness: 0.8, flatShading: true }),
      screen: new THREE.MeshStandardMaterial({ color: "#0b1426", emissive: "#2b6fff", emissiveIntensity: 0.35, roughness: 0.3 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#cfe8ff", transmission: 0, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0, depthWrite: false }),
      frame: m("#5d6779", { metalness: 0.5, roughness: 0.4 }),
      accent: new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, toneMapped: false }),
      accentSoft: new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      holo: new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, wireframe: true, toneMapped: false }),
      idle: new THREE.MeshBasicMaterial({ color: "#9aa4b8", transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
      counter: m("#f7f5f0", { roughness: 0.4 }),
      elevator: m("#b9c2cf", { metalness: 0.75, roughness: 0.25 }),
    };
    const geos = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
      cone: new THREE.CylinderGeometry(0.5, 0.36, 1, 14),
      leaf: new THREE.IcosahedronGeometry(0.5, 0),
      ring: new THREE.RingGeometry(0.72, 0.82, 40).rotateX(-Math.PI / 2),
      disc: new THREE.CircleGeometry(0.8, 40).rotateX(-Math.PI / 2),
      plane: new THREE.PlaneGeometry(1, 1),
      core: new THREE.IcosahedronGeometry(0.22, 1),
    };
    return { mats, geos };
  }, [accent]);

  useEffect(
    () => () => {
      Object.values(kit.mats).forEach((m) => m.dispose());
      Object.values(kit.geos).forEach((g) => g.dispose());
    },
    [kit],
  );
  return kit;
}

export type InteriorKit = ReturnType<typeof useInteriorKit>;

/** Stylised dusk skyline for window walls (procedural, original artwork). */
export function skylineTexture(seed = 7) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#1b2a5a");
  sky.addColorStop(0.55, "#4b5f9a");
  sky.addColorStop(1, "#e9a46b");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 256);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < 1024) {
      const w = 30 + rand() * 70;
      const h = (layer === 0 ? 60 : 110) + rand() * (layer === 0 ? 70 : 110);
      g.fillStyle = layer === 0 ? "#2a3566" : "#141c3c";
      g.fillRect(x, 256 - h, w, h);
      if (layer === 1) {
        for (let wy = 256 - h + 8; wy < 250; wy += 10) {
          for (let wx = x + 5; wx < x + w - 6; wx += 9) {
            if (rand() < 0.45) {
              g.fillStyle = rand() < 0.5 ? "#ffd27a" : "#7fe9ff";
              g.fillRect(wx, wy, 4, 5);
            }
          }
        }
      }
      x += w + (layer === 0 ? 4 : 10);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Abstract dashboard artwork for wall displays — shapes only, no numbers or data. */
export function displayTexture(accent: string, title: string) {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 360;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b1426";
  g.fillRect(0, 0, 640, 360);
  g.fillStyle = accent;
  g.globalAlpha = 0.9;
  g.font = "600 26px ui-sans-serif, system-ui, sans-serif";
  g.fillText(title, 28, 46);
  g.globalAlpha = 0.35;
  g.fillRect(28, 64, 584, 2);
  g.globalAlpha = 0.8;
  g.strokeStyle = accent;
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const x = 28 + i * 18;
    const y = 220 - Math.sin(i * 0.7) * 40 - i * 3;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.globalAlpha = 0.25;
  for (let i = 0; i < 6; i++) g.fillRect(420, 90 + i * 40, 190, 24);
  g.globalAlpha = 0.6;
  for (let i = 0; i < 8; i++) g.fillRect(40 + i * 44, 300 - (i % 3) * 18 - 20, 26, (i % 3) * 18 + 20);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
