import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUp, FileDiff, GitBranch, GitCommit, GitPullRequest, Loader2, RefreshCw } from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { AgentSnapshot, GitStatusSummary } from "../../lib/paseo/types";
import { commitSuggestionPrompt, gitStatusFromBranch, githubRemoteLabel } from "../../lib/paseo/git-status";
import { ChangesDrawer } from "../drawers/ChangesDrawer";
import { PressButton } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

function assertSuccess(result: unknown, action: string): void {
  const payload = result as { success?: boolean; error?: string | { message?: string } } | null;
  if (payload?.success !== false && !payload?.error) return;
  const error = payload?.error;
  throw new Error(typeof error === "string" ? error : error?.message || `${action} a échoué.`);
}

export function SessionGitControls({ session, room = false }: { session?: AgentSnapshot | null; room?: boolean }) {
  const { activeWorkspace, activeAgent, gitStatus, refreshGitStatus, openChangesTab, commitGitChanges, sendMessage, setActiveTab } = useWorkspace();
  const { getClientForHost, getHostState } = usePaseo();
  const activeSession = room ? session : activeAgent;
  const cwd = room
    ? session?.cwd || session?.project?.checkout?.cwd || ""
    : activeWorkspace?.path || "";
  const hostId = room ? session?.hostId || "local" : "local";
  const sessionBranch = session?.project?.checkout?.currentBranch;
  const hostState = getHostState(hostId);
  const sourceClient = getClientForHost(hostId);
  const [remoteStatus, setRemoteStatus] = useState<{ key: string; value: GitStatusSummary } | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [githubMenuOpen, setGithubMenuOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"push" | "pr" | null>(null);
  const [busyAction, setBusyAction] = useState<"push" | "pr" | "refresh" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const statusKey = `${hostId}:${cwd}`;
  const status = room ? (remoteStatus?.key === statusKey ? remoteStatus.value : null) : gitStatus;
  const remoteName = githubRemoteLabel(status?.remoteUrl) || "dépôt GitHub distant";

  const refresh = useCallback(async () => {
    if (!cwd || !sourceClient || hostState !== "connected") {
      if (room) setRemoteStatus(null);
      return;
    }
    if (room) {
      const next = await sourceClient.getGitStatus(cwd, (preliminary) => {
        setRemoteStatus({ key: statusKey, value: preliminary });
      });
      setRemoteStatus({ key: statusKey, value: next });
    } else {
      await refreshGitStatus();
    }
  }, [cwd, hostState, room, sourceClient, statusKey, refreshGitStatus]);

  useEffect(() => {
    if (!room) return;
    setRemoteStatus(sessionBranch ? { key: statusKey, value: gitStatusFromBranch(sessionBranch) } : null);
    if (!cwd || hostState !== "connected") return;
    let cancelled = false;
    sourceClient?.getGitStatus(cwd, (preliminary) => {
      if (!cancelled) setRemoteStatus({ key: statusKey, value: preliminary });
    }).then((value) => {
      if (!cancelled) setRemoteStatus({ key: statusKey, value });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [room, cwd, hostState, sourceClient, statusKey, session?.status, sessionBranch]);

  const files = useMemo(() => [...(status?.stagedFiles || []), ...(status?.unstagedFiles || [])], [status]);
  const additions = files.reduce((total, file) => total + (file.insertions || 0), 0);
  const deletions = files.reduce((total, file) => total + (file.deletions || 0), 0);

  const runAction = async (action: "push" | "pr") => {
    if (!sourceClient || !cwd || !status?.hasGithubRemote || busyAction) return;
    setActionError(null);
    setBusyAction(action);
    try {
      const result = action === "push"
        ? await sourceClient.checkoutPush(cwd)
        : await sourceClient.checkoutPrCreate(cwd, {});
      assertSuccess(result, action === "push" ? "Le push" : "La création de la PR");
      await refresh();
      setGithubMenuOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const suggestCommitMessage = async () => {
    if (!activeSession?.id || files.length === 0) return;
    await sendMessage(
      commitSuggestionPrompt(files),
      undefined,
      undefined,
      { agentId: activeSession.id },
    );
    setChangesOpen(false);
    if (!room) setActiveTab({ kind: "agent", targetId: activeSession.id });
  };

  if (!cwd || hostState !== "connected" || !status?.isGitRepo) return null;

  const openChanges = () => room ? setChangesOpen(true) : openChangesTab();
  return (
    <div className={room ? "flex min-w-0 flex-wrap items-center gap-1.5 text-xs" : "flex min-w-0 items-center gap-1.5 text-xs"}>
      <span className="flex max-w-32 items-center gap-1 rounded-lg border border-border px-2 py-1 font-mono text-foreground" title={`Branche ${status.branch}`}>
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{status.branch}</span>
      </span>
      <span className="whitespace-nowrap font-mono text-muted-foreground" title={status.diffLoaded === false ? "Lecture des modifications locales en cours" : `${files.length} fichiers modifiés localement et non commités, ${additions} lignes ajoutées, ${deletions} lignes supprimées. Aucun pull ni push implicite.`}>
        {status.diffLoaded === false ? "— fichiers locaux" : `${files.length} locaux · +${additions} / −${deletions}`}
      </span>
      {files.length > 0 && (
        <>
          <PressButton onPress={openChanges} className="flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-foreground hover:bg-muted" title="Voir les diffs" aria-label="Voir les diffs">
            <FileDiff className="h-3.5 w-3.5" />{room && <span>Diffs</span>}
          </PressButton>
          <PressButton onPress={openChanges} className="flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-foreground hover:bg-muted" title="Préparer un commit" aria-label="Préparer un commit">
            <GitCommit className="h-3.5 w-3.5" />{room && <span>Commit</span>}
          </PressButton>
        </>
      )}
      {status.hasGithubRemote && (
        <Popover open={githubMenuOpen} onOpenChange={setGithubMenuOpen}>
          <PopoverTrigger asChild>
            <PressButton className="flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-foreground hover:bg-muted" title={`Remote GitHub configuré : ${remoteName}`} aria-label={`Actions GitHub pour ${remoteName}`}>
              {busyAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5" />}<span className="max-w-28 truncate font-mono text-[10px]">{remoteName}</span>
            </PressButton>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 space-y-1 p-1.5">
            <div className="border-b border-border px-2.5 py-2 text-xs"><p className="text-muted-foreground">Remote GitHub configuré</p><p className="mt-0.5 truncate font-mono font-semibold text-foreground" title={remoteName}>{remoteName}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Les changements locaux ne sont pas encore publiés.</p></div>
            <PressButton onPress={() => { setGithubMenuOpen(false); setConfirmAction("push"); }} disabled={Boolean(busyAction)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-muted disabled:opacity-50">
              <ArrowUp className="h-3.5 w-3.5" />Push
            </PressButton>
            <PressButton onPress={() => { setGithubMenuOpen(false); setConfirmAction("pr"); }} disabled={Boolean(busyAction)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground hover:bg-muted disabled:opacity-50">
              <GitPullRequest className="h-3.5 w-3.5" />Créer une PR
            </PressButton>
          </PopoverContent>
        </Popover>
      )}
      <PressButton onPress={() => { setBusyAction("refresh"); void refresh().finally(() => setBusyAction(null)); }} disabled={Boolean(busyAction)} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50" title="Actualiser l’état Git" aria-label="Actualiser l’état Git">
        <RefreshCw className="h-3.5 w-3.5" />
      </PressButton>
      {actionError && <span role="alert" className="max-w-48 truncate text-xs text-destructive" title={actionError}>{actionError}</span>}
      <Dialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader><DialogTitle>{confirmAction === "push" ? "Publier vers GitHub ?" : "Créer une PR sur GitHub ?"}</DialogTitle><DialogDescription>Remote ciblé : <strong className="font-mono text-foreground">{remoteName}</strong>. Les fichiers locaux non commités ne seront pas publiés. Vérifie que ce dépôt est bien le tien avant de continuer.</DialogDescription></DialogHeader>
          <DialogFooter><PressButton onPress={() => setConfirmAction(null)} className="min-h-9 rounded-lg border border-border px-3 text-sm">Annuler</PressButton><PressButton onPress={() => { const action = confirmAction; setConfirmAction(null); if (action) void runAction(action); }} className="min-h-9 rounded-lg bg-primary px-3 text-sm text-primary-foreground">{confirmAction === "push" ? "Confirmer le push" : "Confirmer la PR"}</PressButton></DialogFooter>
        </DialogContent>
      </Dialog>
      {room && (
        <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
          <DialogContent className="flex h-[min(80vh,760px)] w-[min(95vw,1100px)] max-w-none flex-col overflow-hidden p-0">
            <DialogHeader className="border-b border-border px-4 py-3"><DialogTitle className="text-sm">Changements Git · {status.branch}</DialogTitle></DialogHeader>
            <div className="min-h-0 flex-1"><ChangesDrawer status={status} cwd={cwd} hostId={hostId} onRefresh={refresh} onCommit={async (message) => {
              if (!sourceClient) throw new Error("Hôte Paseo indisponible.");
              await sourceClient.commitGitChanges({ workspaceId: session?.workspaceId || cwd, cwd, message });
              await refresh();
            }} onSuggestCommitMessage={activeSession ? suggestCommitMessage : undefined} /></div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
