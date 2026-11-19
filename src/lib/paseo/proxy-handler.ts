import type { ServerWebSocket } from "bun";
import { openPaseoWebSocket } from "../../server/paseo-websocket";
import { recordRelayLog } from "../../server/relay-logs";

export interface ProxySocketData {
  clientProtocol?: string;
  upstreamToken?: string;
  targetUrl: string;
  upstreamWs?: WebSocket;
  queue: (string | ArrayBufferView | ArrayBuffer)[];
}

export function normalizeWsUrl(url: string): string {
  let normalized = url.trim();
  if (normalized.startsWith("http://")) {
    normalized = "ws://" + normalized.slice("http://".length);
  } else if (normalized.startsWith("https://")) {
    normalized = "wss://" + normalized.slice("https://".length);
  } else if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
    normalized = `ws://${normalized}`;
  }
  try {
    const parsed = new URL(normalized);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = "/ws";
      return parsed.toString();
    }
    return normalized;
  } catch {
    return normalized;
  }
}

export function getUpstreamWsUrl(): string {
  // Explicit daemon overrides
  const explicit = (
    process.env.PASEO_DAEMON_WS_URL ||
    process.env.PASEO_DAEMON_URL ||
    process.env.PASEO_WS_URL ||
    ""
  ).trim();

  if (explicit) {
    return normalizeWsUrl(explicit);
  }

  // When running as a Paseo-managed service:
  // - PASEO_PORT and PASEO_URL represent Amble's own service port & public URL
  // - PASEO_LISTEN represents the daemon's listen address (e.g. "0.0.0.0:6767")
  const isService = Boolean(process.env.PASEO_PORT);
  if (isService) {
    const listen = (process.env.PASEO_LISTEN || "").trim();
    if (listen) {
      const parts = listen.split(":");
      const port = parts[parts.length - 1];
      if (port && !isNaN(Number(port))) {
        return `ws://127.0.0.1:${port}/ws`;
      }
    }
    return "ws://127.0.0.1:6767/ws";
  }

  // In standalone mode (not a Paseo service), PASEO_URL may be set by the user to point to daemon
  if (process.env.PASEO_URL) {
    return normalizeWsUrl(process.env.PASEO_URL.trim());
  }

  return "ws://127.0.0.1:6767/ws";
}

export function safeClose(
  ws: { close(code?: number, reason?: string): void },
  code?: number,
  reason?: string
) {
  try {
    const isValidCode =
      typeof code === "number" &&
      ((code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) ||
        (code >= 3000 && code <= 4999));
    if (isValidCode) {
      ws.close(code, reason);
    } else {
      ws.close();
    }
  } catch {
    try {
      ws.close();
    } catch {}
  }
}

export function handleWsUpgrade(
  req: Request,
  server: { upgrade(req: Request, options?: { data?: ProxySocketData }): boolean },
  upstreamUrl?: string,
  upstreamToken?: string,
): Response | void {
  const proto = req.headers.get("sec-websocket-protocol");
  const clientUrl = new URL(req.url);
  const target = new URL(upstreamUrl || getUpstreamWsUrl());
  if (clientUrl.search) {
    target.search = clientUrl.search;
  }

  const bearerProtocol = proto?.split(",").map((item) => item.trim()).find((item) => item.startsWith("paseo.bearer."));
  const success = server.upgrade(req, {
    ...(bearerProtocol ? { headers: { "Sec-WebSocket-Protocol": bearerProtocol } } : {}),
    data: {
      clientProtocol: proto || undefined,
      upstreamToken,
      targetUrl: target.toString(),
      queue: [],
    },
  });

  if (!success) {
    return new Response("Expected WebSocket Upgrade", {
      status: 426,
      headers: { Upgrade: "websocket" },
    });
  }
}

export const proxyWebSocketHandler = {
  idleTimeout: 255,
  open(clientWs: ServerWebSocket<ProxySocketData>) {
    clientWs.binaryType = "arraybuffer";
    const { clientProtocol, targetUrl, queue } = clientWs.data;
    const subprotocols = clientProtocol
      ? clientProtocol.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
    recordRelayLog("info", "Ouverture du tunnel WebSocket Paseo", targetUrl);

    try {
      const token = clientWs.data.upstreamToken || subprotocols?.find((item) => item.startsWith("paseo.bearer."))?.slice("paseo.bearer.".length);
      const upstreamWs = openPaseoWebSocket(targetUrl, token, subprotocols);
      clientWs.data.upstreamWs = upstreamWs;
      upstreamWs.binaryType = "arraybuffer";

      upstreamWs.onopen = () => {
        recordRelayLog("info", "Connexion WebSocket distante établie", targetUrl);
        while (queue.length > 0) {
          const item = queue.shift()!;
          try {
            upstreamWs.send(item as any);
          } catch (err) {
            console.warn("[Amble Proxy] Error sending queued message:", err);
          }
        }
      };

      upstreamWs.onmessage = (event) => {
        try {
          clientWs.send(event.data);
        } catch (err) {
          console.warn("[Amble Proxy] Error relaying upstream message:", err);
        }
      };

      upstreamWs.onerror = (err) => {
        recordRelayLog("error", `Erreur WebSocket distante : ${String(err)}`, targetUrl);
        console.warn("[Amble Proxy] Upstream Paseo error:", err);
      };

      upstreamWs.onclose = (event) => {
        recordRelayLog(event.code === 1000 ? "info" : "warning", `Tunnel fermé (code ${event.code}${event.reason ? ` · ${event.reason}` : ""})`, targetUrl);
        safeClose(clientWs, event.code, event.reason);
      };
    } catch (err) {
      recordRelayLog("error", `Échec d’ouverture du tunnel : ${err instanceof Error ? err.message : String(err)}`, targetUrl);
      console.error("[Amble Proxy] Failed to connect to upstream Paseo daemon:", err);
      safeClose(clientWs, 1011, "Upstream connection failed");
    }
  },

  message(clientWs: ServerWebSocket<ProxySocketData>, message: string | Buffer<ArrayBuffer>) {
    const upstreamWs = clientWs.data.upstreamWs;
    if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
      try {
        upstreamWs.send(message as any);
      } catch (err) {
        console.warn("[Amble Proxy] Error forwarding message to upstream:", err);
      }
    } else if (!upstreamWs || upstreamWs.readyState === WebSocket.CONNECTING) {
      if (clientWs.data.queue.length < 500) {
        clientWs.data.queue.push(message);
      }
    }
  },

  close(clientWs: ServerWebSocket<ProxySocketData>, code: number, reason: string) {
    const upstreamWs = clientWs.data.upstreamWs;
    if (upstreamWs) {
      safeClose(upstreamWs, code, reason);
    }
  },
};
