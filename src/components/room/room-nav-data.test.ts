// Contrôle des données de navigation livrées avec les décors publics (public/rooms/*/room.json).
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildNavGrid, distanceToWalkable, expandRoute, findRoute, isReachable, isWalkable, pointInPolygon, type NavData } from "./room-nav";
import { transitionPath, type ActivityState } from "./room-scene";

const ROOMS = path.join(import.meta.dir, "../../../public/rooms");
const ASPECT = 2752 / 1536;
type Point = { x: number; y: number };
interface RoomFile { id: string; nav?: NavData; positions: Record<"working" | "thinking" | "idle", Point[]>; waypoints: Point[] }

const rooms: RoomFile[] = readdirSync(ROOMS).flatMap((folder) => {
  try { return [JSON.parse(readFileSync(path.join(ROOMS, folder, "room.json"), "utf8")) as RoomFile]; } catch { return []; }
});

describe("décors publics : navigation", () => {
  test("les décors fournis ont une navigation", () => {
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    for (const room of rooms) expect(room.nav?.floors?.length ?? 0).toBeGreaterThan(0);
  });

  for (const room of rooms) {
    const grid = buildNavGrid(room.nav, ASPECT);
    const stations = (["working", "thinking", "idle"] as const).flatMap((kind) => room.positions[kind].map((point, index) => ({ label: `${kind}#${index + 1}`, point })));
    const waypoints = room.waypoints.map((point, index) => ({ label: `escalier#${index + 1}`, point }));

    test(`${room.id} : la grille se construit`, () => {
      expect(grid).not.toBeNull();
      expect(grid!.walkable.some((cell) => cell === 1)).toBe(true);
    });

    test(`${room.id} : chaque poste est à moins de 12 cellules du sol praticable`, () => {
      for (const { label, point } of [...stations, ...waypoints]) {
        expect({ label, d: distanceToWalkable(grid, point) < 12 }).toEqual({ label, d: true });
      }
    });

    test(`${room.id} : tous les postes sont reliés entre eux (aucun repli en ligne droite)`, () => {
      const unreachable: string[] = [];
      for (const a of stations) for (const b of stations) if (a.label < b.label && !isReachable(grid, a.point, b.point)) unreachable.push(`${a.label} ↔ ${b.label}`);
      expect(unreachable).toEqual([]);
    });

    test(`${room.id} : les points de l'escalier sont reliés aux postes`, () => {
      const unreachable: string[] = [];
      for (const wp of waypoints) for (const s of stations) if (!isReachable(grid, wp.point, s.point)) unreachable.push(`${wp.label} ↔ ${s.label}`);
      expect(unreachable).toEqual([]);
    });

    test(`${room.id} : les changements de niveau (travail ↔ repos) suivent l'escalier sans traverser de solide`, () => {
      const solids = room.nav?.solids ?? [];
      const bad: string[] = [];
      const pairs: Array<[ActivityState, ActivityState]> = [["working", "idle"], ["idle", "working"], ["thinking", "idle"], ["idle", "thinking"]];
      for (const [fromState, toState] of pairs) {
        room.positions[fromState].forEach((from, fi) => room.positions[toState].forEach((to, ti) => {
          const legs = transitionPath({ ...from, activityState: fromState }, to, toState, room.waypoints);
          const route = expandRoute(grid, from, legs);
          expect({ label: `${fromState}#${fi + 1}→${toState}#${ti + 1}`, arrive: route[route.length - 1] }).toEqual({ label: `${fromState}#${fi + 1}→${toState}#${ti + 1}`, arrive: to });
          const points = [from, ...route];
          for (let leg = 1; leg < points.length; leg += 1) {
            const a = points[leg - 1]!;
            const b = points[leg]!;
            // Sortie d'un poste logé dans un meuble / dernière marche vers le poste : hors grille, volontairement.
            if ((leg === 1 && !isWalkable(grid, from)) || (leg === points.length - 1 && !isWalkable(grid, to))) continue;
            // Les étapes de l'escalier sont imposées par la calibration : on ne juge que les segments entre cases libres.
            if (!isWalkable(grid, a) || !isWalkable(grid, b)) continue;
            for (let i = 0; i <= 60; i += 1) {
              const sample = { x: a.x + (b.x - a.x) * i / 60, y: a.y + (b.y - a.y) * i / 60 };
              if (solids.some((solid) => pointInPolygon(sample, solid))) { bad.push(`${fromState}#${fi + 1}→${toState}#${ti + 1}`); break; }
            }
          }
        }));
      }
      expect([...new Set(bad)]).toEqual([]);
    });

    test(`${room.id} : aucun trajet entre deux postes ne traverse un objet solide`, () => {
      const solids = room.nav?.solids ?? [];
      const crossings: string[] = [];
      for (const a of stations) for (const b of stations) {
        if (a.label >= b.label) continue;
        const route = findRoute(grid, a.point, b.point);
        const points = [a.point, ...route];
        for (let leg = 1; leg < points.length; leg += 1) {
          // Sortir d'un poste logé dans un meuble, ou y entrer pour la dernière marche, est volontairement hors grille.
          if (leg === 1 && !isWalkable(grid, a.point)) continue;
          if (leg === points.length - 1 && !isWalkable(grid, b.point)) continue;
          const from = points[leg - 1]!;
          const to = points[leg]!;
          for (let i = 0; i <= 60; i += 1) {
            const sample = { x: from.x + (to.x - from.x) * i / 60, y: from.y + (to.y - from.y) * i / 60 };
            if (solids.some((solid) => pointInPolygon(sample, solid))) { crossings.push(`${a.label} → ${b.label}`); break; }
          }
        }
      }
      expect([...new Set(crossings)]).toEqual([]);
    });
  }
});
