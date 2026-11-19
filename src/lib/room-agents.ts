import { useEffect, useState } from "react";
import type { PublicAgent } from "../config/agents";

export type { PublicAgent };

/** Agents de la Room, lus depuis le serveur (jamais de secret : voir `toPublic`). */
export function useRoomAgents() {
  const [agents, setAgents] = useState<PublicAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/room/agents")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Erreur ${r.status}`))))
      .then((a) => !off && setAgents(a))
      .catch((e) => !off && setError(e instanceof Error ? e.message : String(e)));
    return () => { off = true; };
  }, []);
  return { agents, error };
}
