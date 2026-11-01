"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import * as THREE from "three";
import type { MapControls as MapControlsImpl } from "three-stdlib";
import type { Building } from "@/lib/city/types";
import { cameraStore, type CameraCommand } from "../camera-store";
import { roofTop } from "./Markers";

/** Last city camera, kept across interior visits (module scope survives remounts). */
let savedCityView: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;

export const DEFAULT_VIEW = { distance: 340, polar: 0.92, azimuth: Math.PI / 4 };
const MIN_DISTANCE = 22;
const MAX_DISTANCE = 620;
const MAX_POLAR = 1.36;
const MIN_POLAR = 0.18;

interface Props {
  buildings: Building[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  interactive: boolean;
  animate: boolean;
  commands?: RefObject<((c: CameraCommand) => void) | null>;
}

/** Pull the default camera back on narrow / portrait screens so the whole district fits. */
function fitDistance(camera: THREE.Camera) {
  const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1.6;
  return DEFAULT_VIEW.distance * (aspect < 0.8 ? 1.75 : aspect < 1.3 ? 1.3 : 1);
}

function fromSpherical(target: THREE.Vector3, distance: number, polar: number, azimuth: number) {
  return new THREE.Vector3(
    target.x + distance * Math.sin(polar) * Math.sin(azimuth),
    target.y + distance * Math.cos(polar),
    target.z + distance * Math.sin(polar) * Math.cos(azimuth),
  );
}

export function CameraRig({ buildings, bounds, interactive, animate, commands }: Props) {
  const controls = useRef<MapControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ target: THREE.Vector3; position: THREE.Vector3 } | null>(null);
  const lastPublish = useRef(0);
  const byId = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const margin = 24;

  // Initial placement — or restore the view the user left when entering a building.
  useEffect(() => {
    const saved = savedCityView;
    const c = controls.current;
    if (saved && interactive) {
      camera.position.copy(saved.position);
      controls.current?.target.copy(saved.target);
    } else {
      camera.position.copy(fromSpherical(new THREE.Vector3(), fitDistance(camera), DEFAULT_VIEW.polar, DEFAULT_VIEW.azimuth));
      controls.current?.target.set(0, 0, 0);
    }
    camera.lookAt(controls.current?.target ?? new THREE.Vector3());
    controls.current?.update();
    return () => {
      if (interactive && c) savedCityView = { position: camera.position.clone(), target: c.target.clone() };
    };
  }, [camera, interactive]);

  useEffect(() => {
    if (!commands) return;
    const fly = (target: THREE.Vector3, distance: number, polar: number, azimuth?: number) => {
      const c = controls.current;
      if (!c) return;
      const az = azimuth ?? c.getAzimuthalAngle();
      const next = { target, position: fromSpherical(target, THREE.MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE), polar, az) };
      // Never hand the camera an invalid coordinate.
      if (![next.target.x, next.target.y, next.target.z, next.position.x, next.position.y, next.position.z].every(Number.isFinite)) return;
      if (!animate) {
        c.target.copy(next.target);
        camera.position.copy(next.position);
        c.update();
        goal.current = null;
      } else {
        goal.current = next;
      }
      invalidate();
    };

    commands.current = (cmd) => {
      const c = controls.current;
      if (!c) return;
      const dist = camera.position.distanceTo(c.target);
      switch (cmd.type) {
        case "focus-building": {
          const b = byId.get(cmd.id);
          if (b) fly(new THREE.Vector3(b.position[0], Math.min(b.height * 0.45, 30), b.position[1]), b.height * 2.2 + 80, 0.95);
          break;
        }
        case "building-view": {
          const b = byId.get(cmd.id);
          if (b) fly(new THREE.Vector3(b.position[0], Math.min(b.height * 0.5, 40), b.position[1]), b.height * 2.3 + 90, 1.02);
          break;
        }
        case "focus-point":
          fly(new THREE.Vector3(cmd.x, 0, cmd.z), cmd.distance ?? Math.min(dist, 160), c.getPolarAngle());
          break;
        case "view":
          if (cmd.view === "street") fly(new THREE.Vector3(c.target.x, 3, c.target.z), 40, 1.3);
          else fly(new THREE.Vector3(c.target.x, 0, c.target.z), Math.max(dist, 210), 0.85);
          break;
        case "reset":
          fly(new THREE.Vector3(), fitDistance(camera), DEFAULT_VIEW.polar, DEFAULT_VIEW.azimuth);
          break;
        case "pan": {
          const az = c.getAzimuthalAngle();
          const step = Math.max(8, dist * 0.12);
          const fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
          const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
          const delta = fwd.multiplyScalar(-cmd.dz * step).add(right.multiplyScalar(cmd.dx * step));
          fly(c.target.clone().add(delta), dist, c.getPolarAngle());
          break;
        }
        case "zoom":
          fly(c.target.clone(), dist * cmd.factor, c.getPolarAngle());
          break;
        case "rotate":
          fly(c.target.clone(), dist, c.getPolarAngle(), c.getAzimuthalAngle() + cmd.angle);
          break;
      }
    };
    return () => {
      commands.current = null;
    };
  }, [commands, camera, byId, animate, invalidate]);

  // Cancel a fly-to as soon as the user grabs the camera.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const cancel = () => (goal.current = null);
    c.addEventListener("start", cancel);
    return () => c.removeEventListener("start", cancel);
  }, []);

  const clampVec = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    const c = controls.current;
    if (!c) return;

    if (goal.current) {
      const k = 1 - Math.exp(-delta * 3.2);
      c.target.lerp(goal.current.target, k);
      camera.position.lerp(goal.current.position, k);
      if (camera.position.distanceTo(goal.current.position) < 0.2) goal.current = null;
      invalidate();
    } else if (!interactive && animate) {
      // Showcase mode: slow cinematic orbit.
      const az = DEFAULT_VIEW.azimuth + clock.elapsedTime * 0.035;
      camera.position.copy(fromSpherical(c.target, fitDistance(camera) * 0.82, DEFAULT_VIEW.polar, az));
    }

    // Keep the camera over the city.
    clampVec.copy(c.target);
    c.target.x = THREE.MathUtils.clamp(c.target.x, bounds.minX - margin, bounds.maxX + margin);
    c.target.z = THREE.MathUtils.clamp(c.target.z, bounds.minZ - margin, bounds.maxZ + margin);
    c.target.y = THREE.MathUtils.clamp(c.target.y, 0, 30);
    camera.position.add(clampVec.sub(c.target).negate());

    // Never let the camera end up inside a building.
    const p = camera.position;
    for (const b of buildings) {
      const hw = b.footprint[0] / 2 + 2;
      const hd = b.footprint[1] / 2 + 2;
      if (Math.abs(p.x - b.position[0]) < hw && Math.abs(p.z - b.position[1]) < hd) {
        const top = roofTop(b) + 3;
        if (p.y < top) p.y = top;
      }
    }
    if (p.y < 2.5) p.y = 2.5;

    c.update();

    if (clock.elapsedTime - lastPublish.current > 0.12) {
      lastPublish.current = clock.elapsedTime;
      cameraStore.set({ target: [c.target.x, c.target.z], azimuth: c.getAzimuthalAngle(), distance: camera.position.distanceTo(c.target) });
    }
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      enabled={interactive}
      enableDamping
      dampingFactor={0.08}
      screenSpacePanning={false}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      maxPolarAngle={MAX_POLAR}
      minPolarAngle={MIN_POLAR}
      zoomToCursor
      zoomSpeed={0.9}
      rotateSpeed={0.6}
    />
  );
}
