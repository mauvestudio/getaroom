import type { AgentSnapshot } from "./paseo/types";

/**
 * Deterministically sorts agents in chronological creation order (oldest first).
 * Falls back to ID comparison when timestamps match or are missing.
 *
 * This ensures agent tab order remains completely stable and does not
 * shift or jump when an agent has recent activity or status updates.
 */
export function compareAgentSnapshotsByCreation(
  a: Pick<AgentSnapshot, "id"> & Partial<Pick<AgentSnapshot, "createdAt">>,
  b: Pick<AgentSnapshot, "id"> & Partial<Pick<AgentSnapshot, "createdAt">>,
): number {
  const timeA = a.createdAt ? Date.parse(a.createdAt) : 0;
  const timeB = b.createdAt ? Date.parse(b.createdAt) : 0;
  const safeTimeA = Number.isNaN(timeA) ? 0 : timeA;
  const safeTimeB = Number.isNaN(timeB) ? 0 : timeB;
  if (safeTimeA !== safeTimeB) {
    return safeTimeA - safeTimeB;
  }
  return (a.id || "").localeCompare(b.id || "");
}

/**
 * Session à afficher par défaut : celle en cours d'exécution la plus récente, sinon la plus récemment active.
 * (La liste du démon est triée par création croissante : prendre le premier élément ouvrirait la plus ancienne.)
 */
export function pickMostRecentAgent<T extends { id: string; status?: string; updatedAt?: string; createdAt?: string }>(agents: readonly T[]): T | undefined {
  const time = (agent: T) => Date.parse(agent.updatedAt || agent.createdAt || "") || 0;
  let best: T | undefined;
  for (const agent of agents) {
    if (!best) { best = agent; continue; }
    const running = agent.status === "running";
    const bestRunning = best.status === "running";
    if (running !== bestRunning ? running : time(agent) > time(best)) best = agent;
  }
  return best;
}
