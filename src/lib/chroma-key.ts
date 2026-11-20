// Détourage automatique du fond d'une sprite sheet (pur, sans DOM : testable).
//
// Pour chaque cellule de la grille (4 × 4 par défaut) : flood-fill depuis les 4 bords de la cellule
// (tolérance = distance euclidienne RGB), puis de-fringe de 1 px : les pixels voisins du fond perdent
// de l'alpha proportionnellement à leur proximité avec la couleur de fond, et la teinte résiduelle du
// fond (vert chroma-key…) est neutralisée.

export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ChromaOptions {
  /** Distance RGB maximale (≤) au fond pour qu'un pixel connecté au bord de sa cellule soit retiré. */
  tolerance?: number;
  /** Découpage en cellules : 4 → grille 4 × 4 (1 = image entière). */
  grid?: number;
}

export interface ChromaResult {
  applied: boolean;
  background?: [number, number, number];
  reason?: "has-alpha" | "empty";
}

export const DEFAULT_TOLERANCE = 48;
const EDGE_ALPHA = 250;

/** Vrai si un pixel du pourtour est déjà (semi-)transparent : l'image a son propre canal alpha. */
export function hasTransparentEdges({ data, width, height }: PixelBuffer): boolean {
  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3]!;
  for (let x = 0; x < width; x += 1) {
    if (alphaAt(x, 0) < EDGE_ALPHA || alphaAt(x, height - 1) < EDGE_ALPHA) return true;
  }
  for (let y = 0; y < height; y += 1) {
    if (alphaAt(0, y) < EDGE_ALPHA || alphaAt(width - 1, y) < EDGE_ALPHA) return true;
  }
  return false;
}

type Rgb = [number, number, number];
const rgbDistance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Fond d'une cellule : le coin partagé par le plus d'autres coins (robuste si un coin touche le sprite). */
function cellBackground(data: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number, tolerance: number): Rgb {
  const at = (x: number, y: number): Rgb => {
    const i = (y * width + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
  const corners = [at(x0, y0), at(x1 - 1, y0), at(x0, y1 - 1), at(x1 - 1, y1 - 1)];
  let best = corners[0]!;
  let bestVotes = -1;
  for (const candidate of corners) {
    const votes = corners.filter((other) => rgbDistance(candidate, other) <= tolerance).length;
    if (votes > bestVotes) { best = candidate; bestVotes = votes; }
  }
  return best;
}

/** Canal dominant d'une teinte saturée (vert d'un chroma-key…), ou -1 si le fond est neutre. */
function dominantChannel(color: Rgb): number {
  const sorted = [0, 1, 2].sort((a, b) => color[b]! - color[a]!);
  const top = sorted[0]!;
  const second = sorted[1]!;
  return color[top]! - color[second]! >= 30 ? top : -1;
}

export function removeBackground(buffer: PixelBuffer, options: ChromaOptions = {}): ChromaResult {
  const { data, width, height } = buffer;
  if (width < 2 || height < 2) return { applied: false, reason: "empty" };
  if (hasTransparentEdges(buffer)) return { applied: false, reason: "has-alpha" };

  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const grid = Math.max(1, Math.min(options.grid ?? 4, width, height));
  const removed = new Uint8Array(width * height);
  let firstBackground: Rgb | undefined;
  let cleared = 0;

  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      const x0 = Math.floor((col * width) / grid);
      const x1 = Math.floor(((col + 1) * width) / grid);
      const y0 = Math.floor((row * height) / grid);
      const y1 = Math.floor(((row + 1) * height) / grid);
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;

      const bg = cellBackground(data, width, x0, y0, x1, y1, tolerance);
      firstBackground ??= bg;
      const colorAt = (index: number): Rgb => [data[index * 4]!, data[index * 4 + 1]!, data[index * 4 + 2]!];
      const distanceAt = (index: number) => rgbDistance(colorAt(index), bg);

      // 1) Flood-fill depuis les 4 bords de la cellule.
      const stack: number[] = [];
      const push = (x: number, y: number) => {
        const index = y * width + x;
        if (removed[index] || distanceAt(index) > tolerance) return;
        removed[index] = 1;
        stack.push(index);
      };
      for (let x = x0; x < x1; x += 1) { push(x, y0); push(x, y1 - 1); }
      for (let y = y0; y < y1; y += 1) { push(x0, y); push(x1 - 1, y); }
      while (stack.length) {
        const index = stack.pop()!;
        const x = index % width;
        const y = (index - x) / width;
        if (x > x0) push(x - 1, y);
        if (x < x1 - 1) push(x + 1, y);
        if (y > y0) push(x, y - 1);
        if (y < y1 - 1) push(x, y + 1);
      }

      // 2) De-fringe : couronnes de 1 px (alpha) et 2 px (teinte) autour du fond retiré.
      const touchesRemoved = (x: number, y: number, mask: Uint8Array) => {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if ((dx || dy) && nx >= x0 && nx < x1 && ny >= y0 && ny < y1 && mask[ny * width + nx]) return true;
          }
        }
        return false;
      };
      const ring1: number[] = [];
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = y * width + x;
          if (!removed[index] && touchesRemoved(x, y, removed)) ring1.push(index);
        }
      }
      const inRing1 = new Uint8Array(width * height);
      for (const index of ring1) inRing1[index] = 1;
      const ring2: number[] = [];
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = y * width + x;
          if (!removed[index] && !inRing1[index] && touchesRemoved(x, y, inRing1)) ring2.push(index);
        }
      }

      const channel = dominantChannel(bg);
      const despill = (index: number) => {
        if (channel < 0) return;
        const others = [0, 1, 2].filter((c) => c !== channel).map((c) => data[index * 4 + c]!);
        const cap = Math.max(...others);
        if (data[index * 4 + channel]! > cap) data[index * 4 + channel] = cap;
      };
      for (const index of ring1) {
        // Plus le pixel ressemble au fond, plus il devient transparent (opaque à partir de 2 × tolérance).
        const ratio = Math.max(0, Math.min(1, distanceAt(index) / (tolerance * 2)));
        data[index * 4 + 3] = Math.round(data[index * 4 + 3]! * ratio);
        despill(index);
      }
      for (const index of ring2) despill(index);

      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const index = y * width + x;
          if (removed[index]) { data[index * 4 + 3] = 0; cleared += 1; }
        }
      }
    }
  }
  return cleared && firstBackground ? { applied: true, background: firstBackground } : { applied: false, reason: "empty" };
}
