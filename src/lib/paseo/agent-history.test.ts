import { describe, expect, test } from "bun:test";
import {
  AGENT_HISTORY_PAGE_SIZE, NO_HISTORY_HOST_ERROR, fetchAgentHistoryBatch, groupHistoryByDate, historyDateSection,
  mergeHistorySessions, type HistoryHostTarget, type HistorySession,
} from "./agent-history";

const local = { id: "local", name: "Local", local: true };
const remoteHost = { id: "remote", name: "Remote" };
const entry = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({
  agent: { id, title: id, status: "closed", provider: "claude", cwd: "/x", createdAt: updatedAt, updatedAt, ...extra },
  project: { projectName: "demo", workspaceName: "main", checkout: { currentBranch: "feat" } },
});
const target = (host: HistoryHostTarget["host"], respond: (options: any) => any, calls: any[] = []): HistoryHostTarget => ({
  host,
  client: { fetchAgentHistory: async (options) => { calls.push(options); return respond(options); } },
});

describe("fetchAgentHistoryBatch (logique Paseo)", () => {
  test("fusionne les hôtes, préfixe les ids distants et trie par activité", async () => {
    const batch = await fetchAgentHistoryBatch({
      hosts: [
        target(local, () => ({ entries: [entry("a", "2026-11-20T10:00:00Z")], pageInfo: { hasMore: false } })),
        target(remoteHost, () => ({ entries: [entry("b", "2026-11-21T10:00:00Z", { archivedAt: "2026-11-21T11:00:00Z" })], pageInfo: { hasMore: false } })),
      ],
    });
    expect(batch.sessions.map((session) => session.id)).toEqual(["remote::b", "a"]);
    expect(batch.sessions[0]).toMatchObject({ hostId: "remote", hostLabel: "Remote", projectName: "demo", branch: "feat" });
    expect(batch.cursors).toEqual({});
  });

  test("demande la taille de page Paseo et le tri par activité", async () => {
    const calls: any[] = [];
    await fetchAgentHistoryBatch({ hosts: [target(local, () => ({ entries: [] }), calls)], search: "demo" });
    expect(calls[0]).toEqual({ search: "demo", sort: [{ key: "updated_at", direction: "desc" }], page: { limit: AGENT_HISTORY_PAGE_SIZE } });
  });

  test("pagination : seuls les hôtes ayant un curseur sont interrogés", async () => {
    const localCalls: any[] = [];
    const remoteCalls: any[] = [];
    const batch = await fetchAgentHistoryBatch({
      cursors: { remote: "c2" },
      hosts: [
        target(local, () => ({ entries: [] }), localCalls),
        target(remoteHost, () => ({ entries: [entry("z", "2026-11-01T00:00:00Z")], pageInfo: { hasMore: true, nextCursor: "c3" } }), remoteCalls),
      ],
    });
    expect(localCalls).toHaveLength(0);
    expect(remoteCalls[0].page).toEqual({ limit: AGENT_HISTORY_PAGE_SIZE, cursor: "c2" });
    expect(batch.cursors).toEqual({ remote: "c3" });
  });

  test("un hôte en échec n'empêche pas les autres", async () => {
    const batch = await fetchAgentHistoryBatch({
      hosts: [
        target(local, () => ({ entries: [entry("a", "2026-11-20T10:00:00Z")] })),
        target(remoteHost, () => { throw new Error("offline"); }),
      ],
    });
    expect(batch.sessions).toHaveLength(1);
    expect(batch.hostErrors).toEqual([{ hostId: "remote", hostLabel: "Remote" }]);
  });

  test("erreur seulement si aucun hôte ne répond", async () => {
    await expect(fetchAgentHistoryBatch({ hosts: [target(local, () => { throw new Error("offline"); })] })).rejects.toThrow(NO_HISTORY_HOST_ERROR);
  });

  test("recherche tronquée remontée", async () => {
    const batch = await fetchAgentHistoryBatch({ hosts: [target(local, () => ({ entries: [], searchTruncated: true }))], search: "x" });
    expect(batch.searchTruncated).toBe(true);
  });
});

const session = (id: string, updatedAt: string, title = id) => ({ id, title, updatedAt, createdAt: updatedAt, hostId: "local", hostLabel: "Local" }) as HistorySession;

describe("fusion, tri et sections", () => {
  test("une même session n'apparaît qu'une fois, version la plus récente", () => {
    const merged = mergeHistorySessions([session("a", "2026-11-01T00:00:00Z", "ancien")], [session("a", "2026-11-02T00:00:00Z", "nouveau")], "activity");
    expect(merged).toHaveLength(1);
    expect(merged[0]!.title).toBe("nouveau");
  });

  test("tri par titre", () => {
    const merged = mergeHistorySessions([], [session("1", "2026-11-02T00:00:00Z", "zèbre"), session("2", "2026-11-01T00:00:00Z", "abeille")], "title");
    expect(merged.map((entry) => entry.title)).toEqual(["abeille", "zèbre"]);
  });

  test("sections de date de Paseo", () => {
    const now = new Date(2026, 10, 21, 10);
    expect(historyDateSection(new Date(2026, 10, 21, 1), now)).toBe("today");
    expect(historyDateSection(new Date(2026, 10, 20, 23), now)).toBe("yesterday");
    expect(historyDateSection(new Date(2026, 10, 15), now)).toBe("thisWeek");
    expect(historyDateSection(new Date(2026, 10, 1), now)).toBe("thisMonth");
    expect(historyDateSection(new Date(2026, 8, 1), now)).toBe("older");
  });

  test("regroupement ordonné", () => {
    const now = new Date(2026, 10, 21, 10);
    const groups = groupHistoryByDate([session("old", new Date(2026, 8, 1).toISOString()), session("new", new Date(2026, 10, 21, 9).toISOString())], now);
    expect(groups.map((group) => group.section)).toEqual(["today", "older"]);
  });
});
