import { describe, expect, test } from "bun:test";
import { measureSheet, seatFrame } from "./sprite-metrics";

/** Image 2 × 2 cases de 20 px ; `paint(row, col, x, y)` renvoie vrai pour un pixel opaque. */
function sheet(paint: (row: number, col: number, x: number, y: number) => boolean) {
  const size = 40;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    if (paint(Math.floor(y / 20), Math.floor(x / 20), x % 20, y % 20)) data[(y * size + x) * 4 + 3] = 255;
  }
  return measureSheet(data, size, 2);
}

describe("measureSheet", () => {
  test("cadre du corps par case : pieds = bas réel de chaque case", () => {
    const m = sheet((row, _col, x, y) => x >= 6 && x < 14 && y >= 2 && y < (row === 0 ? 18 : 16));
    expect(m.cells[0]![0]).toEqual({ l: 0.3, r: 0.7, t: 0.1, b: 0.9 });
    expect(m.cells[1]![0]!.b).toBeCloseTo(0.8); // une autre ligne a ses pieds plus haut : mesurée séparément
  });

  test("ignore un débordement de la case voisine (main de la pose « attrapé »)", () => {
    const m = sheet((row, col, x, y) => {
      const body = x >= 6 && x < 14 && y >= 2 && y < 15;
      const strayHand = row === 0 && col === 1 && x >= 9 && x < 11 && y >= 18; // petit morceau collé au bas
      return body || strayHand;
    });
    expect(m.cells[0]![1]!.b).toBeCloseTo(0.75); // le bout de main (y ≥ 18) n'abaisse pas le cadre
  });

  test("garde un morceau détaché de taille comparable (ex. un bras séparé)", () => {
    const m = sheet((_row, _col, x, y) => (x >= 4 && x < 9 && y >= 2 && y < 18) || (x >= 11 && x < 16 && y >= 2 && y < 18));
    expect(m.cells[0]![0]!.l).toBeCloseTo(0.2);
    expect(m.cells[0]![0]!.r).toBeCloseTo(0.8);
  });

  test("case vide : cadre plein", () => {
    const m = sheet(() => false);
    expect(m.cells[0]![0]).toEqual({ l: 0, r: 1, t: 0, b: 1 });
  });
});

describe("sens du regard des poses assises", () => {
  test("mesure : corps décalé à droite de la tête = regard vers la droite", () => {
    // tête en haut à gauche, jambes/bras qui partent vers la droite
    const m = sheet((_row, _col, x, y) => (y >= 2 && y < 6 && x >= 5 && x < 9) || (y >= 6 && y < 16 && x >= 5 && x < 17));
    expect(m.lean[0]![0]!).toBeGreaterThan(0.1);
    const mirrored = sheet((_row, _col, x, y) => (y >= 2 && y < 6 && x >= 11 && x < 15) || (y >= 6 && y < 16 && x >= 3 && x < 15));
    expect(mirrored.lean[0]![0]!).toBeLessThan(-0.1);
  });

  // Feuille de l'utilisateur : assise ligne 0 et ligne 2 regardent toutes deux à droite, ligne 1 (dos) à gauche.
  const sheetLike = { lean: [[0, 0, 0, 0.2], [0, 0, 0, -0.2], [0, 0, 0, 0.2], [0, 0, 0, 0]] };
  test("↙ (face-gauche) absente de la feuille : pose de face retournée en miroir", () => {
    expect(seatFrame(sheetLike, "down")).toEqual({ row: 0, flip: true });
  });
  test("↘ face-droite et ↖ dos-gauche : poses de la feuille telles quelles", () => {
    expect(seatFrame(sheetLike, "right")).toEqual({ row: 2, flip: false });
    expect(seatFrame(sheetLike, "left")).toEqual({ row: 1, flip: false });
  });
  test("↗ dos-droite : dos-gauche en miroir, jamais la pose « attrapé »", () => {
    expect(seatFrame(sheetLike, "up")).toEqual({ row: 1, flip: true });
  });
  test("feuille « idéale » (↙ regarde à gauche) : aucun miroir", () => {
    const ideal = { lean: [[0, 0, 0, -0.2], [0, 0, 0, -0.2], [0, 0, 0, 0.2], [0, 0, 0, 0]] };
    expect(seatFrame(ideal, "down")).toEqual({ row: 0, flip: false });
    expect(seatFrame(ideal, "right")).toEqual({ row: 2, flip: false });
  });
});
