import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { guardRoutes } from "./request-guard";

const userCharactersDir = path.join(homedir(), ".getaroom", "characters");
const publicCharactersDir = path.join(process.cwd(), "public", "characters");
const imagePattern = /\.(png|webp)$/i;

export interface CharacterDescriptor {
  id: string;
  name: string;
  url: string;
  source: "user" | "public";
  agentId?: string;
  /** Hôte Paseo auquel le visuel est dédié (« local », « unraid »…). */
  hostId?: string;
  /** Visuel du pool partagé : attribué automatiquement aux agents sans personnage dédié. */
  shared?: boolean;
  /** Décors (ids de room.json) sur lesquels ce personnage apparaît ; absent = tous. */
  maps?: string[];
  spriteSheet: boolean;
  frameSize: number;
  columns: number;
  rows: number;
  monochromeFilter?: boolean;
}

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

function safeFileName(value: string): string {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return base.replace(/^-+|-+$/g, "") || `personnage-${Date.now()}.png`;
}

function safeCharacterId(value: string): string {
  return path.basename(value).toLocaleLowerCase().replace(/\.(png|webp)$/i, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `personnage-${Date.now()}`;
}

function safeCharacterFolder(value: string): string {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "personnage";
}

function fromManifest(
  source: "user" | "public",
  id: string,
  image: string,
  manifest: Record<string, unknown>,
  nested: boolean,
): CharacterDescriptor {
  const columns = typeof manifest.columns === "number" ? manifest.columns : 4;
  const rows = typeof manifest.rows === "number" ? manifest.rows : 4;
  const encodedImage = encodeURIComponent(image);
  return {
    id: `${source}:${id}`,
    name: typeof manifest.name === "string" ? manifest.name : id,
    url: nested ? `/characters/${source}/${encodeURIComponent(id)}/${encodedImage}` : `/characters/${source}/${encodedImage}`,
    source,
    agentId: typeof manifest.agentId === "string" ? manifest.agentId : undefined,
    hostId: typeof manifest.hostId === "string" ? manifest.hostId : undefined,
    shared: manifest.shared === true,
    maps: Array.isArray(manifest.maps) ? manifest.maps.filter((value): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(value)) : undefined,
    spriteSheet: manifest.spriteSheet === true,
    frameSize: typeof manifest.frameSize === "number" ? manifest.frameSize : 64,
    columns,
    rows,
    monochromeFilter: manifest.monochromeFilter !== false,
  };
}

async function listDirectory(directory: string, source: "user" | "public"): Promise<CharacterDescriptor[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try { entries = await readdir(directory, { withFileTypes: true }) as never; } catch { return []; }
  const characters: CharacterDescriptor[] = [];
  for (const entry of entries as unknown as Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>) {
    if (!entry.isFile() || !imagePattern.test(entry.name)) continue;
    const file = entry.name;
    const id = file.replace(imagePattern, "");
    let manifest: Record<string, unknown> = {};
    for (const candidate of [`${id}.json`, "character.json"]) {
      try {
        manifest = JSON.parse(await readFile(path.join(directory, candidate), "utf8")) as Record<string, unknown>;
        if (candidate !== "character.json" || manifest.image === file) break;
      } catch {}
    }
    characters.push(fromManifest(source, id, file, manifest, false));
  }
  for (const entry of entries as unknown as Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>) {
    if (!entry.isDirectory()) continue;
    const id = safeCharacterFolder(entry.name);
    const characterDirectory = path.join(directory, entry.name);
    let manifest: Record<string, unknown> = {};
    try { manifest = JSON.parse(await readFile(path.join(characterDirectory, "character.json"), "utf8")) as Record<string, unknown>; } catch {}
    let image = typeof manifest.image === "string" ? path.basename(manifest.image) : "";
    if (!imagePattern.test(image)) {
      const files: string[] = await readdir(characterDirectory).catch((): string[] => []);
      image = ["avatar.png", "avatar.webp", "sprites.png", "sprites.webp"].find((candidate) => files.includes(candidate)) || files.find((candidate) => imagePattern.test(candidate)) || "";
    }
    if (!image || !imagePattern.test(image)) continue;
    characters.push(fromManifest(source, id, image, manifest, true));
  }
  return characters;
}

async function serveCharacter(source: "user" | "public", rawFile: string, rawCharacter?: string): Promise<Response> {
  const file = safeFileName(decodeURIComponent(rawFile));
  if (!imagePattern.test(file)) return json({ error: "Personnage introuvable." }, 404);
  const directory = source === "user" ? userCharactersDir : publicCharactersDir;
  const character = rawCharacter ? safeCharacterFolder(decodeURIComponent(rawCharacter)) : "";
  const target = character ? path.join(directory, character, file) : path.join(directory, file);
  try {
    if (!(await stat(target)).isFile()) return json({ error: "Personnage introuvable." }, 404);
    return new Response(Bun.file(target), {
      headers: {
        "content-type": file.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png",
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return json({ error: "Personnage introuvable." }, 404);
  }
}

export const charactersApi = guardRoutes({
  "/api/room/characters": {
    GET: async (_req?: Request) => json({
      characters: [
        ...(await listDirectory(userCharactersDir, "user")),
        ...(await listDirectory(publicCharactersDir, "public")),
      ],
      folder: "~/.getaroom/characters/",
    }),
    POST: async (req: Request) => {
      try {
        const form = await req.formData();
        const image = form.get("image");
        if (!(image instanceof File) || !["image/png", "image/webp"].includes(image.type)) {
          return json({ error: "Choisis une image PNG ou WebP." }, 400);
        }
        if (image.size > 20 * 1024 * 1024) return json({ error: "L’image dépasse 20 Mo." }, 400);
        await mkdir(userCharactersDir, { recursive: true, mode: 0o700 });
        const requestedName = typeof form.get("name") === "string" ? String(form.get("name")).trim().slice(0, 48) : "";
        const id = safeCharacterId(requestedName || image.name || `personnage-${Date.now()}`);
        const targetDirectory = path.join(userCharactersDir, id);
        await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
        const extension = image.type === "image/webp" ? ".webp" : ".png";
        const spriteSheet = form.get("spriteSheet") === "true";
        const field = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim().slice(0, 64) : "";
        const agentId = field("agentId");
        const hostId = field("hostId");
        const shared = form.get("shared") === "true" && !agentId;
        const frameSize = Math.max(8, Math.min(1024, Math.floor(Number(form.get("frameSize")) || 64)));
        const maps = field("maps").split(",").map((value) => value.trim()).filter((value) => /^[a-z0-9][a-z0-9-]{0,63}$/i.test(value)).slice(0, 32);
        // Le client envoie toujours le résultat détouré en PNG sans perte ; jamais de JPEG sur disque.
        const fileName = `${spriteSheet ? "sprites" : "avatar"}${extension}`;
        await writeFile(path.join(targetDirectory, fileName), new Uint8Array(await image.arrayBuffer()), { mode: 0o600 });
        const manifest = {
          name: requestedName || id,
          image: fileName,
          agentId: agentId || undefined,
          hostId: hostId || undefined,
          shared: shared || undefined,
          maps: maps.length ? maps : undefined,
          spriteSheet,
          frameSize,
          columns: 4,
          rows: 4,
          monochromeFilter: true,
        };
        await writeFile(path.join(targetDirectory, "character.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
        return json({ ok: true, character: id, file: fileName });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  },
  "/api/room/characters/open": {
    POST: async () => {
      try {
        await mkdir(userCharactersDir, { recursive: true, mode: 0o700 });
        if (process.platform === "darwin") Bun.spawn(["open", userCharactersDir], { stdout: "ignore", stderr: "ignore" });
        else if (process.platform === "linux") Bun.spawn(["xdg-open", userCharactersDir], { stdout: "ignore", stderr: "ignore" });
        return json({ ok: true, folder: userCharactersDir });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  },
  "/characters/user/:file": {
    GET: (req: Request & { params: { file: string } }) => serveCharacter("user", req.params.file),
  },
  "/characters/public/:file": {
    GET: (req: Request & { params: { file: string } }) => serveCharacter("public", req.params.file),
  },
  "/characters/user/:character/:file": {
    GET: (req: Request & { params: { character: string; file: string } }) => serveCharacter("user", req.params.file, req.params.character),
  },
  "/characters/public/:character/:file": {
    GET: (req: Request & { params: { character: string; file: string } }) => serveCharacter("public", req.params.file, req.params.character),
  },
});
