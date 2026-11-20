import { describe, expect, test } from "bun:test";
import { hasTransparentEdges, removeBackground, type PixelBuffer } from "./chroma-key";

function image(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(fill(x, y), (y * width + x) * 4);
  return { data, width, height };
}
const alpha = (b: PixelBuffer, x: number, y: number) => b.data[(y * b.width + x) * 4 + 3]!;
const px = (b: PixelBuffer, x: number, y: number) => [...b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4)];
const GREEN: [number, number, number, number] = [10, 200, 10, 255];
const RED: [number, number, number, number] = [200, 30, 30, 255];

describe("removeBackground (flood-fill par cellule + de-fringe)", () => {
  test("retire le fond uni, garde le personnage", () => {
    const b = image(8, 8, (x, y) => x >= 3 && x <= 4 && y >= 3 && y <= 4 ? RED : GREEN);
    expect(removeBackground(b, { grid: 1 })).toMatchObject({ applied: true, background: [10, 200, 10] });
    expect(alpha(b, 0, 0)).toBe(0);
    expect(alpha(b, 7, 7)).toBe(0);
    expect(alpha(b, 3, 3)).toBe(255);
  });

  test("tolérance par défaut 48 : retire les pixels proches du fond, garde ceux au-delà", () => {
    const b = image(8, 8, (x) => x === 1 ? [10 + 45, 200, 10, 255] : x === 6 ? [10 + 60, 200, 10, 255] : GREEN);
    removeBackground(b, { grid: 1 });
    expect(alpha(b, 1, 4)).toBe(0); // Δ = 45 ≤ 48
    expect(alpha(b, 6, 4)).toBeGreaterThan(0); // Δ = 60 > 48 : reste (de-fringe partiel)
  });

  test("conserve le blanc enfermé dans le personnage (flood-fill, pas de seuillage global)", () => {
    const WHITE: [number, number, number, number] = [255, 255, 255, 255];
    const b = image(9, 9, (x, y) => {
      const ring = x >= 2 && x <= 6 && y >= 2 && y <= 6 && (x === 2 || x === 6 || y === 2 || y === 6);
      return ring ? RED : x === 4 && y === 4 ? WHITE : [255, 255, 255, 255];
    });
    removeBackground(b, { grid: 1 });
    expect(alpha(b, 4, 4)).toBe(255); // chemise blanche à l'intérieur : intacte
    expect(alpha(b, 0, 4)).toBe(0);
  });

  test("traite chaque cellule séparément (flood-fill depuis les bords de la cellule)", () => {
    // 2 cellules 8 px : fond vert à gauche, fond bleu à droite
    const b = image(16, 8, (x, y) => {
      if (x === 4 && y === 4) return RED;
      if (x === 12 && y === 4) return RED;
      return x < 8 ? GREEN : [10, 10, 200, 255];
    });
    removeBackground(b, { grid: 2 });
    expect(alpha(b, 0, 0)).toBe(0);
    expect(alpha(b, 15, 7)).toBe(0);
    expect(alpha(b, 4, 4)).toBe(255);
    expect(alpha(b, 12, 4)).toBe(255);
  });

  test("de-fringe : alpha réduit près du fond et teinte verte neutralisée", () => {
    // pixel « halo » vert clair juste au-delà de la tolérance, adjacent au fond
    const halo: [number, number, number, number] = [60, 220, 40, 255]; // Δ ≈ 64 du fond [10,200,10]
    const b = image(8, 8, (x, y) => x === 3 && y === 3 ? halo : x === 4 && y === 3 ? RED : GREEN);
    removeBackground(b, { grid: 1 });
    const [r, g, bl, a] = px(b, 3, 3) as number[];
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
    expect(g).toBeLessThanOrEqual(Math.max(r!, bl!)); // plus de dominante verte
  });

  test("ne touche pas une image qui a déjà de la transparence sur ses bords", () => {
    const b = image(4, 4, (x, y) => x === 0 && y === 0 ? [0, 0, 0, 0] : [50, 50, 50, 255]);
    expect(hasTransparentEdges(b)).toBe(true);
    expect(removeBackground(b)).toEqual({ applied: false, reason: "has-alpha" });
    expect(alpha(b, 2, 2)).toBe(255);
  });
});
