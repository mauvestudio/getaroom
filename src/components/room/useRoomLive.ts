// Abonnements temps réel de The Room. Purement en lecture : aucun état du core Paseo n'est modifié.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PaseoClient } from "../../lib/paseo/client";
import { describeTimelineItem, type ToolActivity } from "./room-scene";

interface StampedActivity extends ToolActivity { at: number }

const MAX_TRACKED = 256;
const STALE_MS = 10 * 60_000;

/**
 * Suit l'activité (outil, fichier, diff, commande) de TOUTES les sessions via le flux
 * `agent_stream` du daemon, et pas seulement de la session ouverte dans le chat.
 * Les rafraîchissements React sont regroupés (≈ 4/s) et suspendus quand The Room est masqué.
 */
export function useAgentActivity(client: PaseoClient, enabled: boolean): (sessionId: string) => ToolActivity | undefined {
  const store = useRef(new Map<string, StampedActivity>());
  const enabledRef = useRef(enabled);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [version, setVersion] = useState(0);

  const flush = useCallback(() => {
    if (timer.current !== null || !enabledRef.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      setVersion((value) => value + 1);
    }, 250);
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    if (enabled) flush();
  }, [enabled, flush]);

  useEffect(() => {
    const unsubscribe = client.on("agent_stream", (raw: any) => {
      const payload = raw?.payload || raw;
      const agentId: string | undefined = payload?.agentId || raw?.agentId;
      const event = payload?.event || raw?.event || payload;
      if (!agentId || !event?.type) return;
      if (event.type === "timeline" && event.item) {
        const activity = describeTimelineItem(event.item);
        if (!activity) return;
        store.current.delete(agentId);
        store.current.set(agentId, { ...activity, at: Date.now() });
        if (store.current.size > MAX_TRACKED) store.current.delete(store.current.keys().next().value as string);
        flush();
      } else if (["turn_completed", "turn_failed", "turn_canceled"].includes(event.type)) {
        if (store.current.delete(agentId)) flush();
      }
    });
    return () => {
      unsubscribe();
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [client, flush]);

  // L'identité change à chaque lot : les useMemo des consommateurs se recalculent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((sessionId: string) => {
    const entry = store.current.get(sessionId);
    return entry && Date.now() - entry.at < STALE_MS ? entry : undefined;
  }, [version]);
}

/** Latence (ms) par hôte, mesurée seulement quand The Room est visible et la fenêtre active. */
export function useHostLatency(
  getClientForHost: (hostId: string) => PaseoClient | undefined,
  hostIds: readonly string[],
  enabled: boolean,
): Record<string, number | null> {
  const [latency, setLatency] = useState<Record<string, number | null>>({});
  const key = hostIds.join("|");

  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    const measure = async () => {
      if (document.hidden) return;
      const entries = await Promise.all(key.split("|").map(async (hostId) => {
        try {
          const client = getClientForHost(hostId);
          return [hostId, client ? await client.measureLatency() : null] as const;
        } catch {
          return [hostId, null] as const;
        }
      }));
      if (!cancelled) setLatency((current) => ({ ...current, ...Object.fromEntries(entries) }));
    };
    void measure();
    const interval = setInterval(() => void measure(), 20_000);
    const onVisible = () => { if (!document.hidden) void measure(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, key, getClientForHost]);

  return latency;
}
