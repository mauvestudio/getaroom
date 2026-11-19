/** « à l'instant », « il y a 5 min », « il y a 3 h », « il y a 2 j » (français). */
export function timeAgo(when: string | number | Date | null | undefined, now = Date.now()): string {
  if (when === null || when === undefined) return "";
  const t = new Date(when).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (now - t) / 1000);
  if (s < 45) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
