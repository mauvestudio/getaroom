import { describe, expect, test } from "bun:test";
import {
  nearestFreeSeat, pickCharacter, rotateFacing, walkFacing,
  bubbleLines, countDiff, describeTimelineItem, hostOrder, hostZoneRects,
  reserveStations, spriteMetrics, transitionPath, type SceneMap,
} from "./room-scene";

const map: SceneMap = {
  id: "test",
  positions: {
    working: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.9, y: 0.1 }],
    thinking: [],
    idle: [{ x: 0.5, y: 0.8 }],
  },
};

describe("spriteMetrics", () => {
  test("conserve le rendu historique des anciens décors", () => {
    expect(spriteMetrics({ id: "monument-citadelle" }, 800)).toEqual({ style: "monochrome", scale: 1.65, groundOffset: 0 });
    expect(spriteMetrics({ id: "severance-mdr" }, 800)).toEqual({ style: "severance", scale: 2.28, groundOffset: 0 });
    expect(spriteMetrics({ id: "x", sprite: { groundOffset: 0.05 } }, 800).groundOffset).toBe(0.05);
  });
  test("est proportionnelle à la hauteur affichée et bornée", () => {
    const sprite = { style: "severance" as const, scale: 2, referenceHeight: 800 };
    expect(spriteMetrics({ id: "x", sprite }, 400).scale).toBeCloseTo(1.1);
    expect(spriteMetrics({ id: "x", sprite }, 100).scale).toBeCloseTo(1.1);
    expect(spriteMetrics({ id: "x", sprite }, 5000).scale).toBeCloseTo(3.8);
  });
});

describe("describeTimelineItem", () => {
  test("outil d'édition avec diff", () => {
    const activity = describeTimelineItem({
      type: "tool_call", callId: "1", name: "edit", status: "running", filePath: "/a/b/index.ts", diff: "--- a\n+++ b\n+x\n+y\n-z",
    });
    expect(activity).toMatchObject({ state: "working", file: "/a/b/index.ts", additions: 2, deletions: 1 });
    expect(bubbleLines(activity!)).toEqual({ primary: "index.ts", secondary: "+2 −1" });
  });
  test("commande shell", () => {
    const activity = describeTimelineItem({ type: "tool_call", callId: "2", name: "bash", status: "running", input: { command: "bun test" } });
    expect(bubbleLines(activity!).primary).toBe("$ bun test");
  });
  test("lecture = réflexion ; todo ignoré", () => {
    expect(describeTimelineItem({ type: "tool_call", callId: "3", name: "read_file", status: "running" })?.state).toBe("thinking");
    expect(describeTimelineItem({ type: "todo", items: [] })).toBeNull();
  });
  test("countDiff", () => {
    expect(countDiff(undefined)).toBeUndefined();
    expect(countDiff("context only")).toBeUndefined();
  });
});

describe("reserveStations", () => {
  test("regroupe les agents par hôte dans des tranches contiguës", () => {
    const agents = [
      { id: "a1", activityState: "working" as const, hostId: "local" },
      { id: "a2", activityState: "working" as const, hostId: "unraid" },
      { id: "a3", activityState: "working" as const, hostId: "local" },
    ];
    const result = reserveStations(agents, map, new Map());
    expect(result.get("a1")!.point.x).toBeLessThan(0.5);
    expect(result.get("a3")!.point.x).toBeLessThan(0.5);
    expect(result.get("a2")!.point.x).toBeGreaterThan(0.5);
  });
  test("respecte les zones explicites", () => {
    const zoned: SceneMap = { ...map, zones: [{ id: "z", hostId: "unraid", x0: 0.7, y0: 0, x1: 1, y1: 0.3 }] };
    const result = reserveStations([{ id: "u", activityState: "working", hostId: "unraid" }], zoned, new Map());
    expect(result.get("u")!.point.x).toBeGreaterThan(0.7);
  });
  test("réutilise la station courante (pas de saut)", () => {
    const result = reserveStations([{ id: "a", activityState: "working", hostId: "local" }], map, new Map([["a", { x: 0.9, y: 0.1, stationKey: "working:3" }]]));
    expect(result.get("a")!.key).toBe("working:3");
  });
  test("débordement quand tout est occupé", () => {
    const agents = Array.from({ length: 3 }, (_, i) => ({ id: `i${i}`, activityState: "idle" as const, hostId: "local" }));
    const result = reserveStations(agents, map, new Map());
    expect(result.size).toBe(3);
    expect([...result.values()].filter((entry) => entry.key.includes("overflow"))).toHaveLength(2);
  });
});

describe("zones & chemins", () => {
  test("hostOrder met local en premier", () => {
    expect(hostOrder(["unraid", "local", "hermes"])).toEqual(["local", "hermes", "unraid"]);
  });
  test("aucune zone dérivée avec un seul hôte", () => {
    expect(hostZoneRects(map, ["local"])).toEqual([]);
    expect(hostZoneRects(map, ["local", "unraid"])).toHaveLength(2);
  });
  test("waypoints seulement lors d'un changement de niveau", () => {
    const waypoints = [{ x: 0.5, y: 0.4 }, { x: 0.6, y: 0.6 }];
    const target = { x: 0.1, y: 0.1 };
    expect(transitionPath({ x: 0.6, y: 0.7, activityState: "idle" }, target, "working", waypoints)).toHaveLength(3);
    expect(transitionPath({ x: 0.6, y: 0.7, activityState: "working" }, target, "thinking", waypoints)).toEqual([target]);
  });
});

describe("postes orientés & Grab & Drop", () => {
  const seats: SceneMap = { ...map, positions: { ...map.positions, working: [
    { x: 0.2, y: 0.2, facing: "up" }, { x: 0.25, y: 0.2, facing: "left" }, { x: 0.8, y: 0.2 },
  ] } };
  test("rotateFacing fait le tour complet", () => {
    expect(rotateFacing(undefined)).toBe("down");
    expect([rotateFacing("down"), rotateFacing("left"), rotateFacing("up"), rotateFacing("right")]).toEqual(["left", "up", "right", "down"]);
  });
  test("l'orientation du poste est transmise à l'agent", () => {
    const result = reserveStations([{ id: "a", activityState: "working", hostId: "local" }], seats, new Map([["a", { x: 0.2, y: 0.2, stationKey: "working:0" }]]));
    expect(result.get("a")!.facing).toBe("up");
  });
  test("poste libre le plus proche, seulement à portée", () => {
    expect(nearestFreeSeat(seats, { x: 0.24, y: 0.2 }, new Set())?.key).toBe("working:1");
    expect(nearestFreeSeat(seats, { x: 0.24, y: 0.2 }, new Set(["working:1"]))?.key).toBe("working:0");
    expect(nearestFreeSeat(seats, { x: 0.5, y: 0.5 }, new Set())).toBeNull();
  });
  test("un poste épinglé est prioritaire et réservé", () => {
    const agents = [
      { id: "a", activityState: "working" as const, hostId: "local" },
      { id: "b", activityState: "working" as const, hostId: "local" },
    ];
    const pin = { key: "working:2", point: seats.positions.working[2]! };
    const result = reserveStations(agents, seats, new Map([["b", { x: 0.8, y: 0.2, stationKey: "working:2", pin }]]));
    expect(result.get("b")!.key).toBe("working:2");
    expect(result.get("a")!.key).not.toBe("working:2");
  });
});

describe("pickCharacter", () => {
  const list = [
    { name: "Alice", agentId: "a1" },
    { name: "Hôte", hostId: "unraid" },
    { name: "Pool A", shared: true },
    { name: "Pool B", shared: true },
  ];
  test("agent dédié d'abord, puis hôte, puis pool partagé stable", () => {
    expect(pickCharacter(list, "a1", "Zed")?.name).toBe("Alice");
    expect(pickCharacter(list, "x", "Zed", "unraid")?.name).toBe("Hôte");
    const first = pickCharacter(list, "x", "Zed", "local");
    expect(first?.name).toMatch(/Pool/);
    expect(pickCharacter(list, "x", "Zed", "local")).toBe(first);
  });
  test("sans correspondance ni pool : aucun visuel personnalisé", () => {
    expect(pickCharacter([{ name: "Hôte", hostId: "unraid" }], "x", "Zed", "local")).toBeUndefined();
  });
});

describe("walkFacing (quadrants isométriques + hystérésis)", () => {
  test("une ligne de sprite par quadrant", () => {
    expect(walkFacing(-0.01, 0.01, "down")).toBe("down");
    expect(walkFacing(-0.01, -0.01, "down")).toBe("left");
    expect(walkFacing(0.01, 0.01, "down")).toBe("right");
    expect(walkFacing(0.01, -0.01, "down")).toBe("up");
  });
  test("trajet quasi vertical : la ligne ne bascule pas", () => {
    expect(walkFacing(0.0004, 0.02, "down")).toBe("down"); // reste ↙
    expect(walkFacing(-0.0004, 0.02, "right")).toBe("right"); // reste ↘
    expect(walkFacing(-0.0004, -0.02, "up")).toBe("up");
  });
  test("immobile : garde la direction", () => {
    expect(walkFacing(0, 0, "left")).toBe("left");
  });
});

describe("un personnage par décor", () => {
  const list = [
    { name: "Costume", shared: true, maps: ["severance-mdr"] },
    { name: "Partout", agentId: "dev" },
  ];
  test("le personnage du décor s'applique seulement sur ce décor", () => {
    expect(pickCharacter(list, "x", "Zed", "local", "severance-mdr")?.name).toBe("Costume");
    expect(pickCharacter(list, "x", "Zed", "local", "monument-citadelle")).toBeUndefined(); // design d'origine
  });
  test("un personnage sans décor précisé reste valable partout", () => {
    expect(pickCharacter(list, "dev", "Dev", "local", "monument-citadelle")?.name).toBe("Partout");
  });
});
