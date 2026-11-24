import { describe, expect, test } from "bun:test";
import { distanceFromBottom, nextPinned } from "./scroll-pin";

const sample = (scrollTop: number, scrollHeight = 2000, clientHeight = 600) => ({ scrollTop, scrollHeight, clientHeight });
const BOTTOM = 2000 - 600;

describe("règle de collage en bas", () => {
  test("distance au bas", () => {
    expect(distanceFromBottom(sample(BOTTOM))).toBe(0);
    expect(distanceFromBottom(sample(BOTTOM - 30))).toBe(30);
  });
  test("remonter de 30 px décolle immédiatement (ancienne zone morte < 50 px)", () => {
    expect(nextPinned(true, BOTTOM, sample(BOTTOM - 30))).toBe(false);
  });
  test("remonter de 80 px décolle aussi (ancienne zone morte 50-100 px)", () => {
    expect(nextPinned(true, BOTTOM, sample(BOTTOM - 80))).toBe(false);
  });
  test("une fois décollé, descendre sans atteindre le bas ne recolle pas", () => {
    expect(nextPinned(false, BOTTOM - 300, sample(BOTTOM - 100))).toBe(false);
  });
  test("revenir en bas recolle", () => {
    expect(nextPinned(false, BOTTOM - 100, sample(BOTTOM - 4))).toBe(true);
    expect(nextPinned(false, BOTTOM - 100, sample(BOTTOM))).toBe(true);
  });
  test("le contenu qui raccourcit ramène scrollTop vers le haut mais reste en bas : toujours collé", () => {
    expect(nextPinned(true, BOTTOM, sample(BOTTOM - 120, 1880))).toBe(true);
  });
  test("du contenu ajouté en dessous (scrollTop inchangé) ne décolle pas un utilisateur collé", () => {
    expect(nextPinned(true, BOTTOM, sample(BOTTOM, 2400))).toBe(true);
  });
  test("du contenu ajouté pendant qu'on lit plus haut ne recolle pas", () => {
    expect(nextPinned(false, BOTTOM - 500, sample(BOTTOM - 500, 2400))).toBe(false);
  });
});
