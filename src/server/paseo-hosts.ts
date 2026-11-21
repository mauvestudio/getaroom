import { readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { LOCAL_HOST, normalizeSavedHost, type PaseoHost } from "../lib/paseo/hosts";
import { appDataFile, readJson, writeJson } from "./app-data";
import { guardRoutes, isLocalClient } from "./request-guard";

const hostFile = appDataFile("hosts.json");
const oldGetaroomHostFile = path.join(homedir(), ".getaroom", "hosts.json");
const legacyHostsFile = path.join(homedir(), ".paseo", "hosts.json");
const nativeSupportHostsFile = path.join(homedir(), "Library", "Application Support", "Paseo", "hosts.json");
const paseoCli = "/Applications/Paseo.app/Contents/Resources/bin/paseo";

function toHost(value: unknown, index: number): PaseoHost | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, any>;
  const connection = item.connection && typeof item.connection === "object" ? item.connection : {};
  const candidate = normalizeSavedHost({
    id: item.id || item.registrationId || item.hostId || `imported-${index + 1}`,
    name: item.name || item.label || item.displayName || connection.name || `Hôte Paseo ${index + 1}`,
    url: item.url || item.wsUrl || item.websocketUrl || item.endpoint || connection.endpoint || "",
    token: item.token || item.authToken || connection.password,
    enabled: item.enabled ?? item.active ?? true,
    imported: true,
  });
  return candidate;
}

function extractHosts(value: unknown): PaseoHost[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? ((value as any).hosts || (value as any).entries || (value as any).registrations || [])
      : [];
  if (!Array.isArray(raw)) return [];
  return raw.map(toHost).filter((host): host is PaseoHost => !!host);
}

async function importNativeHosts(): Promise<PaseoHost[]> {
  for (const file of [legacyHostsFile, nativeSupportHostsFile]) try {
    const fromFile = extractHosts(JSON.parse(await readFile(file, "utf8")));
    if (fromFile.length) return fromFile;
  } catch {}
  try {
    const result = Bun.spawnSync({ cmd: [paseoCli, "host", "ls", "--json"], timeout: 2500 });
    if (result.exitCode === 0) {
      return extractHosts(JSON.parse(new TextDecoder().decode(result.stdout)));
    }
  } catch {}
  return [];
}

async function readHosts(): Promise<PaseoHost[]> {
  try {
    return extractHosts(JSON.parse(await readFile(hostFile, "utf8")));
  } catch {}
  const oldHosts = extractHosts(await readJson(oldGetaroomHostFile, []));
  if (oldHosts.length) {
    await writeHosts(oldHosts);
    const verified = extractHosts(await readJson(hostFile, []));
    if (verified.length === oldHosts.length && verified.every((host, index) => host.id === oldHosts[index]?.id && host.url === oldHosts[index]?.url && host.token === oldHosts[index]?.token)) {
      await unlink(oldGetaroomHostFile).catch(() => {});
    }
    return oldHosts;
  }
  const imported = await importNativeHosts();
  if (imported.length) await writeHosts(imported).catch(() => {});
  return imported;
}

async function writeHosts(hosts: PaseoHost[]): Promise<void> {
  await writeJson(hostFile, hosts);
}

/** Hôte sans aucun secret (jeton, identifiants dans l'URL). */
export function publicHost(host: PaseoHost): PaseoHost {
  let url = host.url;
  try { const parsed = new URL(url); parsed.username = ""; parsed.password = ""; url = parsed.toString(); } catch {}
  const { token: _token, ...safe } = host;
  return { ...safe, url };
}

/** Un client distant reçoit des hôtes expurgés : son enregistrement ne doit pas effacer les secrets. */
export function restoreHostSecrets(incoming: unknown, existing: readonly PaseoHost[]): unknown {
  if (!Array.isArray(incoming)) return incoming;
  const byId = new Map(existing.map((host) => [host.id, host]));
  return incoming.map((value) => {
    const candidate = normalizeSavedHost(value);
    const stored = candidate ? byId.get(candidate.id) : undefined;
    if (!candidate || !stored) return value;
    return {
      ...candidate,
      token: candidate.token ?? stored.token,
      url: candidate.url === publicHost(stored).url ? stored.url : candidate.url,
    };
  });
}

export async function getRemoteHosts(): Promise<PaseoHost[]> {
  return readHosts();
}

export async function saveRemoteHosts(value: unknown): Promise<PaseoHost[]> {
  if (!Array.isArray(value)) throw new Error("La liste d’hôtes doit être un tableau.");
  const hosts = value.map(normalizeSavedHost);
  if (hosts.some((host) => !host)) throw new Error("Un hôte contient un nom, un identifiant ou une URL WebSocket invalide.");
  const normalized = hosts as PaseoHost[];
  const ids = new Set<string>();
  for (const host of normalized) {
    if (ids.has(host.id)) throw new Error(`Identifiant d’hôte en double : ${host.id}`);
    ids.add(host.id);
  }
  await writeHosts(normalized);
  return normalized;
}

export const paseoHostsApi = guardRoutes({
  "/api/paseo/hosts": {
    async GET(req: Request, server?: Bun.Server<unknown>) {
      try {
        const hosts = await readHosts();
        const visible = isLocalClient(req, server) ? hosts : hosts.map(publicHost);
        return Response.json([LOCAL_HOST, ...visible], { headers: { "cache-control": "no-store" } });
      } catch {
        return Response.json([LOCAL_HOST], { headers: { "cache-control": "no-store" } });
      }
    },
    async POST(req: Request, server?: Bun.Server<unknown>) {
      try {
        const local = isLocalClient(req, server);
        const body = await req.json();
        const saved = await saveRemoteHosts(local ? body : restoreHostSecrets(body, await readHosts()));
        return Response.json([LOCAL_HOST, ...(local ? saved : saved.map(publicHost))], { headers: { "cache-control": "no-store" } });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Configuration d’hôtes invalide." }, { status: 400 });
      }
    },
  },
});
