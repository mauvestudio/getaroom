// Quotas d'utilisation des providers (Paseo) partagés entre la jauge de la sidebar et la fiche
// au survol du contexte : une seule requête, rafraîchie toutes les 60 s tant qu'un composant l'affiche.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePaseo } from "../context/PaseoContext";
import type { ProviderUsage } from "./paseo/types";

interface UsageSnapshot {
  providers: ProviderUsage[];
  error: string;
  loading: boolean;
  fetchedAt: number;
}

const REFRESH_MS = 60_000;
let snapshot: UsageSnapshot = { providers: [], error: "", loading: false, fetchedAt: 0 };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

const emit = (next: Partial<UsageSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
};

async function load(client: { listProviderUsage: () => Promise<{ providers?: ProviderUsage[] }> }) {
  if (inflight) return inflight;
  emit({ loading: true });
  inflight = client.listProviderUsage()
    .then((result) => emit({ providers: result.providers || [], error: "", fetchedAt: Date.now() }))
    .catch((cause) => emit({ error: cause instanceof Error ? cause.message : String(cause) }))
    .finally(() => { inflight = null; emit({ loading: false }); });
  return inflight;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useProviderUsage() {
  const { client, connectionState } = usePaseo();
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const connected = connectionState === "connected";

  const refresh = useCallback(() => {
    if (!connected) {
      emit({ providers: [], error: "Connexion au daemon Paseo indisponible." });
      return Promise.resolve();
    }
    return load(client);
  }, [client, connected]);

  useEffect(() => {
    if (!connected || Date.now() - snapshot.fetchedAt > REFRESH_MS / 2) void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh, connected]);

  return { ...state, refresh };
}

/** Provider de la session active (Claude, Codex…) parmi les quotas renvoyés par Paseo. */
export function usageForProvider(providers: ProviderUsage[], providerId?: string | null): ProviderUsage | undefined {
  const key = (providerId || "").toLocaleLowerCase();
  if (!key) return undefined;
  const matches = providers.filter((entry) => {
    const id = entry.providerId.toLocaleLowerCase();
    return id === key || id.startsWith(key) || key.startsWith(id) || entry.displayName.toLocaleLowerCase().includes(key);
  });
  return matches.find((entry) => entry.status === "available") ?? matches[0];
}
