// Historique paginé de tous les hôtes (équivalent du hook `useAgentHistory` de Paseo).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaseo } from "../context/PaseoContext";
import {
  fetchAgentHistoryBatch, mergeHistorySessions, type HistoryHostError, type HistoryHostTarget, type HistorySession, type HistorySort,
} from "./paseo/agent-history";

const REVALIDATE_DELAY_MS = 1200;

interface HistoryState {
  sessions: HistorySession[];
  cursors: Record<string, string>;
  hostErrors: HistoryHostError[];
  searchTruncated: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  loaded: boolean;
}

const INITIAL: HistoryState = { sessions: [], cursors: {}, hostErrors: [], searchTruncated: false, isLoading: false, isLoadingMore: false, error: null, loaded: false };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function useAgentHistory({ enabled = true, search = "", sort = "activity", hostId }: {
  enabled?: boolean;
  search?: string;
  sort?: HistorySort;
  /** Limite à un hôte ; absent = tous les hôtes activés. */
  hostId?: string;
}) {
  const { client, hosts, hostStates, getClientForHost } = usePaseo();
  const [state, setState] = useState<HistoryState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Toute réponse d'une requête périmée (recherche, tri, hôtes modifiés) est ignorée.
  const generation = useRef(0);

  const scoped = useMemo(() => hosts.filter((host) => host.enabled && (!hostId || host.id === hostId)), [hosts, hostId]);
  const connected = scoped.filter((host) => hostStates[host.id] === "connected");
  const connectedKey = connected.map((host) => host.id).join("|");
  const unreachable = scoped.filter((host) => hostStates[host.id] !== "connected");

  // Comme Paseo : la recherche n'est proposée que si tous les hôtes connectés la gèrent.
  const isSearchSupported = connected.length > 0 && connected.every((host) =>
    (getClientForHost(host.id)?.getServerInfo() as { features?: { agentHistorySearch?: boolean } } | null)?.features?.agentHistorySearch === true);
  const query = isSearchSupported ? search.trim() : "";

  const targetsRef = useRef<HistoryHostTarget[]>([]);
  targetsRef.current = connected.flatMap((host) => {
    const hostClient = getClientForHost(host.id);
    return hostClient ? [{ host, client: hostClient as unknown as HistoryHostTarget["client"] }] : [];
  });

  const reload = useCallback(async () => {
    const run = ++generation.current;
    if (targetsRef.current.length === 0) {
      // Hôtes momentanément déconnectés : la liste connue reste affichée jusqu'à la reconnexion.
      setState((current) => ({ ...current, isLoading: false, isLoadingMore: false, loaded: true }));
      return;
    }
    // Les résultats précédents restent affichés jusqu'à l'arrivée des nouveaux.
    setState((current) => ({ ...current, isLoading: true, isLoadingMore: false, error: null }));
    try {
      const batch = await fetchAgentHistoryBatch({ hosts: targetsRef.current, sort, ...(query ? { search: query } : {}) });
      if (run !== generation.current) return;
      setState({ ...INITIAL, ...batch, loaded: true });
    } catch (error) {
      if (run !== generation.current) return;
      setState((current) => ({ ...current, isLoading: false, error: message(error), loaded: true }));
    }
  }, [query, sort]);

  const loadMore = useCallback(async () => {
    const { cursors, isLoading, isLoadingMore } = stateRef.current;
    if (isLoading || isLoadingMore || Object.keys(cursors).length === 0) return;
    const run = generation.current;
    setState((current) => ({ ...current, isLoadingMore: true }));
    try {
      const batch = await fetchAgentHistoryBatch({ hosts: targetsRef.current, cursors, sort, ...(query ? { search: query } : {}) });
      if (run !== generation.current) return;
      setState((current) => ({
        ...current,
        sessions: mergeHistorySessions(current.sessions, batch.sessions, sort),
        cursors: batch.cursors,
        hostErrors: batch.hostErrors,
        searchTruncated: current.searchTruncated || batch.searchTruncated,
        isLoadingMore: false,
      }));
    } catch (error) {
      if (run !== generation.current) return;
      setState((current) => ({ ...current, isLoadingMore: false, error: message(error) }));
    }
  }, [query, sort]);

  /** Rafraîchit la première page sans perdre les pages déjà chargées. */
  const revalidate = useCallback(async () => {
    const run = generation.current;
    if (targetsRef.current.length === 0) return;
    try {
      const batch = await fetchAgentHistoryBatch({ hosts: targetsRef.current, sort, ...(query ? { search: query } : {}) });
      if (run !== generation.current) return;
      setState((current) => ({
        ...current,
        sessions: mergeHistorySessions(current.sessions, batch.sessions, sort),
        cursors: current.loaded && Object.keys(current.cursors).length > 0 ? current.cursors : batch.cursors,
        hostErrors: batch.hostErrors,
      }));
    } catch { /* la liste actuelle reste affichée */ }
  }, [query, sort]);

  useEffect(() => {
    if (!enabled) {
      generation.current += 1;
      return;
    }
    void reload();
  }, [enabled, reload, connectedKey]);

  // Mises à jour en direct : statut, titre et archivage des sessions déjà listées.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRevalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void revalidate(); }, REVALIDATE_DELAY_MS);
    };
    const unsubscribe = client.on("agent_update", (payload: any) => {
      const agent = payload?.agent;
      if (payload?.kind === "remove" || !agent?.id) {
        scheduleRevalidate();
        return;
      }
      const known = stateRef.current.sessions.find((session) => session.id === agent.id);
      if (!known) {
        scheduleRevalidate();
        return;
      }
      if (known.status === agent.status && known.title === agent.title && known.updatedAt === agent.updatedAt
        && (known.archivedAt ?? null) === (agent.archivedAt ?? null) && known.requiresAttention === agent.requiresAttention) return;
      setState((current) => ({ ...current, sessions: mergeHistorySessions(current.sessions, [{ ...known, ...agent }], sort) }));
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, client, revalidate, sort]);

  useEffect(() => () => { generation.current += 1; }, []);

  const hostErrors = useMemo(() => {
    const errors = new Map(state.hostErrors.map((entry) => [entry.hostId, entry]));
    for (const host of unreachable) errors.set(host.id, { hostId: host.id, hostLabel: host.name });
    return [...errors.values()];
  }, [state.hostErrors, unreachable.map((host) => host.id).join("|")]);

  const sessions = useMemo(
    () => hostId ? state.sessions.filter((session) => session.hostId === hostId) : state.sessions,
    [state.sessions, hostId],
  );

  return {
    sessions,
    isLoading: state.isLoading,
    isInitialLoad: state.isLoading && sessions.length === 0,
    isLoadingMore: state.isLoadingMore,
    hasMore: Object.keys(state.cursors).length > 0,
    isSearchSupported,
    isSearchTruncated: Boolean(query) && state.searchTruncated,
    loaded: state.loaded,
    error: state.error,
    hostErrors,
    reload,
    loadMore,
  };
}
