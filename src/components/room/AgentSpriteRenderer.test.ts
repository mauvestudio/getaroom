import { describe, expect, test } from "bun:test";
import { spriteFrame } from "./AgentSpriteRenderer";

describe("spriteFrame — grille universelle 4 × 4", () => {
  test("idle = colonne 0, ligne selon l'orientation", () => {
    expect(spriteFrame("idle", "down", 0)).toEqual({ row: 0, col: 0, jitter: 0 });
    expect(spriteFrame("idle", "left", 0).row).toBe(1);
    expect(spriteFrame("idle", "right", 0).row).toBe(2);
    expect(spriteFrame("idle", "up", 0).row).toBe(3);
  });
  test("marche : cycle idle → walk_1 → idle → walk_2 toutes les 150 ms", () => {
    const cols = [0, 150, 300, 450, 600, 750].map((time) => spriteFrame("walking", "down", time).col);
    expect(cols).toEqual([0, 1, 0, 2, 0, 1]);
    expect(spriteFrame("walking", "up", 160).row).toBe(3);
  });
  test("assis = colonne 3 sur la ligne du bureau, frappe ±1 px toutes les 180 ms", () => {
    expect(spriteFrame("sitting", "down", 0)).toEqual({ row: 0, col: 3, jitter: 1 });
    expect(spriteFrame("sitting", "right", 0)).toEqual({ row: 2, col: 3, jitter: 1 });
    expect(spriteFrame("sitting", "left", 200)).toEqual({ row: 1, col: 3, jitter: -1 });
    expect(spriteFrame("sitting", "left", 400).jitter).toBe(1);
  });
  test("assis ↗ : jamais la pose « attrapé » (ligne 3, col 3) — assise ↖ en miroir", () => {
    const frame = spriteFrame("sitting", "up", 0);
    expect(frame).toMatchObject({ row: 1, col: 3, flip: true });
    expect(frame.row === 3 && frame.col === 3).toBe(false);
    for (const facing of ["down", "left", "right", "up"] as const) {
      const f = spriteFrame("sitting", facing, 0);
      expect(f.row === 3 && f.col === 3).toBe(false);
    }
  });
  test("grabbed = ligne 3, colonne 3, quelle que soit l'orientation", () => {
    expect(spriteFrame("grabbed", "down", 0)).toEqual({ row: 3, col: 3, jitter: 0 });
    expect(spriteFrame("grabbed", "left", 999)).toEqual({ row: 3, col: 3, jitter: 0 });
  });
  test("working / thinking / alert restent en idle (pas de frame assise hors poste)", () => {
    for (const state of ["working", "thinking", "alert", "done"] as const) expect(spriteFrame(state, "down", 0).col).toBe(0);
  });
});
