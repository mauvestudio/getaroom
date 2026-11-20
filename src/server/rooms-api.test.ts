import { expect, test } from "bun:test";
import { validateRoomMap } from "./rooms-api";

const base = { id: "demo", name: "Demo", positions: { working: [], thinking: [], idle: [] } };

test("room.json : sprite et zones validés, valeurs hors bornes ignorées", () => {
  const map = validateRoomMap({
    ...base,
    sprite: { style: "monochrome", scale: 1.5, referenceHeight: 900, evil: true },
    zones: [
      { id: "u", hostId: "unraid", label: "Unraid", x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.5 },
      { hostId: "x", x0: 2, y0: 0, x1: 1, y1: 1 },
    ],
  });
  expect(map.sprite).toEqual({ style: "monochrome", scale: 1.5, referenceHeight: 900 });
  expect(map.zones).toHaveLength(1);
  expect(map.zones![0]!.hostId).toBe("unraid");
});

test("room.json historique (sans sprite ni zones) reste valide", () => {
  const map = validateRoomMap(base);
  expect(map.sprite).toBeUndefined();
  expect(map.zones).toBeUndefined();
});

test("facing des postes validé, champs inconnus écartés", () => {
  const map = validateRoomMap({ ...base, positions: { working: [{ x: 0.1, y: 0.2, facing: "left", evil: 1 }, { x: 0.3, y: 0.3, facing: "sideways" }], thinking: [], idle: [] } });
  expect(map.positions.working).toEqual([{ x: 0.1, y: 0.2, facing: "left" }, { x: 0.3, y: 0.3 }]);
});

test("groundOffset validé et borné", () => {
  expect(validateRoomMap({ ...base, sprite: { groundOffset: 0.05 } }).sprite).toEqual({ groundOffset: 0.05 });
  expect(validateRoomMap({ ...base, sprite: { groundOffset: 2 } }).sprite).toBeUndefined();
});

test("sprite invalide ignoré", () => {
  expect(validateRoomMap({ ...base, sprite: { scale: -3, style: "neon" } }).sprite).toBeUndefined();
});
