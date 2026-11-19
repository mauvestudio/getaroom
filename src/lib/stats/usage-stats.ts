export type UsageUniverse = "room" | "studio";

export interface UsageSession {
  id: string;
  universe: UsageUniverse;
  targetId: string;
  targetName: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  turnsCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface UsageRange {
  from: Date;
  to: Date;
}

export interface UsageMetrics {
  openMs: number;
  activeMs: number;
  idleMs: number;
  averageConcurrent: number;
  prompts: number;
  sessions: number;
  tokens: number;
  costUsd: number | null;
}

function rangeEndExclusive(to: Date): number {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  return end.getTime() + 1;
}

export function filterUsageSessions(
  sessions: UsageSession[],
  range: UsageRange,
  filters: { targetId?: string; universe?: UsageUniverse | "all" } = {},
): UsageSession[] {
  const start = new Date(range.from).setHours(0, 0, 0, 0);
  const end = rangeEndExclusive(range.to);
  return sessions.filter((session) => {
    const created = new Date(session.createdAt).getTime();
    return Number.isFinite(created) && created >= start && created < end &&
      (!filters.targetId || session.targetId === filters.targetId) &&
      (!filters.universe || filters.universe === "all" || session.universe === filters.universe);
  });
}

export function calculateUsageMetrics(sessions: UsageSession[], range: UsageRange, now = new Date()): UsageMetrics {
  const from = new Date(range.from).setHours(0, 0, 0, 0);
  const to = rangeEndExclusive(range.to);
  const periodMs = Math.max(1, to - from);
  let openMs = 0;
  let activeMs = 0;
  let tokens = 0;
  let allCostsAvailable = sessions.length > 0;
  let costUsd = 0;

  for (const session of sessions) {
    const created = new Date(session.createdAt).getTime();
    const updated = new Date(session.updatedAt).getTime();
    if (!Number.isFinite(created)) continue;
    const intervalEnd = Math.min(session.status === "running" ? now.getTime() : (Number.isFinite(updated) ? updated : now.getTime()), to);
    const duration = Math.max(0, intervalEnd - Math.max(created, from));
    openMs += duration;
    if (session.status === "running") activeMs += duration;
    tokens += (session.inputTokens || 0) + (session.outputTokens || 0);
    if (typeof session.costUsd === "number" && Number.isFinite(session.costUsd)) costUsd += session.costUsd;
    else allCostsAvailable = false;
  }

  return {
    openMs,
    activeMs,
    idleMs: Math.max(0, openMs - activeMs),
    averageConcurrent: Math.min(sessions.length, openMs / periodMs),
    prompts: sessions.reduce((total, session) => total + (session.turnsCount || 0), 0),
    sessions: sessions.length,
    tokens,
    costUsd: allCostsAvailable ? costUsd : null,
  };
}

export function previousUsageRange(range: UsageRange): UsageRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const days = Math.max(1, Math.round((to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0)) / 86_400_000) + 1);
  const previousTo = new Date(range.from);
  previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setDate(previousFrom.getDate() - days + 1);
  return { from: previousFrom, to: previousTo };
}

export function formatDuration(minutesInput: number): string {
  const minutes = Math.max(0, Math.floor(minutesInput / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}
