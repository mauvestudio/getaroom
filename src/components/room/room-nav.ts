// Navigation de The Room (logique pure, sans React ni Canvas) : les personnages contournent les objets solides
// et restent sur le sol du décor au lieu de traverser en ligne droite.
//
// Modèle : des polygones « sol » (zones praticables) et « solides » (meubles, murs), en coordonnées normalisées
// (0-1, comme les postes). Ils sont rastérisés sur une grille aux cellules carrées en pixels (l'image est
// rectangulaire : une cellule normalisée ne serait pas carrée), puis érodés par l'empreinte d'un pied
// (ellipse aplatie, vue isométrique) pour que le centre du personnage ne frôle jamais un meuble.
// Chemin : A* à 8 voisins sans coupe de coin, puis lissage par ligne de vue (trajets droits quand c'est permis).
import type { Point } from "./room-scene";

export type Polygon = Point[];
export interface NavData {
  /** Zones praticables. Absentes = tout le décor est praticable. */
  floors?: Polygon[];
  /** Objets infranchissables, retranchés des zones praticables. */
  solids?: Polygon[];
}

export interface NavGrid {
  cols: number;
  rows: number;
  /** Rapport largeur/hauteur de l'image (sert aux distances et au tracé). */
  aspect: number;
  /** 1 = le centre d'un personnage peut s'y trouver (déjà érodé par l'empreinte). */
  walkable: Uint8Array;
}

export const NAV_COLS = 200;
/** Demi-empreinte d'un pied, en cellules : plus large que haut (perspective isométrique). */
export const FOOTPRINT = { rx: 2, ry: 1 } as const;

const MAX_POLYGONS = 64;
const MAX_POINTS = 128;

export const hasNavigation = (nav: NavData | undefined): nav is NavData =>
  Boolean(nav && ((nav.floors?.length ?? 0) > 0 || (nav.solids?.length ?? 0) > 0));

/** Polygone valide : au moins 3 points dans [0,1]. */
export function cleanPolygons(value: unknown): Polygon[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_POLYGONS).flatMap((polygon): Polygon[] => {
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > MAX_POINTS) return [];
    const points = polygon.map((point) => ({ x: Number((point as Point)?.x), y: Number((point as Point)?.y) }));
    const valid = points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1);
    return valid ? [points.map((point) => ({ x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000 }))] : [];
  });
}

export function cleanNav(value: unknown): NavData | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const floors = cleanPolygons(raw.floors);
  const solids = cleanPolygons(raw.solids);
  if (!floors.length && !solids.length) return undefined;
  return { ...(floors.length ? { floors } : {}), ...(solids.length ? { solids } : {}) };
}

/** Point dans un polygone (règle pair/impair). */
export function pointInPolygon(point: Point, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Régions praticables de moins de cette taille (cellules) : poches fermées du contour, supprimées. */
export const MIN_REGION_CELLS = 40;

export function buildNavGrid(nav: NavData | undefined, aspect: number, cols = NAV_COLS): NavGrid | null {
  if (!hasNavigation(nav)) return null;
  const safeAspect = Number.isFinite(aspect) && aspect > 0.2 && aspect < 8 ? aspect : 16 / 9;
  const rows = Math.max(8, Math.round(cols / safeAspect));
  const floors = nav.floors ?? [];
  const solids = nav.solids ?? [];
  const total = cols * rows;
  const onFloor = new Uint8Array(total);
  const onSolid = new Uint8Array(total);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const center = { x: (col + 0.5) / cols, y: (row + 0.5) / rows };
      const key = row * cols + col;
      onFloor[key] = floors.length === 0 || floors.some((polygon) => pointInPolygon(center, polygon)) ? 1 : 0;
      onSolid[key] = solids.some((polygon) => pointInPolygon(center, polygon)) ? 1 : 0;
    }
  }
  // L'empreinte du pied écarte le centre du personnage des SOLIDES (jamais collé à un meuble). Le bord du sol, lui,
  // ne perd qu'une cellule : sinon les plateaux et escaliers étroits disparaîtraient de la grille.
  const offsets: Array<[number, number]> = [];
  for (let dy = -FOOTPRINT.ry; dy <= FOOTPRINT.ry; dy += 1) {
    for (let dx = -FOOTPRINT.rx; dx <= FOOTPRINT.rx; dx += 1) {
      if ((dx / FOOTPRINT.rx) ** 2 + (dy / FOOTPRINT.ry) ** 2 <= 1) offsets.push([dx, dy]);
    }
  }
  const walkable = new Uint8Array(total);
  const at = (col: number, row: number, layer: Uint8Array) => col >= 0 && row >= 0 && col < cols && row < rows && layer[row * cols + col] === 1;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!onFloor[row * cols + col] || onSolid[row * cols + col]) continue;
      if (offsets.some(([dx, dy]) => at(col + dx, row + dy, onSolid))) continue;
      // Marge d'une cellule au bord du sol (et au bord de l'image).
      if (floors.length > 0 && !(at(col - 1, row, onFloor) && at(col + 1, row, onFloor) && at(col, row - 1, onFloor) && at(col, row + 1, onFloor))) continue;
      walkable[row * cols + col] = 1;
    }
  }
  const grid: NavGrid = { cols, rows, aspect: safeAspect, walkable };
  removeTinyRegions(grid, MIN_REGION_CELLS);
  return grid;
}

/** Supprime les régions praticables isolées trop petites pour être un vrai lieu (poches du contour). */
function removeTinyRegions(grid: NavGrid, minCells: number): void {
  const { cols, rows, walkable } = grid;
  const seen = new Uint8Array(cols * rows);
  for (let start = 0; start < walkable.length; start += 1) {
    if (!walkable[start] || seen[start]) continue;
    const members: number[] = [start];
    seen[start] = 1;
    for (let head = 0; head < members.length; head += 1) {
      const key = members[head]!;
      const col = key % cols;
      const row = (key / cols) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nc = col + dx;
          const nr = row + dy;
          if ((!dx && !dy) || nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const next = nr * cols + nc;
          if (walkable[next] && !seen[next]) { seen[next] = 1; members.push(next); }
        }
      }
    }
    if (members.length < minCells) for (const key of members) walkable[key] = 0;
  }
}

const cellOf = (grid: NavGrid, point: Point): { col: number; row: number } => ({
  col: Math.max(0, Math.min(grid.cols - 1, Math.floor(point.x * grid.cols))),
  row: Math.max(0, Math.min(grid.rows - 1, Math.floor(point.y * grid.rows))),
});
const centerOf = (grid: NavGrid, col: number, row: number): Point => ({ x: (col + 0.5) / grid.cols, y: (row + 0.5) / grid.rows });
const isFree = (grid: NavGrid, col: number, row: number) =>
  col >= 0 && row >= 0 && col < grid.cols && row < grid.rows && grid.walkable[row * grid.cols + col] === 1;

export function isWalkable(grid: NavGrid | null, point: Point): boolean {
  if (!grid) return true;
  const { col, row } = cellOf(grid, point);
  return isFree(grid, col, row);
}

/** Cellule praticable la plus proche (recherche en anneaux), ou `null` si le décor n'en a aucune. */
function nearestFreeCell(grid: NavGrid, point: Point): { col: number; row: number } | null {
  const start = cellOf(grid, point);
  if (isFree(grid, start.col, start.row)) return start;
  const maxRadius = Math.max(grid.cols, grid.rows);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    let best: { col: number; row: number; d: number } | null = null;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const col = start.col + dx;
        const row = start.row + dy;
        if (!isFree(grid, col, row)) continue;
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { col, row, d };
      }
    }
    if (best) return { col: best.col, row: best.row };
  }
  return null;
}

/** Position praticable la plus proche (un personnage lâché sur un meuble est replacé à côté). */
export function snapToWalkable(grid: NavGrid | null, point: Point): Point {
  if (!grid) return point;
  const own = cellOf(grid, point);
  if (isFree(grid, own.col, own.row)) return point;
  const cell = nearestFreeCell(grid, point);
  return cell ? centerOf(grid, cell.col, cell.row) : point;
}

/** Ligne de vue : tous les échantillons du segment tombent sur des cellules praticables. */
function lineOfSight(grid: NavGrid, a: Point, b: Point): boolean {
  const dx = (b.x - a.x) * grid.cols;
  const dy = (b.y - a.y) * grid.rows;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 2));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    if (!isWalkable(grid, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

class MinHeap {
  private items: Array<{ key: number; priority: number }> = [];
  get size() { return this.items.length; }
  push(key: number, priority: number) {
    const items = this.items;
    items.push({ key, priority });
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent]!.priority <= items[index]!.priority) break;
      [items[parent], items[index]] = [items[index]!, items[parent]!];
      index = parent;
    }
  }
  pop(): number | undefined {
    const items = this.items;
    if (!items.length) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left]!.priority < items[smallest]!.priority) smallest = left;
        if (right < items.length && items[right]!.priority < items[smallest]!.priority) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index]!, items[smallest]!];
        index = smallest;
      }
    }
    return top.key;
  }
}

const SQRT2 = Math.SQRT2;

/** A* entre deux cellules libres ; liste de cellules du départ à l'arrivée, ou `null` si aucune route. */
function searchCells(grid: NavGrid, from: { col: number; row: number }, to: { col: number; row: number }): Array<{ col: number; row: number }> | null {
  const { cols, rows } = grid;
  const total = cols * rows;
  const cost = new Float32Array(total).fill(Infinity);
  const parent = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const startKey = from.row * cols + from.col;
  const goalKey = to.row * cols + to.col;
  const heuristic = (col: number, row: number) => {
    const dx = Math.abs(col - to.col);
    const dy = Math.abs(row - to.row);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  const open = new MinHeap();
  cost[startKey] = 0;
  open.push(startKey, heuristic(from.col, from.row));
  while (open.size) {
    const key = open.pop()!;
    if (closed[key]) continue;
    closed[key] = 1;
    if (key === goalKey) break;
    const col = key % cols;
    const row = (key / cols) | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nc = col + dx;
        const nr = row + dy;
        if (!isFree(grid, nc, nr)) continue;
        // Une diagonale est refusée seulement si ses deux cases adjacentes sont bloquées (se faufiler entre deux
        // obstacles) ; un escalier étroit en biais n'est qu'un enchaînement de diagonales.
        if (dx && dy && !isFree(grid, col + dx, row) && !isFree(grid, col, row + dy)) continue;
        const next = nr * cols + nc;
        if (closed[next]) continue;
        const candidate = cost[key]! + (dx && dy ? SQRT2 : 1);
        if (candidate < cost[next]!) {
          cost[next] = candidate;
          parent[next] = key;
          open.push(next, candidate + heuristic(nc, nr));
        }
      }
    }
  }
  if (parent[goalKey] === -1 && goalKey !== startKey) return null;
  const cells: Array<{ col: number; row: number }> = [];
  for (let key = goalKey; key !== -1; key = parent[key]!) cells.push({ col: key % cols, row: (key / cols) | 0 });
  return cells.reverse();
}

/** Toutes les cellules praticables atteignables depuis `from` (parcours en largeur). */
function reachableFrom(grid: NavGrid, from: { col: number; row: number }): Uint8Array {
  const { cols, rows } = grid;
  const seen = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;
  seen[from.row * cols + from.col] = 1;
  queue[tail++] = from.row * cols + from.col;
  while (head < tail) {
    const key = queue[head++]!;
    const col = key % cols;
    const row = (key / cols) | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nc = col + dx;
        const nr = row + dy;
        if (!isFree(grid, nc, nr) || seen[nr * cols + nc]) continue;
        if (dx && dy && !isFree(grid, col + dx, row) && !isFree(grid, col, row + dy)) continue;
        seen[nr * cols + nc] = 1;
        queue[tail++] = nr * cols + nc;
      }
    }
  }
  return seen;
}

/** Distance maximale (cellules) de la dernière marche hors grille, de la case atteignable au poste réel. */
export const MAX_APPROACH_CELLS = 14;

/**
 * Case atteignable depuis `reach` la plus proche de `target` (un poste collé à un meuble ou logé dans une poche
 * fermée du contour n'a pas toujours de voisin libre relié au reste du décor), ou `null` si aucune n'est assez proche.
 */
function nearestReachableCell(grid: NavGrid, reach: Uint8Array, target: Point): { col: number; row: number } | null {
  const origin = cellOf(grid, target);
  let best: { col: number; row: number; d: number } | null = null;
  const radius = MAX_APPROACH_CELLS;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const col = origin.col + dx;
      const row = origin.row + dy;
      if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows || !reach[row * grid.cols + col]) continue;
      const d = dx * dx + dy * dy;
      if (d <= radius * radius && (!best || d < best.d)) best = { col, row, d };
    }
  }
  return best ? { col: best.col, row: best.row } : null;
}

/** Supprime les points intermédiaires dont la ligne de vue est dégagée (trajets droits, sans zigzag de grille). */
function smooth(grid: NavGrid, points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const result: Point[] = [points[0]!];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let far = points.length - 1;
    while (far > anchor + 1 && !lineOfSight(grid, points[anchor]!, points[far]!)) far -= 1;
    result.push(points[far]!);
    anchor = far;
  }
  return result;
}

/**
 * Trajet de `from` à `to` : points à suivre dans l'ordre (le départ est exclu, l'arrivée incluse).
 * - sans grille, ou départ et arrivée dégagés l'un de l'autre : ligne droite ;
 * - départ ou arrivée dans un solide (poste assis contre un bureau) : on rejoint la cellule libre la plus proche
 *   puis on termine en ligne droite sur la dernière marche ;
 * - aucune route (zones non reliées) : ligne droite, pour qu'un agent n'arrive jamais « bloqué ».
 */
export function findRoute(grid: NavGrid | null, from: Point, to: Point): Point[] {
  if (!grid) return [to];
  if (isWalkable(grid, from) && isWalkable(grid, to) && lineOfSight(grid, from, to)) return [to];
  const start = nearestFreeCell(grid, from);
  if (!start) return [to];
  const goal = isWalkable(grid, to) ? cellOf(grid, to) : nearestReachableCell(grid, reachableFrom(grid, start), to);
  if (!goal) return [to];
  const cells = searchCells(grid, start, goal);
  if (!cells) return [to];
  const startPoint = isWalkable(grid, from) ? from : centerOf(grid, start.col, start.row);
  const goalPoint = isWalkable(grid, to) ? to : centerOf(grid, goal.col, goal.row);
  const raw: Point[] = [startPoint, ...cells.slice(1, -1).map((cell) => centerOf(grid, cell.col, cell.row)), goalPoint];
  // `smooth` garde le départ en tête ; on ne renvoie que ce qui suit.
  const body = smooth(grid, raw).slice(1);
  const escape = isWalkable(grid, from) ? [] : [startPoint];
  const approach = isWalkable(grid, to) ? [] : [to];
  const route = [...escape, ...body, ...approach];
  return route.length ? route : [to];
}

/** Applique `findRoute` à chaque étape d'un parcours (ex. : escalier puis poste). */
export function expandRoute(grid: NavGrid | null, from: Point, targets: readonly Point[]): Point[] {
  if (!grid) return [...targets];
  const route: Point[] = [];
  let previous = from;
  for (const target of targets) {
    route.push(...findRoute(grid, previous, target));
    previous = target;
  }
  return route.length ? route : [...targets];
}

/** Les deux points sont-ils reliés par une route praticable ? (sans repli en ligne droite) */
export function isReachable(grid: NavGrid | null, from: Point, to: Point): boolean {
  if (!grid) return true;
  const start = nearestFreeCell(grid, from);
  if (!start) return false;
  const reach = reachableFrom(grid, start);
  if (isWalkable(grid, to)) {
    const goal = cellOf(grid, to);
    return reach[goal.row * grid.cols + goal.col] === 1;
  }
  return nearestReachableCell(grid, reach, to) !== null;
}

/** Distance (en cellules) du point à la cellule praticable la plus proche : 0 si le point est déjà praticable. */
export function distanceToWalkable(grid: NavGrid | null, point: Point): number {
  if (!grid) return 0;
  const own = cellOf(grid, point);
  if (isFree(grid, own.col, own.row)) return 0;
  const cell = nearestFreeCell(grid, point);
  return cell ? Math.hypot(cell.col - own.col, cell.row - own.row) : Infinity;
}
