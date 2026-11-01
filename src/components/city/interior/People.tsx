"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mulberry32 } from "@/lib/city/generator";
import type { InteriorLayout, Seat } from "@/lib/interior/layout";
import { buildNavGrid, findPath, type NavGrid } from "@/lib/interior/pathfinding";

/**
 * Illustrative office workers. Original low-poly characters animated in code
 * (walk / sit / type / talk) that follow A* paths on the layout's nav grid,
 * so they never walk through furniture, and pause to avoid each other.
 * These are decorative: they never represent real users or real activity.
 */

const SKIN = ["#f2d0b5", "#e0ac8a", "#c68863", "#8d5a3b", "#5c3a24"];
const SHIRTS = ["#2f6fdc", "#e8ecf5", "#c0392b", "#2fbf8f", "#7c5cd6", "#f2c14e", "#34495e", "#e67e22"];
const PANTS = ["#232b3b", "#3b4a63", "#5a4636", "#1e2430"];
const HAIR = ["#1d1611", "#4a3020", "#b7853f", "#2b2b2b", "#8a5a3c"];

type Mode = "sit" | "walk" | "stand";

interface Agent {
  home: Seat | null;
  mode: Mode;
  seat: Seat | null;
  path: [number, number][];
  next: () => void;
  until: number;
  x: number;
  z: number;
  facing: number;
  talk: boolean;
  wait: number;
  phase: number;
  refs: Parts;
}

interface Parts {
  root: THREE.Group | null;
  hips: THREE.Group | null;
  thighL: THREE.Group | null;
  thighR: THREE.Group | null;
  kneeL: THREE.Group | null;
  kneeR: THREE.Group | null;
  armL: THREE.Group | null;
  armR: THREE.Group | null;
  elbowL: THREE.Group | null;
  elbowR: THREE.Group | null;
  head: THREE.Group | null;
}

const emptyParts = (): Parts => ({ root: null, hips: null, thighL: null, thighR: null, kneeL: null, kneeR: null, armL: null, armR: null, elbowL: null, elbowR: null, head: null });

function useBodyKit() {
  const kit = useMemo(() => {
    const mats = new Map<string, THREE.MeshStandardMaterial>();
    const mat = (c: string) => {
      let m = mats.get(c);
      if (!m) mats.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })));
      return m;
    };
    return {
      mat,
      mats,
      torso: new THREE.CapsuleGeometry(0.17, 0.3, 3, 10),
      limb: new THREE.CapsuleGeometry(0.06, 0.32, 2, 8).translate(0, -0.19, 0),
      leg: new THREE.CapsuleGeometry(0.075, 0.3, 2, 8).translate(0, -0.2, 0),
      head: new THREE.SphereGeometry(0.12, 16, 12),
      hair: new THREE.SphereGeometry(0.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      shoe: new THREE.BoxGeometry(0.1, 0.06, 0.2).translate(0, 0, 0.04),
    };
  }, []);
  useEffect(
    () => () => {
      kit.mats.forEach((m) => m.dispose());
      [kit.torso, kit.limb, kit.leg, kit.head, kit.hair, kit.shoe].forEach((g) => g.dispose());
    },
    [kit],
  );
  return kit;
}

function Body({ look, parts, kit }: { look: { skin: string; shirt: string; pants: string; hair: string }; parts: Parts; kit: ReturnType<typeof useBodyKit> }) {
  const skin = kit.mat(look.skin);
  const shirt = kit.mat(look.shirt);
  const pants = kit.mat(look.pants);
  const set = <K extends keyof Parts>(k: K) => (el: Parts[K]) => {
    parts[k] = el;
  };
  const leg = (side: 1 | -1, thigh: keyof Parts, knee: keyof Parts) => (
    <group ref={set(thigh)} position={[0.09 * side, 0, 0]}>
      <mesh geometry={kit.leg} material={pants} castShadow />
      <group ref={set(knee)} position={[0, -0.42, 0]}>
        <mesh geometry={kit.leg} material={pants} castShadow />
        <mesh geometry={kit.shoe} material={kit.mat("#1b1f29")} position={[0, -0.44, 0]} />
      </group>
    </group>
  );
  const arm = (side: 1 | -1, upper: keyof Parts, elbow: keyof Parts) => (
    <group ref={set(upper)} position={[0.23 * side, 0.5, 0]}>
      <mesh geometry={kit.limb} material={shirt} castShadow />
      <group ref={set(elbow)} position={[0, -0.36, 0]}>
        <mesh geometry={kit.limb} material={skin} castShadow />
      </group>
    </group>
  );
  return (
    <group ref={set("root")}>
      <group ref={set("hips")} position={[0, 0.9, 0]}>
        <mesh geometry={kit.torso} material={shirt} position={[0, 0.32, 0]} scale={[1.05, 1, 0.75]} castShadow />
        <group ref={set("head")} position={[0, 0.76, 0]}>
          <mesh geometry={kit.head} material={skin} castShadow />
          <mesh geometry={kit.hair} material={kit.mat(look.hair)} position={[0, 0.02, -0.01]} />
        </group>
        {arm(1, "armR", "elbowR")}
        {arm(-1, "armL", "elbowL")}
        {leg(1, "thighR", "kneeR")}
        {leg(-1, "thighL", "kneeL")}
      </group>
    </group>
  );
}

const SPEED = 1.1;

export function People({ layout, count, animate, seed = 1 }: { layout: InteriorLayout; count: number; animate: boolean; seed?: number }) {
  const kit = useBodyKit();
  const grid: NavGrid = useMemo(() => buildNavGrid(layout.width, layout.depth, layout.obstacles), [layout]);

  const { agents, looks, plan } = useMemo(() => {
    const rand = mulberry32(seed * 977 + layout.width * 13);
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;
    const deskSeats = layout.seats.filter((s) => s.kind === "desk" || s.kind === "stool");
    const otherSeats = layout.seats.filter((s) => s.kind !== "desk" && s.kind !== "stool");
    const taken = new Set<string>();
    const agents: Agent[] = [];
    const looks: { skin: string; shirt: string; pants: string; hair: string }[] = [];
    const lobby = layout.kind === "lobby";

    for (let i = 0; i < count; i++) {
      const home = !lobby ? (deskSeats.filter((s) => !taken.has(s.id))[0] ?? null) : i === 0 ? (deskSeats[0] ?? null) : null;
      if (home) taken.add(home.id);
      const start = home ?? (layout.standSpots.length ? pick(layout.standSpots) : { x: layout.entrance[0], z: layout.entrance[1], facing: Math.PI });
      const a: Agent = {
        home,
        mode: home ? "sit" : "stand",
        seat: home,
        path: [],
        next: () => {},
        until: rand() * 12 + 4,
        x: start.x + (home ? 0 : (rand() - 0.5) * 0.8),
        z: start.z + (home ? 0 : (rand() - 0.5) * 0.8),
        facing: "facing" in start ? start.facing : 0,
        talk: !home,
        wait: 0,
        phase: rand() * 10,
        refs: emptyParts(),
      };
      agents.push(a);
      looks.push({ skin: pick(SKIN), shirt: pick(SHIRTS), pants: pick(PANTS), hair: pick(HAIR) });
    }

    // Behaviour: leave the seat, visit somewhere, come back.
    const occupied = new Set<string>([...taken]);
    const goTo = (a: Agent, x: number, z: number, then: () => void) => {
      const path = findPath(grid, [a.x, a.z], [x, z]);
      if (a.seat) occupied.delete(a.seat.id);
      a.seat = null;
      if (!path || path.length < 2) {
        a.x = x;
        a.z = z;
        then();
        return;
      }
      // Finish exactly on the target even if the grid snapped it.
      path[path.length - 1] = [x, z];
      a.path = path.slice(1);
      a.mode = "walk";
      a.next = then;
    };
    const plan = (a: Agent, now: number) => {
      const roll = rand();
      const freeSeats = otherSeats.filter((s) => !occupied.has(s.id));
      if (!lobby && a.home && (a.mode === "stand" || (a.mode === "sit" && a.seat !== a.home))) {
        // Return to own desk.
        const home = a.home;
        goTo(a, home.x, home.z, () => sitAt(a, home, now + 10 + rand() * 16));
        return;
      }
      if (freeSeats.length && roll < 0.4) {
        const s = pick(freeSeats);
        occupied.add(s.id);
        goTo(a, s.x, s.z, () => sitAt(a, s, a.until + 8 + rand() * 10));
      } else if (layout.standSpots.length) {
        const s = pick(layout.standSpots);
        const ox = (rand() - 0.5) * 0.9;
        goTo(a, s.x + ox, s.z, () => {
          a.mode = "stand";
          a.facing = s.facing;
          a.talk = rand() < 0.7;
          a.until = a.until + 5 + rand() * 8;
        });
      }
    };
    const sitAt = (a: Agent, s: Seat, until: number) => {
      a.mode = "sit";
      a.seat = s;
      occupied.add(s.id);
      a.x = s.x;
      a.z = s.z;
      a.facing = s.facing;
      a.until = until;
    };
    return { agents, looks, plan };
  }, [count, grid, layout, seed]);

  const clock = useRef(0);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    if (animate) clock.current += dt;
    const t = clock.current;
    for (const a of agents) {
      // State progression.
      if (animate) {
        if (a.mode === "walk") {
          const target = a.path[0];
          if (!target) {
            a.mode = "stand";
            a.next();
          } else {
            const dx = target[0] - a.x;
            const dz = target[1] - a.z;
            const dist = Math.hypot(dx, dz);
            const desired = Math.atan2(dx, dz);
            let diff = desired - a.facing;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            a.facing += diff * Math.min(1, dt * 8);
            // Simple avoidance: wait if someone is right in front.
            const blocked = agents.some(
              (o) => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < 0.6 && (o.x - a.x) * dx + (o.z - a.z) * dz > 0,
            );
            if (blocked && a.wait < 1.5) a.wait += dt;
            else {
              a.wait = 0;
              const step = Math.min(dist, SPEED * dt);
              if (dist > 1e-4) {
                a.x += (dx / dist) * step;
                a.z += (dz / dist) * step;
              }
              if (dist < 0.05) a.path.shift();
            }
          }
        } else if (t > a.until) {
          a.until = t;
          plan(a, t);
        }
      }
      pose(a, t, animate);
    }
  });

  return (
    <group>
      {agents.map((a, i) => (
        <Body key={i} look={looks[i]!} parts={a.refs} kit={kit} />
      ))}
    </group>
  );
}

function pose(a: Agent, t: number, animate: boolean) {
  const p = a.refs;
  if (!p.root || !p.hips) return;
  p.root.position.set(a.x, 0, a.z);
  p.root.rotation.y = a.facing;
  const w = animate ? t * 7 + a.phase : 0;
  const set = (g: THREE.Group | null, x: number) => {
    if (g) g.rotation.x = x;
  };
  if (a.mode === "walk") {
    const s = Math.sin(w);
    p.hips.position.y = 0.9 + Math.abs(Math.cos(w)) * 0.03;
    p.hips.position.z = 0;
    set(p.thighL, s * 0.55);
    set(p.thighR, -s * 0.55);
    set(p.kneeL, Math.max(0, -s) * 0.8);
    set(p.kneeR, Math.max(0, s) * 0.8);
    set(p.armL, -s * 0.45);
    set(p.armR, s * 0.45);
    set(p.elbowL, -0.25);
    set(p.elbowR, -0.25);
    if (p.head) p.head.rotation.y = 0;
  } else if (a.mode === "sit") {
    p.hips.position.y = 0.5;
    p.hips.position.z = -0.08;
    set(p.thighL, -Math.PI / 2);
    set(p.thighR, -Math.PI / 2);
    set(p.kneeL, Math.PI / 2);
    set(p.kneeR, Math.PI / 2);
    const typing = a.seat?.kind === "desk" || a.seat?.kind === "stool";
    const tap = animate ? Math.sin(w * 2.2) * 0.06 : 0;
    set(p.armL, typing ? -0.75 + tap : -0.2);
    set(p.armR, typing ? -0.75 - tap : -0.2);
    set(p.elbowL, typing ? -0.75 : -0.9);
    set(p.elbowR, typing ? -0.75 : -0.9);
    if (p.head) p.head.rotation.y = typing ? 0 : Math.sin(w * 0.15) * 0.4;
  } else {
    p.hips.position.y = 0.9 + (animate ? Math.sin(w * 0.3) * 0.004 : 0);
    p.hips.position.z = 0;
    set(p.thighL, 0);
    set(p.thighR, 0);
    set(p.kneeL, 0);
    set(p.kneeR, 0);
    const gesture = a.talk && animate ? Math.max(0, Math.sin(w * 0.5)) : 0;
    set(p.armL, 0.05);
    set(p.armR, -gesture * 0.9);
    set(p.elbowL, -0.1);
    set(p.elbowR, -gesture * 0.8);
    if (p.head) p.head.rotation.y = a.talk && animate ? Math.sin(w * 0.25) * 0.35 : 0;
  }
}
