// Logique pure de The Room (sans React ni Canvas) : isolée du core Paseo et testable.
import type { TimelineItem } from "../../lib/paseo/types";

export type ActivityState = "working" | "thinking" | "idle";
export type Point = { x: number; y: number };
export type Facing = "down" | "left" | "right" | "up";
export const FACINGS: readonly Facing[] = ["down", "left", "up", "right"];
/** Poste de la pièce ; `facing` = direction du regard une fois assis (bureau/écran). */
export type StationPoint = Point & { facing?: Facing };

/** Rotation d'un poste : bas → gauche → haut → droite → bas. */
export function rotateFacing(current?: Facing): Facing {
  const index = current ? FACINGS.indexOf(current) : -1;
  return FACINGS[(index + 1) % FACINGS.length]!;
}

/** Rayon (coordonnées normalisées) dans lequel un agent lâché s'assoit sur un poste libre. */
export const SEAT_DROP_RADIUS = 0.045;

/** Poste de travail libre le plus proche d'un point, ou `null` si aucun n'est à portée. */
export function nearestFreeSeat(
  map: SceneMap,
  at: Point,
  occupiedKeys: ReadonlySet<string>,
  radius = SEAT_DROP_RADIUS,
): { key: string; point: StationPoint } | null {
  let best: { key: string; point: StationPoint; d: number } | null = null;
  map.positions.working.forEach((point, index) => {
    const key = `working:${index}`;
    if (occupiedKeys.has(key)) return;
    const d = Math.hypot(point.x - at.x, point.y - at.y);
    if (d <= radius && (!best || d < best.d)) best = { key, point, d };
  });
  return best ? { key: (best as { key: string }).key, point: (best as { point: StationPoint }).point } : null;
}

export interface RoomZone {
  id: string;
  /** Identifiant d'hôte Paseo (« local », « unraid »…) ou « * » pour tous. */
  hostId: string;
  label?: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RoomSprite {
  style?: "severance" | "monochrome";
  /** Échelle des personnages à la hauteur de référence. */
  scale?: number;
  /** Hauteur (px) de l'image de décor pour laquelle `scale` est exact. */
  referenceHeight?: number;
  /** Décalage vertical des personnages debout / en marche, en fraction de leur hauteur (positif = plus bas). */
  groundOffset?: number;
}

export interface SceneMap {
  id: string;
  sprite?: RoomSprite;
  zones?: RoomZone[];
  positions: Record<ActivityState, StationPoint[]>;
}

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function stableNumber(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/* ───────────── Échelle & style des personnages ───────────── */

const DEFAULT_REFERENCE_HEIGHT = 800;
const MIN_SPRITE_FACTOR = 0.55;
const MAX_SPRITE_FACTOR = 1.9;

/** Les anciens décors (sans bloc `sprite`) gardent leur rendu historique. */
function legacySprite(mapId: string): Required<Pick<RoomSprite, "style" | "scale">> {
  return mapId === "monument-citadelle" ? { style: "monochrome", scale: 1.65 } : { style: "severance", scale: 2.28 };
}

/** Échelle proportionnelle à la taille réellement affichée du décor. */
export function spriteMetrics(map: Pick<SceneMap, "id" | "sprite">, imageHeight: number) {
  const fallback = legacySprite(map.id);
  const style = map.sprite?.style ?? fallback.style;
  const base = Number.isFinite(map.sprite?.scale) && (map.sprite?.scale ?? 0) > 0 ? map.sprite!.scale! : fallback.scale;
  const reference = Number.isFinite(map.sprite?.referenceHeight) && (map.sprite?.referenceHeight ?? 0) > 0
    ? map.sprite!.referenceHeight!
    : DEFAULT_REFERENCE_HEIGHT;
  const factor = Math.max(MIN_SPRITE_FACTOR, Math.min(MAX_SPRITE_FACTOR, imageHeight / reference));
  const groundOffset = Number.isFinite(map.sprite?.groundOffset) ? map.sprite!.groundOffset! : 0;
  return { style, scale: base * factor, groundOffset };
}

/* ───────────── Activité temps réel (timeline Paseo) ───────────── */

export interface ToolActivity {
  state: "working" | "thinking";
  label: string;
  file?: string;
  command?: string;
  additions?: number;
  deletions?: number;
}

const READ_ONLY_TOOL = /read|search|inspect|analy|list|find|grep|glob|lecture|recherche/i;

function extractCommand(item: Extract<TimelineItem, { type: "tool_call" }>): string | undefined {
  const sources: unknown[] = [item.input, item.detail];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const value = (source as Record<string, unknown>).command ?? (source as Record<string, unknown>).cmd;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.every((part) => typeof part === "string")) return (value as string[]).join(" ").trim() || undefined;
  }
  return undefined;
}

export function countDiff(diff: string | undefined): { additions: number; deletions: number } | undefined {
  if (!diff) return undefined;
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return additions || deletions ? { additions, deletions } : undefined;
}

/** Résume un élément de timeline ; `null` si l'élément n'indique aucune activité. */
export function describeTimelineItem(item: TimelineItem | undefined | null): ToolActivity | null {
  if (!item) return null;
  if (item.type === "reasoning") return { state: "thinking", label: "Réflexion et analyse" };
  if (item.type === "assistant_message") return item.text ? { state: "thinking", label: "Génération de la réponse" } : null;
  if (item.type !== "tool_call") return null;
  const label = item.title || item.name || item.tool || "Outil Paseo";
  const counts = typeof item.additions === "number" || typeof item.deletions === "number"
    ? { additions: item.additions ?? 0, deletions: item.deletions ?? 0 }
    : countDiff(item.diff);
  return {
    state: READ_ONLY_TOOL.test(item.name || item.tool || label) ? "thinking" : "working",
    label,
    file: item.filePath,
    command: extractCommand(item),
    ...counts,
  };
}

export function timelineActivity(timeline: readonly TimelineItem[]): ToolActivity | null {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const activity = describeTimelineItem(timeline[index]);
    if (activity) return activity;
  }
  return null;
}

const baseName = (path: string) => path.split("/").filter(Boolean).pop() || path;
const truncate = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** Ligne(s) compacte(s) d'une bulle : neutres vis-à-vis de la langue. */
export function bubbleLines(activity: ToolActivity): { primary: string; secondary?: string } {
  const diff = activity.additions || activity.deletions ? `+${activity.additions ?? 0} −${activity.deletions ?? 0}` : undefined;
  if (activity.command) return { primary: `$ ${truncate(activity.command.replace(/\s+/g, " "), 30)}` };
  if (activity.file) return { primary: truncate(baseName(activity.file), 26), secondary: diff };
  return { primary: truncate(activity.label, 28), secondary: diff };
}

/* ───────────── Hôtes : zones invisibles & stations ───────────── */

/** « local » d'abord, puis ordre alphabétique : disposition stable. */
export function hostOrder(hostIds: Iterable<string>): string[] {
  return [...new Set(hostIds)].sort((a, b) => (a === "local" ? -1 : b === "local" ? 1 : a.localeCompare(b)));
}

const inside = (point: Point, zone: RoomZone) =>
  point.x >= Math.min(zone.x0, zone.x1) && point.x <= Math.max(zone.x0, zone.x1) &&
  point.y >= Math.min(zone.y0, zone.y1) && point.y <= Math.max(zone.y0, zone.y1);

/** Indices de stations préférés pour un hôte : zones explicites, sinon tranche contiguë. */
export function preferredStations(map: SceneMap, state: ActivityState, hostId: string, hosts: string[]): Set<number> {
  const points = map.positions[state];
  const zones = (map.zones ?? []).filter((zone) => zone.hostId === hostId || zone.hostId === "*");
  if (zones.length) {
    return new Set(points.flatMap((point, index) => zones.some((zone) => inside(point, zone)) ? [index] : []));
  }
  const explicitElsewhere = (map.zones ?? []).length > 0;
  const rank = hosts.indexOf(hostId);
  if (explicitElsewhere || hosts.length <= 1 || rank < 0) return new Set(points.map((_, index) => index));
  const start = Math.floor((rank * points.length) / hosts.length);
  const end = Math.floor(((rank + 1) * points.length) / hosts.length);
  return new Set(points.flatMap((_, index) => index >= start && index < end ? [index] : []));
}

export interface HostZoneRect { hostId: string; x0: number; y0: number; x1: number; y1: number; derived: boolean }

/** Rectangles à afficher uniquement en mode calibrage. */
export function hostZoneRects(map: SceneMap, hostIds: string[]): HostZoneRect[] {
  if (map.zones?.length) {
    return map.zones.map((zone) => ({ hostId: zone.hostId, x0: zone.x0, y0: zone.y0, x1: zone.x1, y1: zone.y1, derived: false }));
  }
  const hosts = hostOrder(hostIds);
  if (hosts.length <= 1) return [];
  const pad = 0.03;
  return hosts.flatMap((hostId) => {
    const points = (["working", "thinking", "idle"] as const).flatMap((state) => {
      const indices = preferredStations(map, state, hostId, hosts);
      return [...indices].map((index) => map.positions[state][index]!);
    });
    if (!points.length) return [];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return [{
      hostId,
      x0: clamp01(Math.min(...xs) - pad), y0: clamp01(Math.min(...ys) - pad),
      x1: clamp01(Math.max(...xs) + pad), y1: clamp01(Math.max(...ys) + pad),
      derived: true,
    }];
  });
}

export interface StationAgent { id: string; activityState: ActivityState; hostId: string }
export interface StationCurrent {
  x: number; y: number; stationKey: string;
  /** Poste choisi à la main (Grab & Drop) : prioritaire tant que l'état de l'agent ne change pas. */
  pin?: { key: string; point: StationPoint };
}
export interface StationAssignment { point: Point; key: string; facing?: Facing }

export function reserveStations(
  sceneAgents: readonly StationAgent[],
  map: SceneMap,
  animated: ReadonlyMap<string, StationCurrent>,
): Map<string, StationAssignment> {
  const assignments = new Map<string, StationAssignment>();
  const occupied = new Set<string>();
  const hosts = hostOrder(sceneAgents.map((item) => item.hostId));
  const ordered = [...sceneAgents].sort((a, b) =>
    hosts.indexOf(a.hostId) - hosts.indexOf(b.hostId) || a.id.localeCompare(b.id));

  for (const item of ordered) {
    const pin = animated.get(item.id)?.pin;
    if (pin && !occupied.has(pin.key)) {
      occupied.add(pin.key);
      assignments.set(item.id, { point: pin.point, key: pin.key, facing: pin.point.facing });
    }
  }

  for (const item of ordered) {
    if (assignments.has(item.id)) continue;
    const points = map.positions[item.activityState];
    if (!points.length) {
      assignments.set(item.id, { point: { x: 0.5, y: 0.5 }, key: `${item.activityState}:fallback` });
      continue;
    }
    const current = animated.get(item.id);
    const reusable = current?.stationKey.startsWith(`${item.activityState}:`) ? current.stationKey : "";
    const reusableIndex = Number(reusable.split(":")[1]);
    if (reusable && Number.isInteger(reusableIndex) && points[reusableIndex] && !occupied.has(reusable)) {
      occupied.add(reusable);
      assignments.set(item.id, { point: points[reusableIndex]!, key: reusable, facing: points[reusableIndex]!.facing });
      continue;
    }
    const preferred = preferredStations(map, item.activityState, item.hostId, hosts);
    const free = points
      .map((point, index) => ({ point, index, key: `${item.activityState}:${index}` }))
      .filter((candidate) => !occupied.has(candidate.key));
    const pool = free.filter((candidate) => preferred.has(candidate.index));
    const candidates = pool.length ? pool : free;
    if (candidates.length) {
      const origin = current || points[stableNumber(item.id) % points.length]!;
      candidates.sort((a, b) => distance(origin, a.point) - distance(origin, b.point) || a.index - b.index);
      const chosen = candidates[0]!;
      occupied.add(chosen.key);
      assignments.set(item.id, { point: chosen.point, key: chosen.key, facing: chosen.point.facing });
      continue;
    }
    const base = points[stableNumber(item.id) % points.length]!;
    const angle = (Math.floor(stableNumber(`${item.id}:overflow`) % 7) + 1) * 2.39996;
    assignments.set(item.id, {
      point: { x: clamp01(base.x + Math.cos(angle) * 0.017), y: clamp01(base.y + Math.sin(angle) * 0.012) },
      key: `${item.activityState}:overflow:${item.id}`,
    });
  }
  return assignments;
}

/* ───────────── Déplacements ───────────── */

function chainLength(start: Point, chain: Point[], target: Point): number {
  let total = 0;
  let previous = start;
  for (const point of chain) { total += distance(previous, point); previous = point; }
  return total + distance(previous, target);
}

/** Passe par les waypoints de l'escalier quand l'agent change de niveau (repos ↔ travail). */
export function transitionPath(
  current: { x: number; y: number; activityState: ActivityState },
  target: Point,
  nextState: ActivityState,
  waypoints: Point[],
): Point[] {
  const changesLevel = waypoints.length > 0 && ((current.activityState === "idle") !== (nextState === "idle"));
  if (!changesLevel) return [target];
  const forward = [...waypoints];
  const reverse = [...waypoints].reverse();
  const here = { x: current.x, y: current.y };
  const chain = chainLength(here, forward, target) <= chainLength(here, reverse, target) ? forward : reverse;
  return [...chain, target];
}

/* ───────────── Attribution des personnages ───────────── */

export interface CharacterLike { name: string; agentId?: string; hostId?: string; shared?: boolean; maps?: string[] }

/** Un personnage limité à certains décors n'apparaît que sur ceux-là ; sans `maps`, il vaut partout. */
export const characterOnMap = (entry: CharacterLike, mapId?: string) => !mapId || !entry.maps?.length || entry.maps.includes(mapId);

/**
 * Dédié à l'agent › même nom › dédié à l'hôte › pool partagé (choix stable par agent), parmi les
 * personnages autorisés sur le décor. Aucun → `undefined` : le décor garde son design d'origine.
 */
export function pickCharacter<T extends CharacterLike>(all: readonly T[], agentId: string, name: string, hostId?: string, mapId?: string): T | undefined {
  const characters = all.filter((entry) => characterOnMap(entry, mapId));
  const normalized = name.toLocaleLowerCase();
  const dedicated = characters.find((entry) => entry.agentId === agentId)
    || characters.find((entry) => entry.name.toLocaleLowerCase() === normalized);
  if (dedicated) return dedicated;
  const forHost = hostId ? characters.find((entry) => !entry.agentId && entry.hostId === hostId) : undefined;
  if (forHost) return forHost;
  const pool = characters.filter((entry) => entry.shared && !entry.agentId && !entry.hostId);
  return pool.length ? pool[stableNumber(agentId) % pool.length] : undefined;
}

/* ───────────── Direction de marche (sprite sheets isométriques) ───────────── */

/**
 * Les 4 lignes d'une feuille isométrique sont des diagonales, pas des axes :
 * bas = ↙ (face-gauche), gauche = ↖ (dos-gauche), droite = ↘ (face-droite), haut = ↗ (dos-droite).
 * La direction est donc un quadrant (signe de dx, signe de dy), avec hystérésis pour qu'un trajet
 * quasi vertical ou horizontal ne fasse pas osciller la ligne de sprite à chaque image (marche saccadée).
 */
export function walkFacing(dx: number, dy: number, previous: Facing): Facing {
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return previous;
  const wasLeft = previous === "down" || previous === "left";
  const wasDown = previous === "down" || previous === "right";
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const left = ax < ay * 0.2 ? wasLeft : dx < 0;
  const down = ay < ax * 0.2 ? wasDown : dy > 0;
  return left ? (down ? "down" : "left") : (down ? "right" : "up");
}

/** Flèche (vecteur écran) d'une orientation de poste, en diagonale isométrique. */
export const FACING_VECTOR: Record<Facing, [number, number]> = {
  down: [-0.7071, 0.7071],
  left: [-0.7071, -0.7071],
  up: [0.7071, -0.7071],
  right: [0.7071, 0.7071],
};
export const FACING_ARROW: Record<Facing, string> = { down: "↙", left: "↖", up: "↗", right: "↘" };
