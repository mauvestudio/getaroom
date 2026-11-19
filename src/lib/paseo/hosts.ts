export interface PaseoHost {
  id: string;
  name: string;
  url: string;
  token?: string;
  enabled: boolean;
  local?: boolean;
  imported?: boolean;
}

export const LOCAL_HOST_ID = "local";
export const LOCAL_HOST: PaseoHost = {
  id: LOCAL_HOST_ID,
  name: "MacBook Air",
  url: "ws://127.0.0.1:6767/ws",
  enabled: true,
  local: true,
};

export function normalizeHostWsUrl(value: string): string | null {
  let url = value.trim();
  if (url.startsWith("http://")) url = `ws://${url.slice(7)}`;
  if (url.startsWith("https://")) url = `wss://${url.slice(8)}`;
  if (!url.startsWith("ws://") && !url.startsWith("wss://") && /^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(url)) url = `ws://${url}`;
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname || !["ws:", "wss:"].includes(parsed.protocol)) return null;
    if (parsed.pathname === "/" && !url.endsWith("/")) parsed.pathname = "/ws";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeSavedHost(value: unknown): PaseoHost | null {
  if (!value || typeof value !== "object") return null;
  const host = value as Record<string, unknown>;
  const id = typeof host.id === "string" ? host.id.trim() : "";
  const name = typeof host.name === "string" ? host.name.trim() : "";
  const url = normalizeHostWsUrl(typeof host.url === "string" ? host.url : "");
  if (!id || id === LOCAL_HOST_ID || !name || !url) return null;
  return {
    id,
    name,
    url,
    token: typeof host.token === "string" && host.token ? host.token : undefined,
    enabled: host.enabled !== false,
    imported: host.imported === true,
  };
}
