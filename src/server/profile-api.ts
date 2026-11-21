import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createConnection } from "node:net";
import { appDataFile, fileExists, readJson, writeJson } from "./app-data";
import { getRemoteHosts, saveRemoteHosts, publicHost } from "./paseo-hosts";
import type { PaseoHost } from "../lib/paseo/hosts";
import { getRoomProfiles, saveRoomProfiles } from "./room-api";
import type { AgentConfig } from "../config/agents";
import { guardRoutes, isLocalClient } from "./request-guard";

const preferencesFile = appDataFile("preferences.json");
const onboardingFile = appDataFile("onboarding.json");
type Preferences = Record<string, string>;
type PortableProfile = { format: "getaroom-profile"; version: 1; preferences: Preferences; hosts: PaseoHost[]; agents?: AgentConfig[]; projects?: unknown[] };

function cleanPreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Préférences invalides.");
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => key.length < 128 && typeof item === "string" && item.length < 1_000_000)) as Preferences;
}

export async function getPreferences(): Promise<Preferences> {
  return cleanPreferences(await readJson(preferencesFile, {}));
}

export async function savePreferences(value: unknown, replace = false): Promise<Preferences> {
  const next = cleanPreferences(value);
  const saved = replace ? next : { ...await getPreferences(), ...next };
  await writeJson(preferencesFile, saved);
  return saved;
}

export function withoutSecrets(preferences: Preferences): Preferences {
  return Object.fromEntries(Object.entries(preferences).filter(([key]) => !/(token|secret|password|api.?key|paseo-hosts|sync-path)/i.test(key)));
}

export { publicHost };

async function portableProfile(includeTokens = false): Promise<PortableProfile> {
  const hosts = await getRemoteHosts();
  return {
    format: "getaroom-profile", version: 1,
    preferences: includeTokens ? await getPreferences() : withoutSecrets(await getPreferences()),
    hosts: includeTokens ? hosts : hosts.map(publicHost),
    agents: await getRoomProfiles(),
    projects: await readJson(appDataFile("projects.json"), []),
  };
}

function validateProfile(value: unknown): PortableProfile {
  if (!value || typeof value !== "object") throw new Error("Profil invalide.");
  const profile = value as PortableProfile;
  if (profile.format !== "getaroom-profile" || profile.version !== 1 || !Array.isArray(profile.hosts)) throw new Error("Format de profil non pris en charge.");
  cleanPreferences(profile.preferences);
  return profile;
}

async function importProfile(value: unknown, mode: "merge" | "replace") {
  const profile = validateProfile(value);
  const existingHosts = await getRemoteHosts();
  const current = mode === "merge" ? existingHosts : [];
  const hosts = [...current.filter((host) => !profile.hosts.some((item) => item.id === host.id)), ...profile.hosts.map((host) => ({
    ...host, token: host.token || existingHosts.find((item) => item.id === host.id)?.token,
  }))];
  await saveRemoteHosts(hosts);
  const retainedSecrets = Object.fromEntries(Object.entries(await getPreferences()).filter(([key]) => /(token|secret|password|api.?key)/i.test(key)));
  await savePreferences(mode === "replace" ? { ...retainedSecrets, ...profile.preferences } : profile.preferences, mode === "replace");
  if (profile.agents) await saveRoomProfiles({ agents: profile.agents });
  if (Array.isArray(profile.projects)) await writeJson(appDataFile("projects.json"), profile.projects);
  await writeJson(onboardingFile, { complete: true });
  return portableProfile(false);
}

function checkedSyncPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Choisis un chemin de fichier JSON.");
  const expanded = value.startsWith("~/") ? path.join(homedir(), value.slice(2)) : path.resolve(value);
  const home = homedir() + path.sep;
  if (!expanded.startsWith(home) || !expanded.endsWith(".json") || expanded.includes(`${path.sep}..${path.sep}`)) {
    throw new Error("Le fichier synchronisé doit être un JSON dans ton dossier utilisateur.");
  }
  return expanded;
}

function localDaemonAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 6767 });
    socket.setTimeout(350);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

async function pathExists(value: string): Promise<boolean> {
  try { await stat(value); return true; } catch { return false; }
}

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store" } });
const failed = (error: unknown) => json({ error: error instanceof Error ? error.message : "Opération impossible." }, 400);

export const profileApi = guardRoutes({
  "/api/profile/projects": {
    async GET() { return json(await readJson(appDataFile("projects.json"), [])); },
    async POST(req: Request) {
      try {
        const raw = await req.json();
        if (!Array.isArray(raw)) throw new Error("Liste de projets invalide.");
        const projects = raw.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.rootPath === "string")
          .map(({ id, name, rootPath }) => ({ id, name, rootPath }));
        await writeJson(appDataFile("projects.json"), projects);
        return json({ ok: true });
      } catch (error) { return failed(error); }
    },
  },
  "/api/profile/preferences": {
    async GET() { return json(await getPreferences()); },
    async POST(req: Request) {
      try { return json(await savePreferences(await req.json(), true)); } catch (error) { return failed(error); }
    },
  },
  "/api/profile/status": {
    async GET() {
      const complete = (await readJson<{ complete?: boolean }>(onboardingFile, {})).complete === true;
      const hasPreferences = await fileExists(preferencesFile);
      const hadStoredHosts = await fileExists(appDataFile("hosts.json"));
      const hadStoredAgents = await fileExists(appDataFile("agents.json"));
      const hosts = await getRemoteHosts();
      const hadGetaroomHosts = await fileExists(path.join(homedir(), ".getaroom", "hosts.json"));
      const paseoDetected = await pathExists(path.join(homedir(), ".paseo")) ||
        await pathExists(path.join(homedir(), "Library", "Application Support", "Paseo")) || hosts.length > 0 || await localDaemonAvailable();
      return json({ firstRun: !complete && !hasPreferences && !hadStoredHosts && !hadStoredAgents && !hadGetaroomHosts, paseoDetected, hostsCount: hosts.length });
    },
  },
  "/api/profile/onboarding": {
    async POST() { await writeJson(onboardingFile, { complete: true }); return json({ ok: true }); },
  },
  "/api/profile/export": {
    // Les jetons ne sortent jamais vers un client distant.
    async GET(req: Request, server?: Bun.Server<unknown>) { return json(await portableProfile(new URL(req.url).searchParams.get("includeTokens") === "true" && isLocalClient(req, server))); },
  },
  "/api/profile/import": {
    async POST(req: Request) {
      try {
        const input = await req.json() as { profile: unknown; mode?: string };
        return json(await importProfile(input.profile, input.mode === "replace" ? "replace" : "merge"));
      } catch (error) { return failed(error); }
    },
  },
  "/api/profile/sync": {
    async GET(req: Request) {
      try {
        const file = checkedSyncPath(new URL(req.url).searchParams.get("path"));
        return json(validateProfile(JSON.parse(await readFile(file, "utf8"))));
      } catch (error) { return failed(error); }
    },
    async POST(req: Request, server?: Bun.Server<unknown>) {
      try {
        const { path: value, includeTokens = false } = await req.json() as { path?: string; includeTokens?: boolean };
        const file = checkedSyncPath(value);
        await writeJson(file, await portableProfile(includeTokens === true && isLocalClient(req, server)));
        return json({ ok: true, path: file });
      } catch (error) { return failed(error); }
    },
  },
});
