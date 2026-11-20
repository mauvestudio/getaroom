// Mesure d'une sprite sheet 4 × 4 (pur, sans DOM : testable).
//
// Pour chaque case, on ne garde que le CORPS du personnage (plus grande composante connexe, plus les
// morceaux de taille comparable). Les débordements d'une case voisine — par exemple la main de la pose
// « attrapé » qui remonte dans la case du dessus — sont ignorés, et le dessin est découpé à ce cadre.

export interface CellBox { l: number; r: number; t: number; b: number }

export interface SheetMetrics {
  /** Cadre du corps de chaque case, en fraction de la case. */
  cells: CellBox[][];
  /** Hauteur du personnage debout (fraction de case) : sert à l'échelle. */
  standingHeight: number;
  /** Centre horizontal du corps par ligne (moyenne idle / marche) : le sprite ne « danse » pas en marchant. */
  rowCenter: number[];
  /**
   * Sens du regard détecté par case : > 0 = tourné vers la droite, < 0 = vers la gauche, ≈ 0 = de face/dos.
   * Mesuré comme l'écart entre le centre de masse du corps et le centre de la tête (bras et jambes
   * d'une pose assise partent vers l'avant).
   */
  lean: number[][];
}

const FULL: CellBox = { l: 0, r: 1, t: 0, b: 1 };
const ALPHA_MIN = 24;
/** Un morceau détaché est gardé s'il pèse au moins cette fraction du corps principal. */
const KEEP_RATIO = 0.2;

/**
 * @param rgba pixels RGBA d'une image carrée `size × size` contenant la grille `grid × grid`.
 */
export function measureSheet(rgba: Uint8ClampedArray, size: number, grid = 4): SheetMetrics {
  const cellSize = Math.floor(size / grid);
  const cells: CellBox[][] = [];
  const lean: number[][] = [];
  const label = new Int32Array(cellSize * cellSize);

  for (let row = 0; row < grid; row += 1) {
    const line: CellBox[] = [];
    const leanLine: number[] = [];
    for (let col = 0; col < grid; col += 1) {
      label.fill(0);
      const opaque = (x: number, y: number) => rgba[((row * cellSize + y) * size + col * cellSize + x) * 4 + 3]! > ALPHA_MIN;
      const components: Array<{ count: number; l: number; r: number; t: number; b: number }> = [];
      for (let y = 0; y < cellSize; y += 1) {
        for (let x = 0; x < cellSize; x += 1) {
          if (label[y * cellSize + x] || !opaque(x, y)) continue;
          const id = components.length + 1;
          const box = { count: 0, l: x, r: x, t: y, b: y };
          const stack = [y * cellSize + x];
          label[y * cellSize + x] = id;
          while (stack.length) {
            const index = stack.pop()!;
            const px = index % cellSize;
            const py = (index - px) / cellSize;
            box.count += 1;
            if (px < box.l) box.l = px; if (px > box.r) box.r = px;
            if (py < box.t) box.t = py; if (py > box.b) box.b = py;
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                const nx = px + dx;
                const ny = py + dy;
                if (nx < 0 || ny < 0 || nx >= cellSize || ny >= cellSize) continue;
                const next = ny * cellSize + nx;
                if (!label[next] && opaque(nx, ny)) { label[next] = id; stack.push(next); }
              }
            }
          }
          components.push(box);
        }
      }
      if (!components.length) { line.push(FULL); leanLine.push(0); continue; }
      const main = components.reduce((best, entry) => entry.count > best.count ? entry : best);
      const kept = components.filter((entry) => entry === main || entry.count >= main.count * KEEP_RATIO);
      const l = Math.min(...kept.map((entry) => entry.l));
      const r = Math.max(...kept.map((entry) => entry.r)) + 1;
      const t = Math.min(...kept.map((entry) => entry.t));
      const b = Math.max(...kept.map((entry) => entry.b)) + 1;
      line.push({ l: l / cellSize, r: r / cellSize, t: t / cellSize, b: b / cellSize });

      // Sens du regard : centre de masse du corps comparé au centre de la tête (haut du cadre).
      const keptIds = new Set(kept.map((entry) => components.indexOf(entry) + 1));
      const headLimit = t + (b - t) * 0.22;
      let sumX = 0, count = 0, headX = 0, headCount = 0;
      for (let y = t; y < b; y += 1) {
        for (let x = l; x < r; x += 1) {
          if (!keptIds.has(label[y * cellSize + x]!)) continue;
          sumX += x; count += 1;
          if (y <= headLimit) { headX += x; headCount += 1; }
        }
      }
      leanLine.push(count && headCount ? (sumX / count - headX / headCount) / Math.max(1, r - l) : 0);
    }
    cells.push(line);
    lean.push(leanLine);
  }

  const standing = cells.flatMap((line) => line.slice(0, 3));
  const standingHeight = Math.max(0.2, ...standing.map((box) => box.b - box.t));
  const rowCenter = cells.map((line) => line.slice(0, 3).reduce((sum, box) => sum + (box.l + box.r) / 2, 0) / 3);
  return { cells, standingHeight, rowCenter, lean };
}

export type SeatFacing = "down" | "left" | "right" | "up";
/** En dessous de cet écart, une pose est considérée sans sens net : on fait confiance à la feuille. */
const LEAN_EPSILON = 0.03;

/**
 * Pose assise à utiliser pour une orientation de poste (diagonales isométriques) :
 * ↙ down = face-gauche, ↘ right = face-droite, ↖ left = dos-gauche, ↗ up = dos-droite.
 * Les poses assises sont en colonne 3 des lignes 0 à 2 (ligne 3, col 3 = « attrapé », jamais utilisée).
 * On prend une pose de face (lignes 0/2) ou de dos (ligne 1) qui regarde du bon côté ; sinon on retourne en miroir.
 */
export function seatFrame(metrics: Pick<SheetMetrics, "lean">, facing: SeatFacing): { row: number; flip: boolean } {
  const front = facing === "down" || facing === "right";
  const wantRight = facing === "right" || facing === "up";
  const preferred = { down: 0, left: 1, right: 2, up: 3 }[facing];
  const rows = (front ? [0, 2] : [1]).sort((a, b) => Number(b === preferred) - Number(a === preferred));
  for (const row of rows) {
    const value = metrics.lean[row]?.[3] ?? 0;
    if (Math.abs(value) < LEAN_EPSILON) return { row, flip: false };
    if ((value > 0) === wantRight) return { row, flip: false };
  }
  return { row: rows[0]!, flip: true };
}
