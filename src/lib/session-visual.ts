// État visuel d'une session, comme dans Paseo : roue qui tourne pendant le travail,
// pastille verte quand c'est fini (jusqu'à ce que la session soit ouverte).

export type SessionVisual = "running" | "permission" | "finished" | "failed" | "idle";

export interface SessionVisualInput {
  status?: string | null;
  requiresAttention?: boolean | null;
  attentionReason?: string | null;
}

/** Priorité : validation attendue › en cours › erreur › terminé non lu › rien. */
export function sessionVisual(session: SessionVisualInput | null | undefined, hasPendingPermission = false): SessionVisual {
  if (!session) return "idle";
  if (hasPendingPermission || session.attentionReason === "permission") return "permission";
  if (session.status === "running") return "running";
  if (session.status === "failed" || (session.requiresAttention && session.attentionReason === "error")) return "failed";
  if (session.requiresAttention && (session.attentionReason === "finished" || !session.attentionReason)) return "finished";
  return "idle";
}

/** Agrégat pour un projet / worktree : le plus important de ses sessions. */
export function aggregateVisual(states: SessionVisual[]): SessionVisual {
  for (const state of ["permission", "running", "failed", "finished"] as const) if (states.includes(state)) return state;
  return "idle";
}

export const SESSION_VISUAL_LABEL: Record<SessionVisual, string> = {
  running: "En cours",
  permission: "Validation requise",
  finished: "Terminé",
  failed: "Erreur",
  idle: "",
};
