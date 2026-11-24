import { existsSync } from "node:fs";
import net from "node:net";
import { getUpstreamWsUrl } from "../lib/paseo/proxy-handler";
import { childEnv, enrichPath, findBinary } from "./user-path";
import { guardRoutes, isLocalClient, isTrustedRequest } from "./request-guard";
import { recordRelayLog } from "./relay-logs";

const BUNDLED_CLI = "/Applications/Paseo.app/Contents/Resources/bin/paseo";
/** CLI de providers que le démon cherche dans son PATH. */
export const PROVIDER_BINARIES = ["claude", "codex", "opencode", "gemini"] as const;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

let busy = false;

function upstream(): { host: string; port: number; local: boolean } {
  const url = new URL(getUpstreamWsUrl());
  return { host: url.hostname, port: Number(url.port) || (url.protocol === "wss:" ? 443 : 80), local: LOOPBACK.has(url.hostname) };
}

export function isReachable(host: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/** CLI Paseo : celle embarquée dans l'app si elle existe, sinon `paseo` dans le PATH enrichi. */
export function resolvePaseoCli(): string | null {
  if (existsSync(BUNDLED_CLI)) return BUNDLED_CLI;
  return findBinary("paseo", enrichPath(process.env.PATH).path);
}

async function run(cli: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  const proc = Bun.spawn([cli, ...args], { env: childEnv(), stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { ok: code === 0, output: `${stdout}\n${stderr}`.trim().split("\n").slice(-6).join("\n") };
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntilReachable(host: string, port: number, totalMs: number): Promise<boolean> {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    if (await isReachable(host, port)) return true;
    await Bun.sleep(400);
  }
  return false;
}

export async function daemonStatus() {
  const target = upstream();
  const { path: searchPath } = enrichPath(process.env.PATH);
  return {
    local: target.local,
    endpoint: `${target.host}:${target.port}`,
    reachable: await isReachable(target.host, target.port),
    cli: resolvePaseoCli(),
    binaries: PROVIDER_BINARIES.map((name) => ({ name, path: findBinary(name, searchPath) })),
    searchedDirs: searchPath.split(":").filter(Boolean),
  };
}

type ControlAction = "start" | "restart";

/**
 * « restart » = stop puis start : `paseo daemon restart` garde l'environnement du superviseur
 * (donc le PATH minimal d'un lancement GUI), alors qu'un nouveau start reprend le PATH complété.
 */
export async function controlDaemon(action: ControlAction): Promise<{ ok: boolean; message: string }> {
  const target = upstream();
  if (!target.local) return { ok: false, message: "Le démon configuré n’est pas sur cette machine : redémarrage impossible depuis ici." };
  const cli = resolvePaseoCli();
  if (!cli) return { ok: false, message: "CLI Paseo introuvable (Paseo.app n’est pas installée et `paseo` n’est pas dans le PATH)." };

  if (action === "restart") {
    const stopped = await run(cli, ["daemon", "stop", "--timeout", "15"], 25_000);
    if (!stopped.ok) recordRelayLog("warning", `Arrêt du démon : ${stopped.output || "échec"}`);
  }
  const started = await run(cli, ["daemon", "start", "--timeout", "15"], 30_000);
  const reachable = started.ok && await waitUntilReachable(target.host, target.port, 8_000);
  const message = reachable
    ? action === "restart" ? "Démon Paseo redémarré avec le PATH complet." : "Démon Paseo démarré."
    : `Le démon n’a pas démarré${started.output ? ` : ${started.output}` : "."}`;
  recordRelayLog(reachable ? "info" : "error", message);
  return { ok: reachable, message };
}

const noStore = { "cache-control": "no-store" };

function control(action: ControlAction) {
  return async (request: Request, server: Bun.Server<unknown>) => {
    if (!isLocalClient(request, server) || !isTrustedRequest(request)) {
      return Response.json({ ok: false, message: "Réservé à l’application locale." }, { status: 403, headers: noStore });
    }
    if (busy) return Response.json({ ok: false, message: "Une opération sur le démon est déjà en cours." }, { status: 429, headers: noStore });
    busy = true;
    try {
      return Response.json(await controlDaemon(action), { headers: noStore });
    } catch (error) {
      return Response.json({ ok: false, message: error instanceof Error ? error.message : "Opération impossible." }, { status: 500, headers: noStore });
    } finally {
      busy = false;
    }
  };
}

export const paseoDaemonApi = guardRoutes({
  "/api/paseo/daemon/status": {
    async GET() {
      return Response.json(await daemonStatus(), { headers: noStore });
    },
  },
  "/api/paseo/daemon/start": { POST: control("start") },
  "/api/paseo/daemon/restart": { POST: control("restart") },
});
