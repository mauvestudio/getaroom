// Protection du relais local contre les requêtes inter-origines.
//
// Le relais écoute sur 127.0.0.1 et ouvre, côté serveur, des WebSockets vers le
// daemon Paseo (avec le jeton des hôtes distants). Sans ce garde, n'importe quel
// site ouvert dans un navigateur pourrait se connecter à ws://127.0.0.1:5555/ws
// ou poster vers /api/* et piloter les agents/terminaux Paseo.

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);

function allowedOrigins(): Set<string> {
  return new Set(
    (process.env.GETAROOM_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  );
}

function hostnameOf(host: string): string {
  try {
    return new URL(`http://${host}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Refuse les Host non loopback quand le relais est réservé à l'app locale (anti DNS rebinding). */
function hostAllowed(req: Request): boolean {
  if (process.env.GETAROOM_LOOPBACK_ONLY !== "1") return true;
  const host = req.headers.get("host");
  return !!host && LOOPBACK_HOSTS.has(hostnameOf(host));
}

export function isTrustedRequest(req: Request): boolean {
  if (!hostAllowed(req)) return false;
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  // Les navigateurs envoient toujours Origin sur un POST inter-origine et sur un
  // handshake WebSocket : son absence signale un client natif (curl, CLI…).
  if (!origin) return true;
  if (origin === "null") return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol === "tauri:" || parsed.hostname === "tauri.localhost") return true;
  if (allowedOrigins().has(parsed.origin)) return true;
  const host = req.headers.get("host");
  return !!host && parsed.host.toLowerCase() === host.toLowerCase();
}

export function forbiddenResponse(): Response {
  return Response.json(
    { error: "Requête inter-origine refusée par le relais Get a Room." },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Enveloppe les handlers mutants (POST/PUT/PATCH/DELETE) d'une table de routes
 * Bun avec le contrôle d'origine. Les GET restent intacts, sauf en mode
 * loopback-only où le Host est aussi vérifié.
 */
export function guardRoutes<T extends Record<string, unknown>>(routes: T): T {
  const guarded: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(routes)) {
    if (!value || typeof value !== "object" || value instanceof Response) {
      guarded[path] = value;
      continue;
    }
    const methods = value as Record<string, unknown>;
    const keys = Object.keys(methods);
    if (!keys.length || !keys.every((key) => HTTP_METHODS.has(key) && typeof methods[key] === "function")) {
      guarded[path] = value;
      continue;
    }
    const wrapped: Record<string, unknown> = {};
    for (const key of keys) {
      const handler = methods[key] as (req: Request, ...rest: unknown[]) => unknown;
      const mutating = !SAFE_METHODS.has(key);
      wrapped[key] = (req: Request, ...rest: unknown[]) => {
        // Appel interne (composition de routes sans Request) : rien à vérifier.
        if (!(req instanceof Request)) return handler(req, ...rest);
        if ((mutating && !isTrustedRequest(req)) || !hostAllowed(req)) return forbiddenResponse();
        return handler(req, ...rest);
      };
    }
    guarded[path] = wrapped;
  }
  return guarded as T;
}
