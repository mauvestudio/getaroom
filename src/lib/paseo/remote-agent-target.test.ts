import { describe, expect, test } from "bun:test";
import { resolveRemoteAgentTarget } from "./remote-agent-target";
import { MultiHostPaseoClient } from "./multi-host-client";
import { LOCAL_HOST, type PaseoHost } from "./hosts";
import type { PaseoClient } from "./client";

const workspaces = [
  { id: "w-alpha", workspaceDirectory: "/agents/alpha" },
  { id: "w-beta", workspaceDirectory: "/agents/beta" },
  { id: "w-gamma", workspaceDirectory: "/agents/gamma" },
];

describe("resolveRemoteAgentTarget", () => {
  test("plusieurs workspaces sans suggestion : prend le dossier portant le nom du provider", () => {
    expect(resolveRemoteAgentTarget({ provider: "hermes-beta", workspaces, suggestedDirectories: [] }))
      .toEqual({ workspaceId: "w-beta", cwd: "/agents/beta" });
  });

  test("la dernière session active du provider a la priorité", () => {
    const sessions = [
      { provider: "hermes-beta", workspaceId: "w-gamma", cwd: "/agents/gamma", updatedAt: "2026-11-23T10:00:00Z" },
      { provider: "hermes-beta", workspaceId: "w-alpha", cwd: "/agents/alpha", updatedAt: "2026-11-22T10:00:00Z" },
    ];
    expect(resolveRemoteAgentTarget({ provider: "hermes-beta", workspaces, sessions })?.workspaceId).toBe("w-gamma");
  });

  test("une session archivée ne l'emporte pas sur le dossier de l'agent", () => {
    const sessions = [{ provider: "hermes-beta", workspaceId: "w-alpha", cwd: "/agents/alpha", archivedAt: "2026-11-23T10:00:00Z", updatedAt: "2026-11-23T10:00:00Z" }];
    expect(resolveRemoteAgentTarget({ provider: "hermes-beta", workspaces, sessions })?.workspaceId).toBe("w-beta");
  });

  test("à défaut, reprend le dossier d'une session archivée", () => {
    const sessions = [{ provider: "custom", workspaceId: "w-alpha", archivedAt: "2026-11-23T10:00:00Z" }];
    expect(resolveRemoteAgentTarget({ provider: "custom", workspaces, sessions })?.workspaceId).toBe("w-alpha");
  });

  test("workspace explicite, unique, suggestion, ou échec", () => {
    expect(resolveRemoteAgentTarget({ provider: "x", workspaceId: "w-gamma", workspaces })?.cwd).toBe("/agents/gamma");
    expect(resolveRemoteAgentTarget({ provider: "x", workspaceId: "inconnu", workspaces })).toBeNull();
    expect(resolveRemoteAgentTarget({ provider: "x", workspaces: [workspaces[0]!] })?.cwd).toBe("/agents/alpha");
    expect(resolveRemoteAgentTarget({ provider: "x", workspaces: [], suggestedDirectories: ["/srv/app/src"] })).toEqual({ cwd: "/srv/app" });
    expect(resolveRemoteAgentTarget({ provider: "x", workspaces, suggestedDirectories: [] })).toBeNull();
  });

  test("ignore un workspace archivé", () => {
    const list = [{ id: "w-old", workspaceDirectory: "/agents/beta", archivedAt: "2026-11-01T00:00:00Z" }, workspaces[0]!];
    expect(resolveRemoteAgentTarget({ provider: "hermes-beta", workspaces: list })?.workspaceId).toBe("w-alpha");
  });
});

describe("MultiHostPaseoClient provider routing", () => {
  const remoteHost: PaseoHost = {
    id: "unraid",
    name: "Unraid",
    url: "ws://100.77.82.59:6767/ws",
    enabled: true,
    local: false,
  };

  function makeMockClient(opts: {
    state: "connected" | "disconnected";
    providers?: Array<{ provider: string; status: string }>;
    onCreate?: (params: any) => Promise<any>;
  }): PaseoClient {
    return {
      on: () => () => {},
      getState: () => opts.state,
      getProvidersSnapshot: async () => ({
        compactSnapshot: {
          entries: opts.providers ?? [],
          thinkingSets: [],
        },
      }),
      fetchWorkspaces: async () => ({ entries: workspaces }),
      fetchAgentHistory: async () => ({ entries: [] }),
      createAgent: opts.onCreate ?? (async (params: any) => ({ agent: { id: "a-1", ...params } })),
    } as unknown as PaseoClient;
  }

  test("ne redirige pas un provider distant vers le daemon local quand l'hôte distant est hors ligne", async () => {
    const fleet = new MultiHostPaseoClient();
    const localClient = makeMockClient({
      state: "connected",
      providers: [{ provider: "claude", status: "available" }, { provider: "opencode", status: "available" }],
    });
    const remoteClient = makeMockClient({ state: "disconnected" });
    fleet.setHosts([
      { host: LOCAL_HOST, client: localClient },
      { host: remoteHost, client: remoteClient },
    ]);

    await fleet.getProvidersSnapshot();
    expect(fleet.getProviderHostId("claude")).toBe("local");
    expect(fleet.getProviderHostId("hermes-maintenance")).toBe("unraid");

    await expect(
      fleet.asClient().createAgent({
        workspaceId: "",
        cwd: "",
        provider: "hermes-maintenance",
        initialPrompt: "Bonjour",
      }),
    ).rejects.toThrow(/Unraid.*hors ligne/);
  });

  test("conserve le propriétaire distant d'un provider lors d'un rafraîchissement partiel", async () => {
    let remoteState: "connected" | "disconnected" = "connected";
    const fleet = new MultiHostPaseoClient();
    const localClient = makeMockClient({
      state: "connected",
      providers: [{ provider: "claude", status: "available" }],
    });
    const remoteClient = {
      ...makeMockClient({
        state: "connected",
        providers: [{ provider: "hermes-webmaster", status: "available" }],
      }),
      getState: () => remoteState,
    } as unknown as PaseoClient;

    fleet.setHosts([
      { host: LOCAL_HOST, client: localClient },
      { host: remoteHost, client: remoteClient },
    ]);

    await fleet.getProvidersSnapshot();
    expect(fleet.getProviderHostId("Hermes-Webmaster")).toBe("unraid");

    remoteState = "disconnected";
    await fleet.getProvidersSnapshot();
    expect(fleet.getProviderHostId("hermes-webmaster")).toBe("unraid");
  });
});
