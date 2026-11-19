import type { AgentPermissionAction, AgentPermissionRequest, AgentPermissionResponse } from "../../lib/paseo/types";

export type ApprovalKind = "shell" | "edit" | "write" | "other";

export interface ApprovalView {
  kind: ApprovalKind;
  /** Phrase courte et claire : ce que l'agent veut faire. */
  title: string;
  /** Cible concrète : commande, chemin du fichier… */
  subject: string | null;
  /** Aperçu du changement (diff ou début du contenu), tronqué. */
  preview: string | null;
  description: string | null;
}

const clip = (s: string, lines = 14) => {
  const all = s.split("\n");
  return all.length > lines ? all.slice(0, lines).join("\n") + `\n… (${all.length - lines} lignes de plus)` : s;
};

export function describeApproval(req: AgentPermissionRequest): ApprovalView {
  const d = req.detail;
  const description = req.description?.trim() || null;
  if (d?.type === "shell") {
    return { kind: "shell", title: "Exécuter une commande", subject: d.command, preview: null, description };
  }
  if (d?.type === "edit") {
    return {
      kind: "edit", title: "Modifier un fichier", subject: d.filePath,
      preview: d.unifiedDiff ? clip(d.unifiedDiff) : d.newString ? clip(d.newString) : null, description,
    };
  }
  if (d?.type === "write") {
    return { kind: "write", title: "Créer ou remplacer un fichier", subject: d.filePath, preview: d.content ? clip(d.content, 10) : null, description };
  }
  return { kind: "other", title: req.title?.trim() || "Action sensible", subject: req.name || null, preview: null, description };
}

export interface ApprovalChoices {
  deny: AgentPermissionAction;
  allow: AgentPermissionAction;
  /** « Toujours autoriser » quand l'agent le propose. */
  always: AgentPermissionAction | null;
}

/** Choisit les boutons Refuser / Valider (et l'option « toujours ») parmi les actions proposées. */
export function pickChoices(actions?: AgentPermissionAction[]): ApprovalChoices {
  const list = actions && actions.length > 0 ? actions : [
    { id: "deny", label: "Deny", behavior: "deny" as const, variant: "danger" as const },
    { id: "allow_always", label: "Allow always", behavior: "allow" as const, variant: "secondary" as const },
    { id: "allow_once", label: "Allow once", behavior: "allow" as const, variant: "primary" as const },
  ];
  const allows = list.filter((a) => a.behavior === "allow");
  const deny = list.find((a) => a.behavior === "deny") ?? { id: "deny", label: "Deny", behavior: "deny" as const };
  const allow = allows.find((a) => a.variant === "primary") ?? allows[0] ?? { id: "allow_once", label: "Allow once", behavior: "allow" as const };
  const always = allows.find((a) => a.id !== allow.id && a.variant === "secondary") ?? null;
  return { deny, allow, always };
}

export function toResponse(action: AgentPermissionAction): AgentPermissionResponse {
  return action.behavior === "deny"
    ? { behavior: "deny", selectedActionId: action.id, message: "Refusé par l'utilisateur" }
    : { behavior: "allow", selectedActionId: action.id };
}
