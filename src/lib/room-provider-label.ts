import type { AgentModel } from "./paseo/types";

export const DEFAULT_ROOM_PROVIDER_LABEL = "Hermes • Unraid";

export function roomProviderLabel(provider: string | null | undefined, models: AgentModel[]): string {
  const id = provider?.trim();
  if (!id) return DEFAULT_ROOM_PROVIDER_LABEL;
  const available = models.find((model) => model.agentProvider?.toLocaleLowerCase() === id.toLocaleLowerCase());
  return available?.providerName?.trim() || (id.toLocaleLowerCase() === "hermes" ? DEFAULT_ROOM_PROVIDER_LABEL : id);
}
