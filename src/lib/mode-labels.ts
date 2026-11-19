const LABELS: Record<string, string> = {
  "plan mode": "Mode plan",
  "always ask": "Toujours demander",
  "accept file edits": "Accepter les modifications",
  "auto mode": "Mode auto",
  "bypass": "Sans validation",
  "bypass permissions": "Sans validation",
  "default": "Par défaut",
};

/** Libellé français d'un mode d'agent fourni par le daemon (affichage seulement : l'identifiant ne change pas). */
export function modeLabel(name: string): string {
  return LABELS[name.trim().toLowerCase()] ?? name;
}
