import raw from "./agents.example.json";
import type { PaseoProviderInfo } from "../lib/paseo/types";

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  /** Nom d'un fichier de `public/avatars/`. */
  avatar: string;
  accentColor: string;
  /** Les IDs viennent du daemon Paseo ; aucun chemin local n'est requis. */
  paseo: { workspaceId?: string; provider?: string; model?: string; providerLabel?: string; hostId?: string; reasoning?: string; instructions?: string };
}

export type PublicAgent = Pick<AgentConfig, "id" | "name" | "role" | "avatar" | "accentColor" | "paseo"> & {
  avatarUrl: string;
  paseo: AgentConfig["paseo"] & { hostId?: string };
};

export type RoomAgentCustomization = Pick<AgentConfig, "name" | "role" | "avatar" | "accentColor"> & {
  providerId?: string;
  hostId?: string;
  model?: string;
  reasoning?: string;
  instructions?: string;
};

export function validateAgents(input: unknown): AgentConfig[] {
  const list = (input as { agents?: unknown })?.agents;
  if (!Array.isArray(list)) throw new Error("agents.json : tableau `agents` manquant");
  const seen = new Set<string>();
  return list.map((a, i) => {
    const where = `agents.json[${i}]`;
    const o = a as Partial<AgentConfig>;
    for (const k of ["id", "name", "role", "avatar", "accentColor"] as const) {
      if (typeof o[k] !== "string" || !o[k]) throw new Error(`${where} : champ \`${k}\` manquant`);
    }
    if (!/^[a-z0-9-]+$/.test(o.id!)) throw new Error(`${where} : id invalide (a-z, 0-9, -)`);
    if (!/^[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(o.avatar!)) throw new Error(`${where} : avatar invalide`);
    if (!/^#[0-9a-f]{6}$/i.test(o.accentColor!)) throw new Error(`${where} : accentColor doit être #rrggbb`);
    if (seen.has(o.id!)) throw new Error(`${where} : id en double « ${o.id} »`);
    seen.add(o.id!);
    if (!o.paseo || (o.paseo.workspaceId !== undefined && typeof o.paseo.workspaceId !== "string") || (o.paseo.provider !== undefined && typeof o.paseo.provider !== "string") || (o.paseo.model !== undefined && typeof o.paseo.model !== "string") || (o.paseo.providerLabel !== undefined && typeof o.paseo.providerLabel !== "string") || (o.paseo.hostId !== undefined && typeof o.paseo.hostId !== "string") || (o.paseo.reasoning !== undefined && typeof o.paseo.reasoning !== "string") || (o.paseo.instructions !== undefined && typeof o.paseo.instructions !== "string")) {
      throw new Error(`${where} : configuration Paseo invalide`);
    }
    return o as AgentConfig;
  });
}

export const agents = validateAgents(raw);
export const getAgent = (id: string) => agents.find((a) => a.id === id);
export const toPublic = (a: AgentConfig): PublicAgent => ({
  id: a.id, name: a.name, role: a.role, avatar: a.avatar, accentColor: a.accentColor,
  paseo: a.paseo, avatarUrl: `/avatars/${a.avatar}`,
});

const normalizeProviderKey = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const RESERVED_PROJECT_PROVIDERS = new Set([
  "claude", "codex", "copilot", "opencode", "pi", "omp", "ohmypi", "antigravity", "muse", "musecode",
]);

function makePublicAgent(
  providerId: string | undefined,
  providerLabel: string,
  modelId: string | undefined,
  profile: AgentConfig,
  customization?: RoomAgentCustomization,
  workspaceId?: string,
  hostId?: string,
): PublicAgent {
  const visual = { ...profile, ...customization };
  // A first-run generic template may have been saved under the real provider ID.
  // It must not rename an imported, provider-bound profile such as Maintenance 360.
  const genericTemplateName = ["Agent général", "Agent développeur", "General agent", "Developer agent"].includes(customization?.name || "");
  const genericProfile = !profile.paseo.provider && ["general", "developer"].includes(profile.id);
  const name = genericTemplateName ? (genericProfile ? providerLabel : profile.name) : visual.name;
  const role = genericTemplateName ? (genericProfile ? "Agent ACP géré par Paseo" : profile.role) : visual.role;
  const avatar = genericTemplateName && !genericProfile ? profile.avatar : visual.avatar;
  const accentColor = genericTemplateName && !genericProfile ? profile.accentColor : visual.accentColor;
  return {
    id: profile.id,
    name,
    role,
    avatar,
    avatarUrl: `/avatars/${avatar}`,
    accentColor,
    paseo: {
      provider: customization?.providerId || providerId || profile.paseo.provider,
      providerLabel: "Hermes • Unraid",
      model: customization?.model || modelId || profile.paseo.model,
      workspaceId: workspaceId || profile.paseo.workspaceId,
      hostId: customization?.hostId || hostId || profile.paseo.hostId,
      reasoning: customization?.reasoning || profile.paseo.reasoning,
      instructions: customization?.instructions || profile.paseo.instructions,
    },
  };
}

/** Merge active Paseo ACP providers with matching ROOM visual profiles. */
export function mergeRoomProviders(
  providers: PaseoProviderInfo[],
  customizations: Record<string, RoomAgentCustomization> = {},
  profiles: AgentConfig[] = agents,
): PublicAgent[] {
  const seen = new Set<string>();
  const matchedProfiles = new Set<string>();
  const activeAgents = providers.flatMap((provider) => {
    const id = provider.id.trim();
    if (!id || seen.has(normalizeProviderKey(id)) || !provider.enabled || ["disabled", "unavailable", "inactive", "error"].includes(provider.status.toLocaleLowerCase())) return [];
    const providerKey = normalizeProviderKey(id);
    const providerKind = normalizeProviderKey(provider.kind || "");
    const labelKey = normalizeProviderKey(provider.label || "");
    const isReservedRuntime = [providerKey, labelKey].some((key) =>
      [...RESERVED_PROJECT_PROVIDERS].some((reserved) => key === reserved || key.startsWith(reserved)),
    );
    if (isReservedRuntime && !/(acp|custom|agent)/.test(providerKind)) return [];
    seen.add(id.toLocaleLowerCase());
    const matchKeys = new Set([id, provider.label, ...provider.models.map((model) => model.name)].map(normalizeProviderKey));
    const preferenceFor = (candidate: AgentConfig) => customizations[candidate.id] || customizations[candidate.paseo.provider || ""];
    const profile = profiles.find((candidate) => {
      if (matchedProfiles.has(candidate.id)) return false;
      const preference = preferenceFor(candidate);
      if (preference?.providerId) return preference.providerId === id && (!preference.hostId || preference.hostId === provider.hostId);
      return [candidate.id, candidate.name, candidate.paseo.provider || ""].some((key) => matchKeys.has(normalizeProviderKey(key)));
    });
    if (profile) matchedProfiles.add(profile.id);
    const safeId = id.toLocaleLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "agent";
    const model = provider.models[0];
    if (profile) {
      return [makePublicAgent(id, provider.label || id, model?.id, profile, preferenceFor(profile) || customizations[id], provider.workspaceId, provider.hostId)];
    }
    return [{
      id: `acp-${safeId}`,
      name: customizations[id]?.name || provider.label || id,
      role: customizations[id]?.role || "Agent ACP géré par Paseo",
      avatar: customizations[id]?.avatar || "robot.png",
      avatarUrl: `/avatars/${customizations[id]?.avatar || "robot.png"}`,
      accentColor: customizations[id]?.accentColor || "#6D75E3",
      paseo: { provider: id, providerLabel: "Hermes • Unraid", model: model?.id, workspaceId: provider.workspaceId, hostId: provider.hostId },
    }];
  });
  const guaranteedProfiles = profiles
    .filter((profile) => !matchedProfiles.has(profile.id))
    .filter((profile) => activeAgents.length === 0 || profile.paseo.provider || !["general", "developer"].includes(profile.id))
    .map((profile) => makePublicAgent(profile.paseo.provider, "Hermes • Unraid", profile.paseo.model, profile, customizations[profile.paseo.provider || ""] || customizations[profile.id]));
  return [...activeAgents, ...guaranteedProfiles];
}
