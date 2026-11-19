import type { AgentSnapshot } from "./paseo/types";

/** État affiché sur les cartes et dans la barre latérale. */
export type LiveStatus = "working" | "approval" | "review" | "idle";

export const STATUS_LABEL: Record<LiveStatus, string> = {
  working: "Au travail",
  approval: "À valider",
  review: "À relire",
  idle: "Au repos",
};

type StatusInput = Pick<AgentSnapshot, "status" | "requiresAttention" | "attentionReason">;

/** Priorité : une approbation attendue prime, puis le travail en cours, puis le « à relire ». */
export function deriveStatus(sessions: readonly StatusInput[], hasPendingApproval: boolean): LiveStatus {
  if (hasPendingApproval || sessions.some((s) => s.attentionReason === "permission")) return "approval";
  if (sessions.some((s) => s.status === "running")) return "working";
  if (sessions.some((s) => s.requiresAttention && s.attentionReason === "finished")) return "review";
  return "idle";
}

/** Sessions du daemon rattachées à un dossier de travail (le dossier lui-même ou un sous-dossier). */
export function sessionsInCwd<T extends { cwd?: string }>(all: readonly T[], cwd: string): T[] {
  const base = cwd.replace(/\/+$/, "");
  return all.filter((a) => !!a.cwd && (a.cwd === base || a.cwd.startsWith(base + "/")));
}
