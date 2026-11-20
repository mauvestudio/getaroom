export async function resolveWorkspacePath(workspacePath: string): Promise<string> {
  const path = workspacePath.trim();
  if (!path.startsWith("/")) throw new Error("Le workspace actif ne fournit pas un chemin local valide.");
  const response = await fetch("/api/workspace/resolve-path", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const result = (await response.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!response.ok || !result.path) {
    throw new Error(result.error || "Le dossier du workspace sélectionné est introuvable.");
  }
  return result.path;
}
