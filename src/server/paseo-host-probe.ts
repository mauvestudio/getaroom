import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WebSocketLike } from "@getpaseo/client/internal/daemon-client-transport-types";
import { openPaseoWebSocket } from "./paseo-websocket";
import { normalizeHostWsUrl } from "../lib/paseo/hosts";
import { guardRoutes } from "./request-guard";

const loopbackNames = new Set(["127.0.0.1", "localhost", "[::1]"]);
let running = false;

export const paseoHostProbeApi = guardRoutes({
  "/api/paseo/hosts/test": {
    async POST(request: Request, server: Bun.Server<unknown>) {
      const address = server.requestIP(request)?.address;
      const requestUrl = new URL(request.url);
      const origin = request.headers.get("origin");
      if (!address || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address) ||
          !loopbackNames.has(requestUrl.hostname) || origin !== requestUrl.origin ||
          !request.headers.get("content-type")?.startsWith("application/json")) {
        return Response.json({ message: "Le test est réservé à l’application locale." }, { status: 403 });
      }
      if (running) return Response.json({ message: "Un test est déjà en cours." }, { status: 429 });
      running = true;
      try {
        const input = await request.json();
        const url = typeof input?.url === "string" ? normalizeHostWsUrl(input.url) : null;
        const token = typeof input?.token === "string" ? input.token.trim() : "";
        if (!url || token.length > 4096) return Response.json({ ok: false, message: "Adresse ou jeton invalide." }, { status: 400 });
        const target = new URL(url);
        if (target.username || target.password || target.hash) {
          return Response.json({ ok: false, message: "Utilise le champ Jeton pour l’authentification." }, { status: 400 });
        }

        const candidates = [target];
        if (target.pathname === "/ws" || target.pathname === "/") {
          const fallback = new URL(target);
          fallback.pathname = target.pathname === "/ws" ? "/" : "/ws";
          candidates.push(fallback);
        }

        const failures: string[] = [];
        const deadline = performance.now() + 10000;
        for (const [index, endpoint] of candidates.entries()) {
          const client = new DaemonClient({
            url: endpoint.href,
            webSocketFactory: (url) => openPaseoWebSocket(url, token) as unknown as WebSocketLike,
            clientId: crypto.randomUUID(),
            reconnect: { enabled: false },
          });
          let timer: ReturnType<typeof setTimeout> | undefined;
          const start = performance.now();
          try {
            await Promise.race([
              client.connect(),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Délai de connexion dépassé.")),
                  Math.max(1, (deadline - start) / (candidates.length - index)));
              }),
            ]);
            return Response.json({
              ok: true,
              endpoint: endpoint.href,
              latencyMs: Math.round(performance.now() - start),
              version: client.getLastServerInfoMessage()?.version ?? undefined,
              message: `Connexion Paseo établie sur ${endpoint.pathname}.`,
            });
          } catch (error) {
            let message = error instanceof Error ? error.message : "Connexion impossible.";
            if (token) message = message.split(token).join("[masqué]");
            message = message.split(endpoint.href).join(endpoint.pathname);
            if (/password|unauthorized|forbidden|\b40[13]\b/i.test(message)) {
              return Response.json({ ok: false, message: `Authentification Paseo : ${message}` });
            }
            failures.push(`${endpoint.pathname} : ${message}`);
          } finally {
            clearTimeout(timer);
            await client.close();
          }
        }
        return Response.json({ ok: false, message: failures.join(" · ") });
      } catch {
        return Response.json({ ok: false, message: "Le relais n’a pas pu lancer le test Paseo." }, { status: 400 });
      } finally {
        running = false;
      }
    },
  },
});
