import { PaseoClient } from "./client";
import type { PaseoHost } from "./hosts";
import type { ConnectionState } from "./types";

type ClientEntry = { host: PaseoHost; client: PaseoClient };
type Listener = (value: any) => void;
const REMOTE_ID_SEPARATOR = "::";
const AGENT_ID_METHODS = new Set([
  "fetchAgentTimeline", "listProviderSubagents", "listCommands", "cancelAgent", "archiveAgent",
  "updateAgent", "setAgentModel", "setAgentThinking", "setAgentMode", "respondToPermission",
  "setAgentTimelineSubscription", "fetchProviderSubagentTimeline", "sendAgentMessage", "clearAgentAttention",
]);

function splitRemoteId(value: unknown): { hostId: string; id: string } | null {
  if (typeof value !== "string") return null;
  const separator = value.indexOf(REMOTE_ID_SEPARATOR);
  return separator > 0
    ? { hostId: value.slice(0, separator), id: value.slice(separator + REMOTE_ID_SEPARATOR.length) }
    : null;
}

function namespaceAgent(host: PaseoHost, value: any): any {
  if (!value || typeof value !== "object") return value;
  return {
    ...value,
    id: host.local ? value.id : `${host.id}${REMOTE_ID_SEPARATOR}${value.id}`,
    hostId: host.id,
  };
}

function decorateEvent(host: PaseoHost, value: any): any {
  if (!value || typeof value !== "object") return value;
  const result = { ...value, hostId: host.id };
  for (const key of ["agentId", "targetAgentId", "parentAgentId"]) {
    if (typeof result[key] === "string" && !host.local) result[key] = `${host.id}${REMOTE_ID_SEPARATOR}${result[key]}`;
  }
  if (result.agent && typeof result.agent === "object") result.agent = namespaceAgent(host, result.agent);
  return result;
}

export class MultiHostPaseoClient {
  private entries = new Map<string, ClientEntry>();
  private listeners = new Map<string, Set<Listener>>();
  private unsubscribers: Array<() => void> = [];
  private boundEvents = new Set<string>();
  private providerOwners = new Map<string, string>();
  private proxy: PaseoClient;

  constructor() {
    this.proxy = new Proxy({} as PaseoClient, {
      get: (_target, key) => {
        if (key === "getProviderHostId") return (provider: string) => this.providerOwners.get(provider) || "local";
        if (key === "getClientForHost") return (hostId: string) => this.entries.get(hostId)?.client;
        if (key === "on") return this.on.bind(this);
        if (key === "emit") return this.emit.bind(this);
        if (key === "getState") return this.getState.bind(this);
        if (key === "getServerInfo") return this.local().client.getServerInfo.bind(this.local().client);
        if (key === "getUrl") return this.local().client.getUrl.bind(this.local().client);
        if (key === "setUrl" || key === "setToken") return (this.local().client as any)[key].bind(this.local().client);
        if (key === "connect") return this.connect.bind(this);
        if (key === "disconnect") return this.disconnect.bind(this);
        if (key === "fetchAgents") return this.fetchAgents.bind(this);
        if (key === "getProvidersSnapshot") return this.getProvidersSnapshot.bind(this);
        if (key === "fetchWorkspaces" || key === "listProjects") return (this.local().client as any)[key].bind(this.local().client);
        if (key === "resumeAgent") return this.resumeAgent.bind(this);
        if (key === "createAgent") return this.createAgent.bind(this);
        if (key === "setAgentTimelineSubscription") return this.setAgentTimelineSubscription.bind(this);
        if (key === "onTerminalOutput") return this.onTerminalOutput.bind(this);
        if (key === "getTerminalBuffer") return this.getTerminalBuffer.bind(this);
        if (key === "getTerminalSlot") return this.getTerminalSlot.bind(this);
        if (typeof key !== "string") return undefined;
        return (...args: any[]) => this.invoke(key, args);
      },
    });
  }

  asClient(): PaseoClient { return this.proxy; }

  setHosts(hosts: Array<{ host: PaseoHost; client: PaseoClient }>) {
    const next = new Map(hosts.map(({ host, client }) => [host.id, { host, client }]));
    const changed = [...next].some(([id, item]) => this.entries.get(id)?.client !== item.client) || next.size !== this.entries.size;
    if (!changed) return;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.boundEvents.clear();
    this.entries = next;
    for (const eventName of this.eventNames()) this.bindEvent(eventName);
  }

  getEntries() { return [...this.entries.values()]; }

  private local(): ClientEntry {
    const entry = this.entries.get("local") || this.entries.values().next().value;
    if (!entry) throw new Error("Le client Paseo local n’est pas initialisé.");
    return entry;
  }

  private eventNames(): string[] {
    return [...this.listeners.keys()];
  }

  on(event: string, listener: Listener) {
    const current = this.listeners.get(event) || new Set<Listener>();
    current.add(listener);
    this.listeners.set(event, current);
    if (!this.boundEvents.has(event)) this.bindEvent(event);
    return () => current.delete(listener);
  }

  private bindEvent(eventName: string) {
    if (this.boundEvents.has(eventName)) return;
    this.boundEvents.add(eventName);
    for (const { host, client } of this.entries.values()) {
      this.unsubscribers.push(client.on(eventName, (payload) => {
        const decorated = decorateEvent(host, payload);
        for (const listener of this.listeners.get(eventName) || []) listener(decorated);
      }));
    }
  }

  emit(event: string, value: any) {
    for (const listener of this.listeners.get(event) || []) listener(value);
  }

  getState(): ConnectionState {
    const states = this.getEntries().map(({ client }) => client.getState());
    if (states.includes("connected")) return "connected";
    if (states.includes("connecting") || states.includes("reconnecting")) return "connecting";
    return "disconnected";
  }

  onTerminalOutput(
    slotOrId: number | string,
    handler: (data: string) => void,
    options?: { replayBuffer?: boolean },
  ): () => void {
    const split = typeof slotOrId === "string" ? splitRemoteId(slotOrId) : null;
    const entry = split ? this.entries.get(split.hostId) : this.entries.get("local") || this.entries.values().next().value;
    if (!entry) return () => {};
    try {
      const cancel = entry.client.onTerminalOutput(split ? split.id : slotOrId, handler, options);
      return typeof cancel === "function" ? cancel : () => {};
    } catch {
      return () => {};
    }
  }

  getTerminalBuffer(slotOrId: number | string): string {
    const split = typeof slotOrId === "string" ? splitRemoteId(slotOrId) : null;
    const entries = split ? [this.entries.get(split.hostId)] : this.getEntries();
    for (const entry of entries) {
      if (!entry) continue;
      const buffer = entry.client.getTerminalBuffer(split ? split.id : slotOrId);
      if (buffer) return buffer;
    }
    return "";
  }

  getTerminalSlot(terminalId: string): number | undefined {
    const split = splitRemoteId(terminalId);
    const entries = split ? [this.entries.get(split.hostId)] : this.getEntries();
    for (const entry of entries) {
      if (!entry) continue;
      const slot = entry.client.getTerminalSlot(split ? split.id : terminalId);
      if (slot !== undefined) return slot;
    }
    return undefined;
  }

  async connect(forceFresh = false) {
    const entries = this.getEntries();
    const local = this.local();
    const connected = await Promise.allSettled(entries.map(({ client }) => client.connect(forceFresh)));
    const localResult = connected[entries.indexOf(local)];
    if (localResult?.status === "fulfilled") return localResult.value;
    const first = connected.find((result) => result.status === "fulfilled");
    if (first?.status === "fulfilled") return first.value;
    throw localResult?.status === "rejected" ? localResult.reason : new Error("Aucun hôte Paseo connecté.");
  }

  disconnect() { for (const { client } of this.entries.values()) client.disconnect(); }

  async fetchAgents(options?: Parameters<PaseoClient["fetchAgents"]>[0]) {
    const hostId = typeof options === "object" ? options.hostId : undefined;
    const entries = this.getEntries().filter(({ host }) => !hostId || host.id === hostId);
    if (hostId && entries[0]?.client.getState() !== "connected") throw new Error("Hôte Paseo hors ligne.");
    const results = await Promise.all(entries.map(async ({ host, client }) => {
      if (client.getState() !== "connected") return [];
      const request = client.fetchAgents(options);
      const result = await (hostId ? request : request.catch(() => null));
      const records = Array.isArray(result?.entries) ? result.entries : Array.isArray(result?.agents) ? result.agents : [];
      return records.map((entry: any) => entry.agent
        ? { ...entry, agent: namespaceAgent(host, entry.agent) }
        : namespaceAgent(host, entry));
    }));
    return { entries: results.flat() };
  }

  async getProvidersSnapshot() {
    const snapshots = await Promise.all(this.getEntries().map(async ({ host, client }) => {
      if (client.getState() !== "connected") return null;
      return { host, snapshot: await client.getProvidersSnapshot().catch(() => null) };
    }));
    const entries: any[] = [];
    const thinkingSets: any[] = [];
    this.providerOwners.clear();
    for (const item of snapshots) {
      if (!item?.snapshot) continue;
      const compact = item.snapshot.compactSnapshot || item.snapshot.snapshot || item.snapshot;
      const hostSets = Array.isArray(compact.thinkingSets) ? compact.thinkingSets : [];
      const offset = thinkingSets.length;
      thinkingSets.push(...hostSets);
      const providers = Array.isArray(compact.entries) ? compact.entries : Array.isArray(item.snapshot.entries) ? item.snapshot.entries : [];
      for (const provider of providers) {
        const providerId = String(provider.provider || provider.id || "");
        if (!providerId) continue;
        if (!this.providerOwners.has(providerId)) this.providerOwners.set(providerId, item.host.id);
        entries.push({
          ...provider,
          hostId: item.host.id,
          models: (provider.models || []).map((model: any) => ({
            ...model,
            hostId: item.host.id,
            ...(typeof model.thinkingSet === "number" ? { thinkingSet: model.thinkingSet + offset } : {}),
          })),
        });
      }
    }
    return { compactSnapshot: { entries, thinkingSets } };
  }

  private async resumeAgent(hostId: string, handle: Parameters<PaseoClient["resumeAgent"]>[1]) {
    const entry = this.entries.get(hostId);
    if (!entry) throw new Error("Hôte Paseo indisponible.");
    return namespaceAgent(entry.host, await entry.client.resumeAgent(hostId, handle));
  }

  private async createAgent(params: Parameters<PaseoClient["createAgent"]>[0]) {
    const hostId = params.hostId || splitRemoteId(params.workspaceId)?.hostId || "local";
    const entry = this.entries.get(hostId);
    if (!entry) throw new Error("Hôte Paseo indisponible.");
    const workspaceId = splitRemoteId(params.workspaceId)?.id ?? params.workspaceId;
    let cwd = params.cwd;
    if (!cwd && !entry.host.local) {
      const { entries } = await entry.client.fetchWorkspaces();
      const candidates = (entries ?? []) as Array<{ workspaceId?: string; workspaceDirectory?: string }>;
      const workspace = workspaceId
        ? candidates.find((item) => item.workspaceId === workspaceId)
        : candidates.length === 1 ? candidates[0] : undefined;
      cwd = workspace?.workspaceDirectory || "";
      if (!cwd && !workspaceId) {
        const result = await entry.client.getDirectorySuggestions({ query: "", limit: 1, includeDirectories: true, includeFiles: false });
        const directory = result.directories?.find((path) => path.startsWith("/"));
        cwd = directory?.slice(0, directory.lastIndexOf("/")) || "";
      }
      if (!cwd) throw new Error("Paseo n’a pas fourni de dossier de travail sur l’hôte distant.");
    }
    const result = await entry.client.createAgent({ ...params, workspaceId, cwd });
    return { ...result, agent: namespaceAgent(entry.host, result.agent) };
  }

  private async setAgentTimelineSubscription(ids: string[]) {
    const perHost = new Map<string, string[]>();
    for (const id of ids) {
      const split = splitRemoteId(id);
      const hostId = split?.hostId || "local";
      const values = perHost.get(hostId) || [];
      values.push(split?.id || id);
      perHost.set(hostId, values);
    }
    return Promise.all(this.getEntries().filter(({ client }) => client.getState() === "connected")
      .map(({ host, client }) => client.setAgentTimelineSubscription(perHost.get(host.id) ?? [])));
  }

  private async invoke(method: string, args: any[]) {
    const firstArg = args[0];
    let idKey: string | undefined;
    if (AGENT_ID_METHODS.has(method)) {
      idKey = method === "sendAgentMessage" ? firstArg?.agentId : method === "respondToPermission" ? firstArg : firstArg;
    }
    const split = splitRemoteId(idKey);
    const commandAgentId = method === "listCommands" && firstArg && typeof firstArg === "object"
      ? splitRemoteId(firstArg.agentId)
      : null;
    const routedId = split || commandAgentId;
    const entry = routedId ? this.entries.get(routedId.hostId) : this.local();
    if (!entry) throw new Error(`Hôte Paseo indisponible : ${routedId?.hostId || "local"}`);
    const fn = (entry.client as any)[method];
    if (typeof fn !== "function") throw new Error(`Méthode Paseo inconnue : ${method}`);
    const routedArgs = args.map((arg, index) => {
      if (index === 0 && commandAgentId && method === "listCommands") return { ...arg, agentId: commandAgentId.id };
      if (index === 0 && split) {
        if (method === "sendAgentMessage") return { ...arg, agentId: split.id };
        if (method === "respondToPermission") return split.id;
        return split.id;
      }
      return arg;
    });
    const result = await fn.apply(entry.client, routedArgs);
    if (method === "createWorktree" && split) return result;
    return result;
  }
}
