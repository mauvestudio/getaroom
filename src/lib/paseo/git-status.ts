import type { GitStatusSummary } from "./types";

export function gitStatusFromBranch(branch: string): GitStatusSummary {
  return {
    isGitRepo: true,
    hasRemote: false,
    hasGithubRemote: false,
    diffLoaded: false,
    branch,
    ahead: 0,
    behind: 0,
    isClean: true,
    stagedFiles: [],
    unstagedFiles: [],
    untrackedFiles: [],
  };
}

export function isGithubRemoteUrl(remoteUrl: string | null | undefined): boolean {
  if (!remoteUrl) return false;
  return /^(?:https?:\/\/|ssh:\/\/|git:\/\/)(?:[^@/]+@)?github\.com[/:]/i.test(remoteUrl)
    || /^[^@\s]+@github\.com:/i.test(remoteUrl);
}

/** Nom public du dépôt, sans identifiants éventuellement présents dans l'URL du remote. */
export function githubRemoteLabel(remoteUrl: string | null | undefined): string | null {
  if (!isGithubRemoteUrl(remoteUrl)) return null;
  const url = remoteUrl || "";
  const path = url.match(/^[^@\s]+@github\.com:(.+)$/i)?.[1]
    || url.match(/^(?:https?:\/\/|ssh:\/\/|git:\/\/)(?:[^@/]+@)?github\.com[/:](.+)$/i)?.[1];
  const parts = path?.replace(/\.git\/?$/i, "").replace(/\/$/, "").split("/");
  return parts && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
}

export function commitSuggestionPrompt(files: Array<{ path: string; insertions?: number; deletions?: number; diff?: string }>): string {
  const changes = files
    .map((file) => `${file.path} (+${file.insertions || 0}/-${file.deletions || 0})\n${file.diff || ""}`)
    .join("\n\n")
    .slice(0, 12_000);
  return `Propose un message de commit concis en français pour les changements Git ci-dessous, au format Conventional Commits. Réponds uniquement avec le message. Ne lance aucune commande et ne modifie aucun fichier.\n\n${changes}`;
}
