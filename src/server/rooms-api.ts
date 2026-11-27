import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { guardRoutes } from "./request-guard";
import { cleanNav, type NavData } from "../components/room/room-nav";

export type RoomFacing = "down" | "left" | "right" | "up";
export interface RoomPoint { x: number; y: number; facing?: RoomFacing }
const FACING_VALUES = new Set(["down", "left", "right", "up"]);
export interface RoomSprite { style?: "severance" | "monochrome"; scale?: number; referenceHeight?: number; groundOffset?: number }
export interface RoomZone { id: string; hostId: string; label?: string; x0: number; y0: number; x1: number; y1: number }
export interface RoomMap {
  id: string;
  name: string;
  background?: string;
  backgroundColor: string;
  backgroundUrl?: string;
  source?: "public" | "user";
  positions: { working: RoomPoint[]; thinking: RoomPoint[]; idle: RoomPoint[] };
  waypoints: RoomPoint[];
  /** Style et échelle des personnages ; absent = rendu historique du décor. */
  sprite?: RoomSprite;
  /** Zones logiques par hôte (invisibles hors mode calibrage). */
  zones?: RoomZone[];
  /** Navigation : zones praticables et objets solides que les personnages contournent. */
  nav?: NavData;
}

const publicRoomsDir = path.join(process.cwd(), "public", "rooms");
const userRoomsDir = path.join(homedir(), ".getaroom", "rooms");
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const safeId = (value: string) => /^[a-z0-9][a-z0-9-]{0,63}$/i.test(value) ? value : "";

function validPoint(value: unknown): value is RoomPoint {
  const point = value as RoomPoint;
  return typeof point?.x === "number" && typeof point?.y === "number" && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

const finitePositive = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max;

function parseSprite(value: unknown): RoomSprite | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const sprite: RoomSprite = {};
  if (raw.style === "severance" || raw.style === "monochrome") sprite.style = raw.style;
  if (finitePositive(raw.scale, 8)) sprite.scale = raw.scale;
  if (finitePositive(raw.referenceHeight, 10000)) sprite.referenceHeight = raw.referenceHeight;
  // Décalage vertical des personnages debout/en marche (fraction de leur hauteur, positif = plus bas).
  if (typeof raw.groundOffset === "number" && Number.isFinite(raw.groundOffset) && Math.abs(raw.groundOffset) <= 0.3) sprite.groundOffset = raw.groundOffset;
  return Object.keys(sprite).length ? sprite : undefined;
}

function parseZones(value: unknown): RoomZone[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const zones = value.flatMap((entry, index): RoomZone[] => {
    const zone = entry as Partial<RoomZone>;
    const coords = [zone?.x0, zone?.y0, zone?.x1, zone?.y1];
    if (!coords.every((n) => typeof n === "number" && n >= 0 && n <= 1)) return [];
    const hostId = typeof zone.hostId === "string" && zone.hostId.trim() ? zone.hostId.trim().slice(0, 64) : "*";
    return [{
      id: typeof zone.id === "string" && zone.id ? zone.id.slice(0, 64) : `zone-${index + 1}`,
      hostId, ...(typeof zone.label === "string" ? { label: zone.label.slice(0, 48) } : {}),
      x0: zone.x0!, y0: zone.y0!, x1: zone.x1!, y1: zone.y1!,
    }];
  });
  return zones.length ? zones.slice(0, 32) : undefined;
}

/** Ne conserve que x, y et un `facing` valide (les champs inconnus sont écartés). */
function cleanPoints(points: RoomPoint[]): RoomPoint[] {
  return points.map((point) => ({
    x: point.x, y: point.y,
    ...(typeof point.facing === "string" && FACING_VALUES.has(point.facing) ? { facing: point.facing } : {}),
  }));
}

export function validateRoomMap(value: unknown, fallbackId = ""): RoomMap {
  const map = value as Partial<RoomMap>;
  const id = safeId(map.id || fallbackId);
  if (!id || typeof map.name !== "string" || !map.name.trim()) throw new Error("Map The Room invalide.");
  const positions = map.positions;
  if (!positions || ![positions.working, positions.thinking, positions.idle].every((list) => Array.isArray(list) && list.every(validPoint))) {
    throw new Error("Coordonnées de postes invalides.");
  }
  if (map.waypoints !== undefined && (!Array.isArray(map.waypoints) || !map.waypoints.every(validPoint))) throw new Error("Waypoints invalides.");
  return {
    id,
    name: map.name.trim(),
    background: typeof map.background === "string" ? path.basename(map.background) : "bg.jpg",
    backgroundColor: typeof map.backgroundColor === "string" ? map.backgroundColor : "#080808",
    positions: { working: cleanPoints(positions.working!), thinking: cleanPoints(positions.thinking!), idle: cleanPoints(positions.idle!) },
    waypoints: map.waypoints || [],
    ...(parseSprite(map.sprite) ? { sprite: parseSprite(map.sprite) } : {}),
    ...(parseZones(map.zones) ? { zones: parseZones(map.zones) } : {}),
    ...(cleanNav(map.nav) ? { nav: cleanNav(map.nav) } : {}),
  };
}

async function scan(directory: string, source: "public" | "user"): Promise<RoomMap[]> {
  let folders: string[];
  try { folders = await readdir(directory); } catch { return []; }
  const maps: RoomMap[] = [];
  for (const folder of folders) {
    const id = safeId(folder);
    if (!id) continue;
    try {
      const map = validateRoomMap(JSON.parse(await readFile(path.join(directory, folder, "room.json"), "utf8")), id);
      const background = path.join(directory, folder, map.background || "bg.jpg");
      const hasBackground = await stat(background).then((entry) => entry.isFile()).catch(() => false);
      maps.push({ ...map, source, backgroundUrl: hasBackground ? `/rooms/${source}/${id}/${encodeURIComponent(map.background || "bg.jpg")}` : undefined });
    } catch {}
  }
  return maps;
}

export async function listRoomMaps(): Promise<RoomMap[]> {
  const publicMaps = await scan(publicRoomsDir, "public");
  const userMaps = await scan(userRoomsDir, "user");
  const merged = new Map(publicMaps.map((map) => [map.id, map]));
  for (const userMap of userMaps) {
    const base = merged.get(userMap.id);
    // Fusion champ par champ du bloc sprite : un réglage public nouveau n'est pas effacé par un calibrage plus ancien.
    const sprite = base?.sprite || userMap.sprite ? { ...base?.sprite, ...userMap.sprite } : undefined;
    merged.set(userMap.id, { ...base, ...userMap, ...(sprite ? { sprite } : {}), backgroundUrl: userMap.backgroundUrl || base?.backgroundUrl });
  }
  return [...merged.values()];
}

async function serveRoomAsset(source: "public" | "user", rawId: string, rawFile: string): Promise<Response> {
  const id = safeId(rawId);
  const file = path.basename(decodeURIComponent(rawFile));
  if (!id || !/^[\w.-]+\.(jpe?g|png|webp)$/i.test(file)) return new Response("Introuvable", { status: 404 });
  const root = source === "public" ? publicRoomsDir : userRoomsDir;
  const target = path.join(root, id, file);
  try {
    if (!(await stat(target)).isFile()) return new Response("Introuvable", { status: 404 });
    const contentType = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
    return new Response(Bun.file(target), { headers: { "content-type": contentType, "cache-control": "public, max-age=3600" } });
  } catch { return new Response("Introuvable", { status: 404 }); }
}

export const roomsApi = guardRoutes({
  "/api/room/maps": {
    GET: async (_req?: Request) => json({ maps: await listRoomMaps(), folder: "~/.getaroom/rooms/" }),
  },
  "/api/room/maps/:id": {
    POST: async (req: Request & { params: { id: string } }) => {
      try {
        const id = safeId(req.params.id);
        if (!id) return json({ error: "Identifiant de map invalide." }, 400);
        const incoming = validateRoomMap(await req.json(), id);
        const target = path.join(userRoomsDir, id);
        await mkdir(target, { recursive: true, mode: 0o700 });
        await writeFile(path.join(target, "room.json"), JSON.stringify({ ...incoming, id }, null, 2), { mode: 0o600 });
        return json({ ok: true, map: incoming });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    },
  },
  "/rooms/public/:id/:file": {
    GET: (req: Request & { params: { id: string; file: string } }) => serveRoomAsset("public", req.params.id, req.params.file),
  },
  "/rooms/user/:id/:file": {
    GET: (req: Request & { params: { id: string; file: string } }) => serveRoomAsset("user", req.params.id, req.params.file),
  },
});
