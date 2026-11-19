export type ProjectGroup = "mauve" | "perso" | "autres";
export type GroupFilter = "all" | ProjectGroup;

export const GROUP_ORDER: ProjectGroup[] = ["mauve", "perso", "autres"];
export const GROUP_LABEL: Record<ProjectGroup, string> = { mauve: "Mauve", perso: "Perso", autres: "Autres" };

/** Univers d'un projet d'après son chemin : `…/Dev/Mauve/…`, `…/Dev/Perso/…`, sinon « autres ». */
export function projectGroup(rootPath?: string | null): ProjectGroup {
  const p = (rootPath ?? "").replace(/\\/g, "/").toLowerCase();
  if (p.includes("/dev/mauve/")) return "mauve";
  if (p.includes("/dev/perso/")) return "perso";
  return "autres";
}

/** Tri stable par univers (Mauve, Perso, Autres) ; l'ordre relatif choisi par l'utilisateur est conservé. */
export function sortByGroup<T>(items: T[], pathOf: (item: T) => string | undefined): T[] {
  return items
    .map((item, i) => ({ item, i, g: GROUP_ORDER.indexOf(projectGroup(pathOf(item))) }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((x) => x.item);
}
