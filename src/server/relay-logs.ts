export interface RelayLogEntry { at: string; level: "info" | "warning" | "error"; message: string; target?: string; }
const entries: RelayLogEntry[] = [];

export function recordRelayLog(level: RelayLogEntry["level"], message: string, targetUrl?: string) {
  let target: string | undefined;
  try {
    const url = new URL(targetUrl || "");
    target = `${url.protocol}//${url.host}${url.pathname}`;
  } catch {}
  entries.push({ at: new Date().toISOString(), level, message, target });
  if (entries.length > 200) entries.splice(0, entries.length - 200);
}

export function getRelayLogs() { return [...entries].reverse(); }

export const relayLogsApi = {
  "/api/paseo/logs": {
    GET() { return Response.json(getRelayLogs(), { headers: { "cache-control": "no-store" } }); },
  },
};
