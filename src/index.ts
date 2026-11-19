import { serve } from "bun";
import index from "./index.html";
import manifest from "./manifest.json";
import favicon from "./favicon.ico" with { type: "file" };
import favicon16 from "./favicon-16.png" with { type: "file" };
import favicon32 from "./favicon-32.png" with { type: "file" };
import favicon48 from "./favicon-48.png" with { type: "file" };
import appleTouchIcon from "./apple-touch-icon.png" with { type: "file" };
import icon192 from "./icon-192.png" with { type: "file" };
import icon512 from "./icon-512.png" with { type: "file" };
import logo from "./logo.svg" with { type: "text" };
import { roomApi } from "./server/room-api";
import { paseoHostProbeApi } from "./server/paseo-host-probe";
import { relayLogsApi } from "./server/relay-logs";
import { getRemoteHosts, paseoHostsApi } from "./server/paseo-hosts";
import { profileApi } from "./server/profile-api";
import {
  handleWsUpgrade,
  proxyWebSocketHandler,
  getUpstreamWsUrl,
  type ProxySocketData,
} from "./lib/paseo/proxy-handler";

const port = Number(process.env.PORT || 5555);
const hostArg = process.argv.indexOf("--host");
const hostname = process.env.HOST || (hostArg >= 0 ? process.argv[hostArg + 1] : undefined) || "127.0.0.1";
const imageResponse = (asset: string, contentType: string) =>
  new Response(Bun.file(asset), {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
    },
  });

// Disable Bun's internal dev server Host header / DNS-rebinding check so it
// never blocks proxied requests (e.g. "Blocked: Host header does not match the dev server").
// Host enforcement is handled upstream by reverse proxies.
const server = serve<ProxySocketData>({
  port,
  hostname,
  // 255s (Bun maximum) prevents idle HTTP keep-alive connections from being
  // closed prematurely when behind reverse proxies like Nginx.
  idleTimeout: 255,
  routes: {
    "/manifest.json": {
      GET() {
        return Response.json(manifest, {
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

    ...roomApi,
    ...paseoHostsApi,
    ...profileApi,
    ...relayLogsApi,
    ...paseoHostProbeApi,

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

    "/api/paseo/hosts/:hostId/ws": {
      async GET(req: Request & { params: { hostId: string } }, s: any) {
        const host = (await getRemoteHosts()).find((candidate) => candidate.id === req.params.hostId && candidate.enabled);
        if (!host) return new Response("Hôte inconnu ou désactivé", { status: 404 });
        return handleWsUpgrade(req, s, host.url, host.token);
      },
    },

    "/ws": {
      GET(req: Request, s: any) {
        return handleWsUpgrade(req, s);
      },
    },

    // Serve index.html for all unmatched routes.
    "/*": index,
  },

  websocket: proxyWebSocketHandler,

  // Never enforce dev server host checking
  development: false,
});

console.log(`🚀 Amble dev server running at ${server.url}`);
console.log(`🔌 Paseo WebSocket proxy active at /api/paseo/ws -> ${getUpstreamWsUrl()}`);
