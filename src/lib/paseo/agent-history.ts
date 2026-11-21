// Historique des sessions : même logique que `fetchAgentHistoryBatch` de l'app Paseo.
// Une page par hôte avec son propre curseur ; un hôte en échec n'empêche pas les autres de répondre.
import type { PaseoHost } from "./hosts";
import { namespaceAgent } from "./multi-host-client";
import type { AgentSnapshot } from "./types";

/** Taille de page de Paseo (maximum accepté par le protocole). */
export const AGENT_HISTORY_PAGE_SIZE = 200;
export const NO_HISTORY_HOST_ERROR = "Aucun hôte connecté n’a pu charger l’historique.";

export type HistorySort = "activity" | "created" | "title";

const WIRE_SORT = {
  activity: [{ key: "updated_at", direction: "desc" }],
  created: [{ key: "created_at", direction: "desc" }],
  title: [{ key: "title", direction: "asc" }],
} as const;

export interface HistorySession extends AgentSnapshot {
  hostId: string;
  hostLabel: string;
  projectName?: string;
  workspaceName?: string;
  branch?: string;
}

export interface HistoryPageResponse {
  entries: unknown[];
  pageInfo?: { hasMore?: boolean; nextCursor?: string | null } | null;
  searchTruncated?: boolean;
}

export interface HistoryHostTarget {
  host: Pick<PaseoHost, "id" | "name" | "local">;
  client: { fetchAgentHistory: (options: { search?: string; sort: readonly { key: string; direction: string }[]; page: { limit: number; cursor?: string } }) => Promise<HistoryPageResponse> };
}

export interface HistoryHostError { hostId: string; hostLabel: string }

export interface HistoryBatch {
  sessions: HistorySession[];
  /** Curseur suivant par hôte ; un hôte épuisé n'y figure plus. */
  cursors: Record<string, string>;
  hostErrors: HistoryHostError[];
  searchTruncated: boolean;
}

const time = (value: unknown): number => {
  const parsed = typeof value === "string" || value instanceof Date ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Date de dernière activité d'une session. */
export const sessionActivityAt = (session: Pick<AgentSnapshot, "updatedAt" | "createdAt"> & { lastActivityAt?: unknown }): number =>
  time(session.lastActivityAt) || time(session.updatedAt) || time(session.createdAt);

function compare(sort: HistorySort, a: HistorySession, b: HistorySession): number {
  if (sort === "title") return (a.title || "").localeCompare(b.title || "") || sessionActivityAt(b) - sessionActivityAt(a) || a.id.localeCompare(b.id);
  if (sort === "created") return time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id);
  return sessionActivityAt(b) - sessionActivityAt(a) || a.id.localeCompare(b.id);
}

/** Fusionne des pages (la version la plus récente d'une session gagne) et applique le tri global. */
export function mergeHistorySessions(existing: readonly HistorySession[], incoming: readonly HistorySession[], sort: HistorySort): HistorySession[] {
  const byId = new Map(existing.map((session) => [session.id, session]));
  for (const session of incoming) byId.set(session.id, { ...byId.get(session.id), ...session });
  return [...byId.values()].sort((a, b) => compare(sort, a, b));
}

export function toHistorySession(entry: unknown, host: HistoryHostTarget["host"]): HistorySession | null {
  const record = entry as { agent?: AgentSnapshot; project?: Record<string, any> | null } & AgentSnapshot;
  const agent = record?.agent ?? record;
  if (!agent?.id) return null;
  const project = record.project ?? (agent as { project?: Record<string, any> | null }).project ?? undefined;
  return {
    ...namespaceAgent(host as PaseoHost, agent),
    hostLabel: host.name,
    project: project as AgentSnapshot["project"],
    projectName: project?.projectName ?? project?.projectDisplayName ?? undefined,
    workspaceName: project?.workspaceName ?? undefined,
    branch: project?.checkout?.currentBranch ?? undefined,
  };
}

/**
 * Charge une page sur chaque hôte. Avec des curseurs, seuls les hôtes qui ont encore
 * des pages sont interrogés. Lève une erreur uniquement si aucun hôte n'a répondu.
 */
export async function fetchAgentHistoryBatch(options: {
  hosts: readonly HistoryHostTarget[];
  cursors?: Readonly<Record<string, string>> | null;
  search?: string;
  sort?: HistorySort;
}): Promise<HistoryBatch> {
  const sort = options.sort ?? "activity";
  const cursors = options.cursors ?? {};
  const paging = Object.keys(cursors).length > 0;
  const targets = paging ? options.hosts.filter(({ host }) => Object.hasOwn(cursors, host.id)) : options.hosts;
  const settled = await Promise.allSettled(targets.map(({ client, host }) => {
    const cursor = cursors[host.id];
    return client.fetchAgentHistory({
      ...(options.search ? { search: options.search } : {}),
      sort: WIRE_SORT[sort],
      page: cursor ? { limit: AGENT_HISTORY_PAGE_SIZE, cursor } : { limit: AGENT_HISTORY_PAGE_SIZE },
    });
  }));

  const sessions: HistorySession[] = [];
  const nextCursors: Record<string, string> = {};
  const hostErrors: HistoryHostError[] = [];
  let answered = 0;
  let searchTruncated = false;
  settled.forEach((result, index) => {
    const { host } = targets[index]!;
    if (result.status === "rejected") {
      hostErrors.push({ hostId: host.id, hostLabel: host.name });
      return;
    }
    answered += 1;
    searchTruncated ||= result.value.searchTruncated === true;
    for (const entry of result.value.entries ?? []) {
      const session = toHistorySession(entry, host);
      if (session) sessions.push(session);
    }
    const { hasMore, nextCursor } = result.value.pageInfo ?? {};
    if (hasMore && nextCursor) nextCursors[host.id] = nextCursor;
  });
  if (targets.length > 0 && answered === 0) throw new Error(NO_HISTORY_HOST_ERROR);
  return { sessions: mergeHistorySessions([], sessions, sort), cursors: nextCursors, hostErrors, searchTruncated };
}

export type HistoryDateSection = "today" | "yesterday" | "thisWeek" | "thisMonth" | "older";
export const HISTORY_DATE_SECTIONS: readonly HistoryDateSection[] = ["today", "yesterday", "thisWeek", "thisMonth", "older"];

/** Sections de date de la liste Historique de Paseo. */
export function historyDateSection(at: Date, now = new Date()): HistoryDateSection {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  if (day.getTime() >= today.getTime()) return "today";
  if (day.getTime() >= yesterday.getTime()) return "yesterday";
  const days = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  return days <= 7 ? "thisWeek" : days <= 30 ? "thisMonth" : "older";
}

export function groupHistoryByDate<T extends HistorySession>(sessions: readonly T[], now = new Date()): Array<{ section: HistoryDateSection; sessions: T[] }> {
  const groups = new Map<HistoryDateSection, T[]>();
  for (const session of sessions) {
    const section = historyDateSection(new Date(sessionActivityAt(session)), now);
    groups.set(section, [...(groups.get(section) ?? []), session]);
  }
  return HISTORY_DATE_SECTIONS.flatMap((section) => groups.has(section) ? [{ section, sessions: groups.get(section)! }] : []);
}
