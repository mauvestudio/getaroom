import tailwind from "bun-plugin-tailwind";
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { paseoRelayExportWorkaround } from "./src/lib/paseo/relay-export-workaround";

// Keep Linux x64 as the standalone default; Tauri supplies a macOS target.
let TARGET = process.env.GETAROOM_BUN_TARGET || "bun-linux-x64";

// Parse CLI arguments
const rawArgs = process.argv.slice(2);
let outfile = path.resolve(process.cwd(), "dist/amble");

for (let i = 0; i < rawArgs.length; i++) {
  const arg = rawArgs[i];
  if (arg === "-o" || arg === "--outfile") {
    const val = rawArgs[++i];
    if (val) outfile = path.resolve(process.cwd(), val);
  } else if (arg?.startsWith("--outfile=")) {
    const val = arg.split("=")[1];
    if (val) outfile = path.resolve(process.cwd(), val);
  } else if (arg === "--target") {
    const val = rawArgs[++i];
    if (val) TARGET = val;
  } else if (arg?.startsWith("--target=")) {
    TARGET = arg.slice("--target=".length);
  } else if (arg === "--help" || arg === "-h") {
    console.log("Compile Get a Room into a standalone executable");
    console.log("");
    console.log("Usage: bun run compile.ts [options] [outfile]");
    console.log("");
    console.log("Options:");
    console.log("  -o, --outfile <path>  Output path for executable (default: dist/amble)");
    console.log("      --target <target> Bun target (default: bun-linux-x64)");
    console.log("  -h, --help            Show this help message");
    process.exit(0);
  } else if (arg && !arg.startsWith("-")) {
    outfile = path.resolve(process.cwd(), arg);
  }
}

console.log(`📦 Compilation en binaire autonome [${TARGET}]...`);
console.log(`   Output: ${outfile}`);

// Step 1: Build the frontend bundle
console.log("⚡ [1/3] Building self-contained frontend bundle...");
const frontendResult = await Bun.build({
  entrypoints: [path.resolve(process.cwd(), "src/index.html")],
  plugins: [tailwind, paseoRelayExportWorkaround],
  target: "browser",
  compile: true,
  minify: true,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

if (!frontendResult.success) {
  console.error("❌ Frontend bundling failed:");
  for (const log of frontendResult.logs) {
    console.error(log);
  }
  process.exit(1);
}

const bundledHtml = (await frontendResult.outputs[0]?.text())
  ?.replace(/\.\/favicon-[^/\"]+\.ico/g, "/favicon.ico")
  ?.replace(/\.\/favicon-16-[^/\"]+\.png/g, "/favicon-16.png")
  ?.replace(/\.\/favicon-32-[^/\"]+\.png/g, "/favicon-32.png")
  ?.replace(/\.\/apple-touch-icon-[^/\"]+\.png/g, "/apple-touch-icon.png")
  ?.replace(/\.\/manifest-[^/\"]+\.json/g, "/manifest.json");
if (!bundledHtml) {
  console.error("❌ Frontend build produced empty output");
  process.exit(1);
}

const bundleSizeMb = ((frontendResult.outputs[0]?.size || 0) / (1024 * 1024)).toFixed(2);
console.log(`✓ Frontend bundle created (${bundleSizeMb} MB)`);

// Step 2: Prepare standalone server code in a temporary directory
console.log("⚡ [2/3] Preparing standalone server entrypoint...");
const tempDir = await mkdtemp(path.join(tmpdir(), "amble-compile-"));
const proxyHandlerPath = path.resolve(process.cwd(), "src/lib/paseo/proxy-handler.ts");
const agentConfigPath = path.resolve(process.cwd(), "src/config/agents.ts");
const paseoHostsPath = path.resolve(process.cwd(), "src/server/paseo-hosts.ts");
const roomApiPath = path.resolve(process.cwd(), "src/server/room-api.ts");
const profileApiPath = path.resolve(process.cwd(), "src/server/profile-api.ts");
const projectActionsApiPath = path.resolve(process.cwd(), "src/server/project-actions.ts");
const charactersApiPath = path.resolve(process.cwd(), "src/server/characters-api.ts");
const roomsApiPath = path.resolve(process.cwd(), "src/server/rooms-api.ts");
const requestGuardPath = path.resolve(process.cwd(), "src/server/request-guard.ts");
const avatarDir = path.resolve(process.cwd(), "public/avatars");
const avatarNames = (await readdir(avatarDir)).filter((name) => /\.(png|jpe?g|webp|svg)$/i.test(name));
const avatarImports = avatarNames.map((name, index) => `import avatar${index} from "./avatars/${name}" with { type: "file" };`).join("\n");
const avatarMap = `{ ${avatarNames.map((name, index) => `${JSON.stringify(name)}: avatar${index}`).join(", ")} }`;
const characterDir = path.resolve(process.cwd(), "public/characters");
const characterEntries = await readdir(characterDir, { withFileTypes: true });
const publicCharacters: Array<{ id: string; relativePath: string; descriptor: Record<string, unknown> }> = [];
for (const entry of characterEntries) {
  if (entry.isFile() && /\.(png|webp)$/i.test(entry.name)) {
    const id = entry.name.replace(/\.(png|webp)$/i, "");
    let manifest: Record<string, unknown> = {};
    try { manifest = JSON.parse(await readFile(path.join(characterDir, `${id}.json`), "utf8")); } catch {}
    publicCharacters.push({
      id,
      relativePath: entry.name,
      descriptor: {
        id: `public:${id}`,
        name: typeof manifest.name === "string" ? manifest.name : id,
        url: `/characters/public/${encodeURIComponent(entry.name)}`,
        source: "public",
        agentId: typeof manifest.agentId === "string" ? manifest.agentId : undefined,
        hostId: typeof manifest.hostId === "string" ? manifest.hostId : undefined,
        shared: manifest.shared === true,
        maps: Array.isArray(manifest.maps) ? manifest.maps.filter((value: unknown) => typeof value === "string") : undefined,
        spriteSheet: manifest.spriteSheet === true,
        frameSize: typeof manifest.frameSize === "number" ? manifest.frameSize : 64,
        columns: typeof manifest.columns === "number" ? manifest.columns : 4,
        rows: typeof manifest.rows === "number" ? manifest.rows : 4,
        monochromeFilter: manifest.monochromeFilter !== false,
      },
    });
  }
  if (entry.isDirectory()) {
    const folder = entry.name;
    const folderPath = path.join(characterDir, folder);
    let manifest: Record<string, unknown> = {};
    try { manifest = JSON.parse(await readFile(path.join(folderPath, "character.json"), "utf8")); } catch {}
    const files: string[] = await readdir(folderPath).catch((): string[] => []);
    let image = typeof manifest.image === "string" ? path.basename(manifest.image) : "";
    if (!/\.(png|webp)$/i.test(image)) image = ["avatar.png", "avatar.webp", "sprites.png", "sprites.webp"].find((candidate) => files.includes(candidate)) || files.find((candidate) => /\.(png|webp)$/i.test(candidate)) || "";
    if (!image) continue;
    publicCharacters.push({
      id: folder,
      relativePath: `${folder}/${image}`,
      descriptor: {
        id: `public:${folder}`,
        name: typeof manifest.name === "string" ? manifest.name : folder,
        url: `/characters/public/${encodeURIComponent(folder)}/${encodeURIComponent(image)}`,
        source: "public",
        agentId: typeof manifest.agentId === "string" ? manifest.agentId : undefined,
        hostId: typeof manifest.hostId === "string" ? manifest.hostId : undefined,
        shared: manifest.shared === true,
        maps: Array.isArray(manifest.maps) ? manifest.maps.filter((value: unknown) => typeof value === "string") : undefined,
        spriteSheet: manifest.spriteSheet === true,
        frameSize: typeof manifest.frameSize === "number" ? manifest.frameSize : 64,
        columns: typeof manifest.columns === "number" ? manifest.columns : 4,
        rows: typeof manifest.rows === "number" ? manifest.rows : 4,
        monochromeFilter: manifest.monochromeFilter !== false,
      },
    });
  }
}
const characterImports = publicCharacters.map((character, index) => `import publicCharacter${index} from "./characters/${character.relativePath}" with { type: "file" };`).join("\n");
const characterMap = `{ ${publicCharacters.map((character, index) => `${JSON.stringify(character.relativePath)}: publicCharacter${index}`).join(", ")} }`;
const publicCharacterDescriptors = publicCharacters.map((character) => character.descriptor);
const roomDir = path.resolve(process.cwd(), "public/rooms");
const roomFolders = (await readdir(roomDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const publicRooms = (await Promise.all(roomFolders.map(async (id) => {
  try {
    const manifest = JSON.parse(await readFile(path.join(roomDir, id, "room.json"), "utf8")) as Record<string, unknown>;
    const background = typeof manifest.background === "string" ? path.basename(manifest.background) : "bg.jpg";
    if (!(await stat(path.join(roomDir, id, background))).isFile()) return null;
    return {
      id,
      background,
      descriptor: {
        ...manifest,
        id,
        background,
        backgroundUrl: `/rooms/public/${encodeURIComponent(id)}/${encodeURIComponent(background)}`,
        source: "public",
      },
    };
  } catch {
    return null;
  }
}))).filter((room): room is NonNullable<typeof room> => room !== null);
const roomImports = publicRooms
  .map((room, index) => `import publicRoom${index} from "./rooms/${room.id}/${room.background}" with { type: "file" };`)
  .join("\n");
const roomAssetMap = `{ ${publicRooms.map((room, index) => `${JSON.stringify(`${room.id}/${room.background}`)}: publicRoom${index}`).join(", ")} }`;
const publicRoomDescriptors = publicRooms.map((room) => room.descriptor);

const serverCode = `import { serve } from "bun";
import html from "./index.html" with { type: "text" };
import manifest from "./manifest.json" with { type: "text" };
import favicon from "./favicon.ico" with { type: "file" };
import favicon16 from "./favicon-16.png" with { type: "file" };
import favicon32 from "./favicon-32.png" with { type: "file" };
import favicon48 from "./favicon-48.png" with { type: "file" };
import appleTouchIcon from "./apple-touch-icon.png" with { type: "file" };
import icon192 from "./icon-192.png" with { type: "file" };
import icon512 from "./icon-512.png" with { type: "file" };
import logo from "./logo.svg" with { type: "text" };
import {
  handleWsUpgrade,
  proxyWebSocketHandler,
  getUpstreamWsUrl,
  type ProxySocketData,
} from ${JSON.stringify(proxyHandlerPath)};
import { agents, toPublic } from ${JSON.stringify(agentConfigPath)};
import { getRemoteHosts, paseoHostsApi } from ${JSON.stringify(paseoHostsPath)};
import { paseoHostProbeApi } from ${JSON.stringify(path.join(path.dirname(paseoHostsPath), "paseo-host-probe.ts"))};
import { relayLogsApi } from ${JSON.stringify(path.join(path.dirname(paseoHostsPath), "relay-logs.ts"))};
import { roomApi } from ${JSON.stringify(roomApiPath)};
import { profileApi } from ${JSON.stringify(profileApiPath)};
import { projectActionsApi } from ${JSON.stringify(projectActionsApiPath)};
import { charactersApi } from ${JSON.stringify(charactersApiPath)};
import { roomsApi } from ${JSON.stringify(roomsApiPath)};
import { guardRoutes } from ${JSON.stringify(requestGuardPath)};
${avatarImports}
${characterImports}
${roomImports}
const avatarAssets: Record<string, string> = ${avatarMap};
const publicCharacterAssets: Record<string, string> = ${characterMap};
const publicCharacterDescriptors = ${JSON.stringify(publicCharacterDescriptors)};
const publicRoomAssets: Record<string, string> = ${roomAssetMap};
const publicRoomDescriptors = ${JSON.stringify(publicRoomDescriptors)};

const imageResponse = (asset: string, contentType: string) =>
  new Response(Bun.file(asset), {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
    },
  });

const args = process.argv.slice(2);
void getRemoteHosts().catch(() => {});
let port = Number(process.env.PORT || 5555);
let hostname = process.env.HOST || "0.0.0.0";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--port" || arg === "-p") {
    const val = args[++i];
    if (val && !isNaN(Number(val))) port = Number(val);
  } else if (arg?.startsWith("--port=")) {
    const val = arg.split("=")[1];
    if (val && !isNaN(Number(val))) port = Number(val);
  } else if (arg === "--host" || arg === "-h") {
    const val = args[++i];
    if (val) hostname = val;
  } else if (arg?.startsWith("--host=")) {
    const val = arg.split("=")[1];
    if (val) hostname = val;
  } else if (arg === "--help") {
    console.log("Get a Room - interface Paseo");
    console.log("");
    console.log("Usage: amble [options]");
    console.log("");
    console.log("Options:");
    console.log("  -p, --port <number>  Port to listen on (default: 5555, env: PORT)");
    console.log("  -h, --host <string>  Host address to bind (default: 0.0.0.0, env: HOST)");
    console.log("      --help           Show this help message");
    process.exit(0);
  }
}

// Orphelin : si l'app Tauri parente disparaît (crash, kill -9), le relais s'arrête
// au lieu de garder le port occupé.
const parentPid = Number(process.env.GETAROOM_PARENT_PID || 0);
if (parentPid > 1) {
  setInterval(() => {
    try { process.kill(parentPid, 0); } catch { process.exit(0); }
  }, 2000).unref?.();
}

const server = serve<ProxySocketData>({
  port,
  hostname,
  // 255s (Bun maximum) prevents idle keep-alive connections from being
  // closed prematurely when behind reverse proxies like Nginx.
  idleTimeout: 255,
  routes: guardRoutes({
    ...paseoHostsApi,
    ...relayLogsApi,
    ...paseoHostProbeApi,
    ...roomApi,
    ...profileApi,
    ...projectActionsApi,
    ...charactersApi,
    ...roomsApi,
    "/api/paseo/hosts/:hostId/ws": {
      async GET(req: Request & { params: { hostId: string } }, s: any) {
        const host = (await getRemoteHosts()).find((candidate) => candidate.id === req.params.hostId && candidate.enabled);
        if (!host) return new Response("Hôte inconnu ou désactivé", { status: 404 });
        return handleWsUpgrade(req, s, host.url, host.token);
      },
    },
    "/api/room/agents": {
      GET() {
        return Response.json(agents.map(toPublic), { headers: { "cache-control": "no-store" } });
      },
    },
    "/avatars/:file": {
      GET(req: Request & { params: { file: string } }) {
        const asset = avatarAssets[req.params.file];
        if (!asset) return new Response("Introuvable", { status: 404 });
        const contentType = /\\.svg$/i.test(req.params.file) ? "image/svg+xml" : /\\.jpe?g$/i.test(req.params.file) ? "image/jpeg" : "image/png";
        return new Response(Bun.file(asset), { headers: { "content-type": contentType, "cache-control": "public, max-age=86400" } });
      },
    },
    "/api/room/characters": {
      async GET(req: Request) {
        const response = await charactersApi["/api/room/characters"].GET(req);
        const data = await response.json() as { characters?: unknown[]; folder?: string };
        return Response.json({ ...data, characters: [...(data.characters || []).filter((item: any) => item?.source !== "public"), ...publicCharacterDescriptors] }, { headers: { "cache-control": "no-store" } });
      },
      POST: charactersApi["/api/room/characters"].POST,
    },
    "/characters/public/:file": {
      GET(req: Request & { params: { file: string } }) {
        const file = decodeURIComponent(req.params.file);
        const asset = publicCharacterAssets[file];
        if (!asset) return new Response("Introuvable", { status: 404 });
        return new Response(Bun.file(asset), { headers: { "content-type": /\.webp$/i.test(file) ? "image/webp" : "image/png", "cache-control": "public, max-age=3600" } });
      },
    },
    "/characters/public/:character/:file": {
      GET(req: Request & { params: { character: string; file: string } }) {
        const key = decodeURIComponent(req.params.character) + "/" + decodeURIComponent(req.params.file);
        const asset = publicCharacterAssets[key];
        if (!asset) return new Response("Introuvable", { status: 404 });
        return new Response(Bun.file(asset), { headers: { "content-type": /\.webp$/i.test(key) ? "image/webp" : "image/png", "cache-control": "public, max-age=3600" } });
      },
    },
    "/api/room/maps": {
      async GET(req: Request) {
        const response = await roomsApi["/api/room/maps"].GET(req);
        const data = await response.json() as { maps?: any[]; folder?: string };
        const merged = new Map(publicRoomDescriptors.map((map: any) => [map.id, map]));
        for (const map of data.maps || []) {
          if (!map || map.source === "public") continue;
          const base = merged.get(map.id) as any;
          const sprite = base?.sprite || map.sprite ? { ...base?.sprite, ...map.sprite } : undefined;
          merged.set(map.id, { ...base, ...map, ...(sprite ? { sprite } : {}), backgroundUrl: map.backgroundUrl || base?.backgroundUrl });
        }
        return Response.json({ ...data, maps: [...merged.values()] }, { headers: { "cache-control": "no-store" } });
      },
    },
    "/rooms/public/:id/:file": {
      GET(req: Request & { params: { id: string; file: string } }) {
        const key = decodeURIComponent(req.params.id) + "/" + decodeURIComponent(req.params.file);
        const asset = publicRoomAssets[key];
        if (!asset) return new Response("Introuvable", { status: 404 });
        const contentType = /\.png$/i.test(key) ? "image/png" : /\.webp$/i.test(key) ? "image/webp" : "image/jpeg";
        return new Response(Bun.file(asset), { headers: { "content-type": contentType, "cache-control": "public, max-age=86400" } });
      },
    },
    "/manifest.json": {
      GET() {
        return new Response(manifest, {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=86400",
          },
        });
      },
    },

    "/logo.svg": {
      GET() {
        return new Response(logo, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": "public, max-age=86400",
          },
        });
      },
    },

    "/favicon.ico": {
      GET() {
        return imageResponse(favicon, "image/x-icon");
      },
    },

    "/favicon-16.png": {
      GET() {
        return imageResponse(favicon16, "image/png");
      },
    },

    "/favicon-32.png": {
      GET() {
        return imageResponse(favicon32, "image/png");
      },
    },

    "/favicon-48.png": {
      GET() {
        return imageResponse(favicon48, "image/png");
      },
    },

    "/apple-touch-icon.png": {
      GET() {
        return imageResponse(appleTouchIcon, "image/png");
      },
    },

    "/icon-192.png": {
      GET() {
        return imageResponse(icon192, "image/png");
      },
    },

    "/icon-512.png": {
      GET() {
        return imageResponse(icon512, "image/png");
      },
    },

    "/api/health": {
      GET() {
        return Response.json({ status: "ok", service: "amble" });
      },
    },

    "/api/paseo/ws": {
      GET(req: Request, s: any) {
        return handleWsUpgrade(req, s);
      },
    },

    "/ws": {
      GET(req: Request, s: any) {
        return handleWsUpgrade(req, s);
      },
    },

    "/*": {
      GET() {
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-cache",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  }),

  websocket: proxyWebSocketHandler,
  development: false,
});

console.log(\`🚀 Get a Room relay running at \${server.url}\`);
console.log(\`🔌 Paseo WebSocket proxy active at /api/paseo/ws -> \${getUpstreamWsUrl()}\`);

process.on("SIGINT", () => {
  server.stop(true);
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.stop(true);
  process.exit(0);
});
`;

try {
  await writeFile(path.join(tempDir, "index.html"), bundledHtml, "utf8");
  await writeFile(
    path.join(tempDir, "manifest.json"),
    await Bun.file(path.resolve(process.cwd(), "src/manifest.json")).text(),
    "utf8",
  );
  await writeFile(
    path.join(tempDir, "logo.svg"),
    await Bun.file(path.resolve(process.cwd(), "src/logo.svg")).text(),
    "utf8",
  );
  for (const asset of [
    "favicon.ico",
    "favicon-16.png",
    "favicon-32.png",
    "favicon-48.png",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
  ]) {
    await copyFile(
      path.resolve(process.cwd(), "src", asset),
      path.join(tempDir, asset),
    );
  }
  await writeFile(path.join(tempDir, "entry.ts"), serverCode, "utf8");
  await mkdir(path.join(tempDir, "avatars"), { recursive: true });
  await Promise.all(avatarNames.map((name) => copyFile(path.join(avatarDir, name), path.join(tempDir, "avatars", name))));
  await mkdir(path.join(tempDir, "characters"), { recursive: true });
  await Promise.all(publicCharacters.map(async (character) => {
    const target = path.join(tempDir, "characters", character.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(characterDir, character.relativePath), target);
  }));
  await Promise.all(publicRooms.map(async (room) => {
    const target = path.join(tempDir, "rooms", room.id);
    await mkdir(target, { recursive: true });
    await copyFile(path.join(roomDir, room.id, room.background), path.join(target, room.background));
  }));

  // Step 3: Compile into standalone executable
  console.log(`⚡ [3/3] Compiling standalone executable [${TARGET}]...`);
  await mkdir(path.dirname(outfile), { recursive: true });

  const buildProc = Bun.spawn(
    [
      "bun",
      "build",
      "--compile",
      "--minify",
      "--bytecode",
      `--target=${TARGET}`,
      path.join(tempDir, "entry.ts"),
      `--outfile=${outfile}`,
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
    }
  );

  const exitCode = await buildProc.exited;
  if (exitCode !== 0) {
    console.error(`❌ Compilation failed with exit code ${exitCode}`);
    process.exit(exitCode);
  }

  await chmod(outfile, 0o755);

  const fileStat = await stat(outfile);
  const sizeMb = (fileStat.size / (1024 * 1024)).toFixed(2);

  console.log("");
  console.log("✨ Binaire autonome Get a Room compilé !");
  console.log(`   Binary:  ${path.relative(process.cwd(), outfile) || outfile}`);
  console.log(`   Size:    ${sizeMb} MB`);
  console.log(`   Cible :  ${TARGET}`);
  console.log("");
  console.log("   Run with:");
  console.log(`     ${outfile}`);
  console.log(`     PORT=8080 ${outfile}`);
  console.log("");
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
