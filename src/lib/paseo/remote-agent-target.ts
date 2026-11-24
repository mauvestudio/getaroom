// Dossier de travail d'une nouvelle session sur un hôte distant.
// Un agent ACP distant vit dans son propre workspace : il ne faut jamais en choisir un au hasard.

export interface RemoteWorkspaceEntry {
  id?: string;
  workspaceId?: string;
  workspaceDirectory?: string;
  path?: string;
  archivedAt?: string | null;
  archivingAt?: string | null;
}

export interface RemoteSessionEntry {
  provider?: string;
  cwd?: string;
  workspaceId?: string | null;
  archivedAt?: string | null;
  updatedAt?: string;
}

export interface RemoteAgentTarget {
  workspaceId?: string;
  cwd: string;
}

const workspaceIdOf = (entry: RemoteWorkspaceEntry) => entry.workspaceId ?? entry.id;
const directoryOf = (entry: RemoteWorkspaceEntry) => entry.workspaceDirectory ?? entry.path ?? "";
const baseName = (path: string) => path.replace(/\/+$/, "").split("/").pop()?.toLocaleLowerCase() ?? "";
const updatedAt = (session: RemoteSessionEntry) => Date.parse(session.updatedAt ?? "") || 0;

/**
 * Ordre de priorité : workspace demandé › dernière session active de ce provider ›
 * dossier portant le nom du provider (`hermes-toodoo` → `/agents/toodoo`) ›
 * dernière session archivée › workspace unique › dossier suggéré par le daemon.
 */
export function resolveRemoteAgentTarget(input: {
  provider?: string;
  workspaceId?: string;
  workspaces: readonly RemoteWorkspaceEntry[];
  sessions?: readonly RemoteSessionEntry[];
  suggestedDirectories?: readonly string[];
}): RemoteAgentTarget | null {
  const usable = input.workspaces.filter((entry) => workspaceIdOf(entry) && directoryOf(entry) && !entry.archivedAt && !entry.archivingAt);
  const toTarget = (entry: RemoteWorkspaceEntry): RemoteAgentTarget => ({ workspaceId: workspaceIdOf(entry), cwd: directoryOf(entry) });

  if (input.workspaceId) {
    const requested = input.workspaces.find((entry) => workspaceIdOf(entry) === input.workspaceId && directoryOf(entry));
    return requested ? toTarget(requested) : null;
  }

  const provider = input.provider?.toLocaleLowerCase() ?? "";
  const sessions = [...(input.sessions ?? [])]
    .filter((session) => session.provider?.toLocaleLowerCase() === provider)
    .sort((a, b) => updatedAt(b) - updatedAt(a));
  const workspaceOf = (session: RemoteSessionEntry) => usable.find((entry) => workspaceIdOf(entry) === session.workspaceId)
    ?? usable.find((entry) => directoryOf(entry) === session.cwd);

  for (const session of sessions) {
    if (session.archivedAt) continue;
    const workspace = workspaceOf(session);
    if (workspace) return toTarget(workspace);
  }

  if (provider) {
    const named = usable
      .filter((entry) => {
        const name = baseName(directoryOf(entry));
        return Boolean(name) && (provider === name || provider.endsWith(`-${name}`));
      })
      .sort((a, b) => baseName(directoryOf(b)).length - baseName(directoryOf(a)).length)[0];
    if (named) return toTarget(named);
  }

  for (const session of sessions) {
    const workspace = workspaceOf(session);
    if (workspace) return toTarget(workspace);
  }

  if (usable.length === 1) return toTarget(usable[0]!);

  const directory = input.suggestedDirectories?.find((path) => path.startsWith("/"));
  const parent = directory?.slice(0, directory.lastIndexOf("/"));
  return parent ? { cwd: parent } : null;
}
