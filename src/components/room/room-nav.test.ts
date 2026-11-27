import { describe, expect, test } from "bun:test";
import { buildNavGrid, cleanNav, expandRoute, findRoute, isWalkable, pointInPolygon, snapToWalkable, type NavData, type Polygon } from "./room-nav";

const ASPECT = 2; // image 2:1
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const nav: NavData = { floors: [rect(0.05, 0.05, 0.95, 0.95)], solids: [rect(0.45, 0.2, 0.55, 0.8)] }; // un mur vertical au centre
const grid = buildNavGrid(nav, ASPECT)!;
const segmentCrosses = (a: { x: number; y: number }, b: { x: number; y: number }, polygon: Polygon) => {
  for (let i = 0; i <= 200; i += 1) if (pointInPolygon({ x: a.x + (b.x - a.x) * i / 200, y: a.y + (b.y - a.y) * i / 200 }, polygon)) return true;
  return false;
};

describe("grille de navigation", () => {
  test("sans données de navigation : aucune grille (comportement historique)", () => {
    expect(buildNavGrid(undefined, ASPECT)).toBeNull();
    expect(buildNavGrid({}, ASPECT)).toBeNull();
    expect(findRoute(null, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 })).toEqual([{ x: 0.9, y: 0.9 }]);
  });
  test("le sol est praticable, le solide et l'extérieur du sol ne le sont pas", () => {
    expect(isWalkable(grid, { x: 0.2, y: 0.5 })).toBe(true);
    expect(isWalkable(grid, { x: 0.5, y: 0.5 })).toBe(false);
    expect(isWalkable(grid, { x: 0.02, y: 0.5 })).toBe(false);
  });
  test("l'empreinte écarte le centre du personnage des bords du solide", () => {
    expect(isWalkable(grid, { x: 0.44, y: 0.5 })).toBe(false); // collé au mur : le pied toucherait
    expect(isWalkable(grid, { x: 0.35, y: 0.5 })).toBe(true);
  });
  test("cellules carrées en pixels : la hauteur suit le rapport de l'image", () => {
    expect(grid.cols).toBe(200);
    expect(grid.rows).toBe(100);
  });
});

describe("itinéraires", () => {
  test("ligne droite quand rien ne gêne", () => {
    expect(findRoute(grid, { x: 0.1, y: 0.5 }, { x: 0.3, y: 0.5 })).toEqual([{ x: 0.3, y: 0.5 }]);
  });
  test("contourne un mur : aucun segment ne le traverse, et on arrive au but", () => {
    const from = { x: 0.2, y: 0.5 };
    const to = { x: 0.8, y: 0.5 };
    const route = findRoute(grid, from, to);
    expect(route.length).toBeGreaterThan(1);
    expect(route[route.length - 1]).toEqual(to);
    let previous = from;
    for (const point of route) {
      expect(segmentCrosses(previous, point, nav.solids![0]!)).toBe(false);
      previous = point;
    }
  });
  test("le lissage évite le zigzag de grille : peu de points pour un seul obstacle", () => {
    expect(findRoute(grid, { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }).length).toBeLessThanOrEqual(4);
  });
  test("un poste collé à un meuble reste accessible : on le rejoint par la cellule libre la plus proche", () => {
    const seat = { x: 0.5, y: 0.5 }; // au cœur du solide
    const route = findRoute(grid, { x: 0.2, y: 0.5 }, seat);
    expect(route[route.length - 1]).toEqual(seat);
    expect(route.length).toBeGreaterThanOrEqual(2);
    expect(isWalkable(grid, route[route.length - 2]!)).toBe(true);
  });
  test("un agent qui part d'un solide en ressort d'abord", () => {
    const route = findRoute(grid, { x: 0.5, y: 0.5 }, { x: 0.2, y: 0.5 });
    expect(isWalkable(grid, route[0]!)).toBe(true);
    expect(route[route.length - 1]).toEqual({ x: 0.2, y: 0.5 });
  });
  test("zones non reliées : repli en ligne droite (jamais bloqué)", () => {
    const split: NavData = { floors: [rect(0.05, 0.05, 0.4, 0.95), rect(0.6, 0.05, 0.95, 0.95)] };
    const islands = buildNavGrid(split, ASPECT)!;
    expect(findRoute(islands, { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 })).toEqual([{ x: 0.8, y: 0.5 }]);
  });
  test("parcours à étapes (escalier) : chaque étape est routée", () => {
    const route = expandRoute(grid, { x: 0.2, y: 0.5 }, [{ x: 0.3, y: 0.1 }, { x: 0.8, y: 0.5 }]);
    expect(route[route.length - 1]).toEqual({ x: 0.8, y: 0.5 });
    expect(route.some((point) => point.x === 0.3 && point.y === 0.1)).toBe(true);
  });
});

describe("placement", () => {
  test("un personnage lâché sur un meuble est replacé sur le sol le plus proche", () => {
    const snapped = snapToWalkable(grid, { x: 0.5, y: 0.5 });
    expect(isWalkable(grid, snapped)).toBe(true);
    expect(snapToWalkable(grid, { x: 0.2, y: 0.5 })).toEqual({ x: 0.2, y: 0.5 });
    expect(snapToWalkable(null, { x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("validation des polygones", () => {
  test("écarte les polygones invalides, arrondit les coordonnées", () => {
    const cleaned = cleanNav({
      floors: [rect(0.1, 0.1, 0.9, 0.9), [{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }]],
      solids: [[{ x: 0.12345678, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }]],
    });
    expect(cleaned?.floors).toHaveLength(1);
    expect(cleaned?.solids?.[0]?.[0]).toEqual({ x: 0.1235, y: 0.1 });
  });
  test("rien de valide → undefined", () => {
    expect(cleanNav({ floors: [], solids: "x" })).toBeUndefined();
    expect(cleanNav(null)).toBeUndefined();
  });
});
