import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { PaseoClient } from "../lib/paseo/client";
import { LOCAL_HOST, normalizeSavedHost, type PaseoHost } from "../lib/paseo/hosts";
import { MultiHostPaseoClient } from "../lib/paseo/multi-host-client";
import type { ConnectionState, ServerInfoPayload } from "../lib/paseo/types";

const LOCAL_STORAGE_KEY = "getaroom-paseo-hosts-v1";

export function getDefaultPaseoUrl(): string {
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "127.0.0.1:5555";
    return `${proto}//${host}/api/paseo/ws`;
  }
  return "ws://127.0.0.1:5555/api/paseo/ws";
}

function loadCachedHosts(): PaseoHost[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeSavedHost).filter((host: PaseoHost | null): host is PaseoHost => !!host) : [];
  } catch { return []; }
}

function hostProxyUrl(hostId: string): string {
  if (typeof window === "undefined") return `ws://127.0.0.1:5555/api/paseo/hosts/${encodeURIComponent(hostId)}/ws`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/paseo/hosts/${encodeURIComponent(hostId)}/ws`;
}

const hostSignature = (host: PaseoHost) => `${host.id}|${host.name}|${host.url}|${host.token ?? ""}|${host.enabled}|${host.local ? 1 : 0}`;
/** Évite de recréer toutes les connexions quand le relais renvoie la même liste d'hôtes que le cache. */
const sameHosts = (a: PaseoHost[], b: PaseoHost[]) => a.length === b.length && a.every((host, index) => hostSignature(host) === hostSignature(b[index]!));

export type HostConnectionState = ConnectionState | "disabled";

interface PaseoContextType {
  client: PaseoClient;
  connectionState: ConnectionState;
  serverInfo: ServerInfoPayload | null;
  serverUrl: string;
  authToken: string;
  setServerUrl: (url: string) => void;
  setAuthToken: (token: string) => void;
  reconnect: () => void;
  hosts: PaseoHost[];
  hostStates: Record<string, HostConnectionState>;
  setHosts: (hosts: PaseoHost[]) => Promise<void>;
  testHost: (host: PaseoHost) => Promise<{ ok: boolean; message: string; latencyMs?: number; version?: string; endpoint?: string }>;
  reconnectHost: (hostId: string) => void;
  getClientForHost: (hostId: string) => PaseoClient | undefined;
  getHostState: (hostId?: string) => HostConnectionState;
  getProviderHostId: (providerId?: string) => string;
}

const PaseoContext = createContext<PaseoContextType | undefined>(undefined);

export function PaseoProvider({ children }: { children: React.ReactNode }) {
  const [serverUrl, setServerUrlState] = useState<string>(() => getDefaultPaseoUrl());
  const [authToken, setAuthTokenState] = useState<string>(() => localStorage.getItem("amble-paseo-token") || "");
  const [hosts, setHostsState] = useState<PaseoHost[]>(() => [LOCAL_HOST, ...loadCachedHosts()]);
  const [hostStates, setHostStates] = useState<Record<string, HostConnectionState>>({ local: "connecting" });
  const [serverInfo, setServerInfo] = useState<ServerInfoPayload | null>(null);
  const fleetRef = useRef<MultiHostPaseoClient | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const entriesRef = useRef<Array<{ host: PaseoHost; client: PaseoClient }>>([]);
  if (!fleetRef.current) fleetRef.current = new MultiHostPaseoClient();
  const fleet = fleetRef.current;
  const localClient = useMemo(() => new PaseoClient({ url: serverUrl, token: authToken || undefined }), [serverUrl, authToken]);
  // Une seule connexion par hôte distant : le client est réutilisé tant que l'hôte (id, URL, jeton) ne change pas.
  const clientCacheRef = useRef(new Map<string, PaseoClient>());
  const remoteClients = useMemo(() => {
    const cache = clientCacheRef.current;
    const used = new Set<string>();
    const result = hosts.filter((host) => !host.local && host.enabled).map((host) => {
      const key = `${host.id}|${host.url}|${host.token ?? ""}`;
      used.add(key);
      let connection = cache.get(key);
      if (!connection) {
        connection = new PaseoClient({ url: hostProxyUrl(host.id) });
        cache.set(key, connection);
      }
      return { host, client: connection };
    });
    for (const key of [...cache.keys()]) if (!used.has(key)) cache.delete(key);
    return result;
  }, [hosts]);
  const entries = useMemo(() => [
    { host: LOCAL_HOST, client: localClient },
    ...remoteClients,
  ], [localClient, remoteClients]);
  entriesRef.current = entries;
  fleet.setHosts(entries);
  const client = useMemo(() => fleet.asClient(), [fleet]);
  const localState = hostStates.local || "disconnected";
  const connectionState: ConnectionState = localState === "disabled" ? "disconnected" : localState;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = loadCachedHosts();
      try {
        const response = await fetch("/api/paseo/hosts");
        if (!response.ok) throw new Error("Lecture locale des hôtes indisponible");
        const received = await response.json();
        const remote = Array.isArray(received) ? received.filter((host: any) => !host?.local).map(normalizeSavedHost).filter((host: PaseoHost | null): host is PaseoHost => !!host) : [];
        if (cancelled) return;
        if (!remote.length && cached.length) {
          await fetch("/api/paseo/hosts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cached) }).catch(() => {});
          setHostsState((current) => sameHosts(current, [LOCAL_HOST, ...cached]) ? current : [LOCAL_HOST, ...cached]);
        } else {
          setHostsState((current) => sameHosts(current, [LOCAL_HOST, ...remote]) ? current : [LOCAL_HOST, ...remote]);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remote));
        }
      } catch {
        if (!cancelled) setHostsState([LOCAL_HOST, ...cached]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    disconnectTimerRef.current = null;
    fleet.setHosts(entries);
    const unsubscribers: Array<() => void> = [];
    for (const { host, client: connection } of entries) {
      const update = (state: ConnectionState) => {
        setHostStates((current) => ({ ...current, [host.id]: state }));
      };
      update(connection.getState());
      unsubscribers.push(connection.on("state_change", update));
      connection.connect().catch(() => {});
      unsubscribers.push(connection.on("server_info", (info) => {
        if (host.local) setServerInfo(info);
        else fleet.emit("remote_host_ready", { hostId: host.id });
      }));
    }
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      disconnectTimerRef.current = setTimeout(() => {
        const keep = mountedRef.current ? new Set(entriesRef.current.map(({ client: connection }) => connection)) : new Set<PaseoClient>();
        for (const { client: connection } of entries) if (!keep.has(connection)) connection.disconnect();
        disconnectTimerRef.current = null;
      }, 150);
      mountedRef.current = false;
    };
  }, [entries, fleet]);

  const setHosts = useCallback(async (nextHosts: PaseoHost[]) => {
    const remote = nextHosts.filter((host) => !host.local).map(normalizeSavedHost);
    if (remote.some((host) => !host)) throw new Error("Un hôte a une URL WebSocket ou un nom invalide.");
    const normalized = remote as PaseoHost[];
    try {
      const response = await fetch("/api/paseo/hosts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(normalized),
      });
      if (!response.ok) throw new Error("Le relais local n’a pas pu enregistrer les hôtes.");
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalized));
      setHostsState([LOCAL_HOST, ...normalized]);
    } catch (error) {
      throw error instanceof Error ? error : new Error("Enregistrement local impossible.");
    }
  }, []);

  const testHost = useCallback(async (host: PaseoHost) => {
    try {
      const response = await fetch("/api/paseo/hosts/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: host.url, token: host.token }),
      });
      return await response.json();
    } catch {
      return { ok: false, message: "Impossible de joindre le relais local pour tester cet hôte." };
    }
  }, []);

  const reconnect = useCallback(() => {
    for (const { client: connection } of fleet.getEntries()) connection.connect(true).catch(() => {});
  }, [fleet]);
  const getClientForHost = useCallback((hostId: string) => fleet.getEntries().find(({ host }) => host.id === hostId)?.client, [fleet]);
  const reconnectHost = useCallback((hostId: string) => {
    fleet.getEntries().find(({ host }) => host.id === hostId)?.client.connect(true).catch(() => {});
  }, [fleet]);
  const getHostState = useCallback((hostId = "local") => {
    const host = hosts.find((candidate) => candidate.id === hostId);
    if (!host?.enabled) return "disabled";
    return hostStates[hostId] || "disconnected";
  }, [hosts, hostStates]);
  const getProviderHostId = useCallback((providerId?: string) => {
    if (!providerId) return "local";
    return (client as any).getProviderHostId(providerId) || "local";
  }, [client]);

  return (
    <PaseoContext.Provider value={{
      client, connectionState, serverInfo, serverUrl, authToken,
      setServerUrl: (url) => {
        setServerUrlState(url.trim());
        localStorage.setItem("amble-paseo-url", url.trim());
      },
      setAuthToken: (token) => {
        setAuthTokenState(token);
        localStorage.setItem("amble-paseo-token", token);
      },
      reconnect, hosts, hostStates, setHosts, testHost, reconnectHost, getClientForHost, getHostState, getProviderHostId,
    }}>{children}</PaseoContext.Provider>
  );
}

export function usePaseo() {
  const context = useContext(PaseoContext);
  if (!context) throw new Error("usePaseo must be used within a PaseoProvider");
  return context;
}
