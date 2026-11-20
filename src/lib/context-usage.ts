import type { AgentModel, AgentSnapshot } from "./paseo/types";

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  ratio: number;
  percentage: number;
}

export function resolveContextUsage(
  activeAgent: AgentSnapshot | null | undefined,
  models: AgentModel[],
  selectedModel: string | null | undefined,
): ContextUsage {
  const usage = activeAgent?.lastUsage || activeAgent?.tokenUsage;

  const usedTokens =
    usage?.contextWindowUsedTokens ??
    ((usage?.inputTokens || 0) +
      (usage?.cachedInputTokens || usage?.cachedTokens || 0) +
      (usage?.outputTokens || 0));

  const modelId = activeAgent?.model || selectedModel;
  const currentModel =
    models.find((model) => model.id === modelId) ||
    models.find((model) => model.id.endsWith(`/${modelId}`));

  const maxTokens =
    usage?.contextWindowMaxTokens ||
    usage?.contextWindow ||
    currentModel?.contextWindow ||
    1_000_000;

  const ratio = Math.min(1, Math.max(0, usedTokens / (maxTokens || 1)));

  return {
    usedTokens,
    maxTokens,
    ratio,
    percentage: Math.round(ratio * 100),
  };
}
