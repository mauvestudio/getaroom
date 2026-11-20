const RELEASE_API = "https://api.github.com/repos/mauvestudio/getaroom/releases/latest";
const STORAGE_KEY = "getaroom-update-check";

export interface UpdateCheckResult {
  checkedAt: number;
  current: string;
  latest: string | null;
  available: boolean;
  url: string | null;
  publishedAt: string | null;
  error: string | null;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkForUpdate(current: string): Promise<UpdateCheckResult> {
  const base: UpdateCheckResult = {
    checkedAt: Date.now(),
    current,
    latest: null,
    available: false,
    url: null,
    publishedAt: null,
    error: null,
  };
  try {
    const response = await fetch(RELEASE_API, { headers: { accept: "application/json" } });
    if (response.status === 404) {
      return { ...base, error: "Aucune release publiée sur mauvestudio/getaroom." };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      published_at?: string;
    };
    const latest = (release.tag_name || "").trim();
    if (!latest) return { ...base, error: "Réponse de release invalide." };
    return {
      ...base,
      latest,
      available: compareVersions(current, latest) > 0,
      url: release.html_url || null,
      publishedAt: release.published_at || null,
    };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

export function readStoredUpdateCheck(): UpdateCheckResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UpdateCheckResult;
    return parsed && typeof parsed.checkedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function storeUpdateCheck(result: UpdateCheckResult): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {}
}

export function formatCheckTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}
