import React, { useState, useEffect } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { usePaseo } from "../../context/PaseoContext";
import { useI18n } from "../../i18n/I18nContext";
import type { PaseoClient } from "../../lib/paseo/client";
import { DiffViewer } from "../chat/DiffViewer";
import {
  GitBranch,
  GitCommit,
  RefreshCw,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowUp,
  ArrowDown,
  History,
  RotateCcw,
  GitPullRequest,
} from "lucide-react";
import type { GitFileChange, GitStatusSummary } from "../../lib/paseo/types";
import { commitSuggestionPrompt, githubRemoteLabel } from "../../lib/paseo/git-status";
import { PressButton } from "../ui/button";

interface ChangesDrawerProps {
  status?: GitStatusSummary | null;
  cwd?: string;
  hostId?: string;
  onRefresh?: () => Promise<void>;
  onCommit?: (message: string) => Promise<void>;
  onSuggestCommitMessage?: () => Promise<void>;
}

type Commit = Awaited<ReturnType<PaseoClient["listCheckoutCommits"]>>["commits"][number];

export function ChangesDrawer({ status, cwd, hostId = "local", onRefresh, onCommit, onSuggestCommitMessage }: ChangesDrawerProps = {}) {
  const workspace = useWorkspace();
  const { getClientForHost } = usePaseo();
  const { t } = useI18n();
  const sourceClient = getClientForHost(hostId);
  const gitCwd = cwd || workspace.activeWorkspace?.path || "";
  const gitStatus = status === undefined ? workspace.gitStatus : status;
  const refreshGitStatus = onRefresh || workspace.refreshGitStatus;
  const commitGitChanges = onCommit || workspace.commitGitChanges;
  const suggestCommitMessage = onSuggestCommitMessage || (workspace.activeAgentId ? async () => {
    await workspace.sendMessage(commitSuggestionPrompt(allFiles), undefined, undefined, { agentId: workspace.activeAgentId! });
    workspace.setActiveTab({ kind: "agent", targetId: workspace.activeAgentId! });
  } : undefined);
  const [selectedFile, setSelectedFile] = useState<GitFileChange | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [view, setView] = useState<"changes" | "history">("changes");
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [commitFile, setCommitFile] = useState<GitFileChange | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [showBranches, setShowBranches] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSelectedFile(null); setSelectedCommit(null); setCommitFile(null); setCommits([]); }, [gitCwd, hostId]);

  const loadHistory = async () => {
    if (!sourceClient || !gitCwd) return;
    setCommitError(null);
    try { setCommits((await sourceClient.listCheckoutCommits(gitCwd)).commits); }
    catch (error) { setCommitError(error instanceof Error ? error.message : String(error)); }
  };

  const assertSuccess = (result: unknown) => {
    const value = result as { success?: boolean; error?: string | { message?: string } } | null;
    if (value?.success === false || value?.error) throw new Error(typeof value.error === "string" ? value.error : value.error?.message || "Paseo Git RPC failed");
  };

  const runGit = async (action: "discard" | "switch" | "pull" | "push" | "sync" | "pr", path?: string) => {
    if (!sourceClient || !gitCwd || busy) return;
    if (!window.confirm(action === "discard" ? t("Annuler les modifications de ce fichier ?") : action === "switch" ? t("Changer de branche ?") : t("Confirmer l’action sur le dépôt distant ?"))) return;
    setBusy(true); setCommitError(null);
    try {
      if (action === "discard" && path) assertSuccess(await sourceClient.checkoutDiscardChanges(gitCwd, [path]));
      if (action === "switch" && path) assertSuccess(await sourceClient.checkoutSwitchBranch(gitCwd, path));
      if (action === "pull" || action === "sync") assertSuccess(await sourceClient.checkoutPull(gitCwd));
      if (action === "push" || action === "sync") assertSuccess(await sourceClient.checkoutPush(gitCwd));
      if (action === "pr") assertSuccess(await sourceClient.checkoutPrCreate(gitCwd, {}));
      await refreshGitStatus();
      setShowBranches(false);
    } catch (error) { setCommitError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  const selectCommitFile = async (commit: Commit, path: string) => {
    if (!sourceClient || !gitCwd) return;
    setCommitError(null);
    try { setCommitFile(await sourceClient.getCommitFileDiff(gitCwd, commit.sha, path)); }
    catch (error) { setCommitError(error instanceof Error ? error.message : String(error)); }
  };

  const allFiles = [
    ...(gitStatus?.stagedFiles || []),
    ...(gitStatus?.unstagedFiles || []),
  ];

  const currentFile =
    selectedFile || (allFiles.length > 0 ? allFiles[0] : null);

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || isCommitting) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      await commitGitChanges(commitMessage.trim());
      setCommitMessage("");
      setCommitSuccess(true);
      setTimeout(() => setCommitSuccess(false), 2000);
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCommitting(false);
    }
  };

  const getStatusBadge = (status: GitFileChange["status"]) => {
    switch (status) {
      case "added":
        return <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">A</span>;
      case "deleted":
        return <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-mono bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium">D</span>;
      case "renamed":
        return <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">R</span>;
      default:
        return <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">M</span>;
    }
  };

  return (
    <div className="flex h-full bg-background select-none text-xs">
      {/* Left Pane: Files & Commit Box */}
      <div className="w-72 border-r border-border bg-sidebar/30 flex flex-col h-full shrink-0">
        {/* Status Header */}
        <div className="h-9 px-3 border-b border-border flex items-center justify-between bg-muted/20">
          <PressButton onPress={() => { setShowBranches((value) => !value); if (!showBranches && sourceClient && gitCwd) void sourceClient.getBranchSuggestions({ cwd: gitCwd, limit: 100 }).then(setBranches).catch((error) => setCommitError(String(error))); }} className="flex min-w-0 items-center gap-1.5 text-foreground font-medium truncate hover:text-primary" title={t("Changer de branche")}>
            <GitBranch className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="truncate">{gitStatus?.branch || "main"}</span>
            {gitStatus?.ahead !== undefined && gitStatus.ahead > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center">
                <ArrowUp className="w-2.5 h-2.5" />
                {gitStatus.ahead}
              </span>
            )}
            {gitStatus?.behind !== undefined && gitStatus.behind > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center">
                <ArrowDown className="w-2.5 h-2.5" />
                {gitStatus.behind}
              </span>
            )}
          </PressButton>

          <PressButton
            onPress={() => refreshGitStatus()}
            className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            title="Actualiser l'état git"
          >
            <RefreshCw className="w-3 h-3" />
          </PressButton>
        </div>

        {showBranches && <div className="max-h-40 overflow-y-auto border-b border-border p-1">
          <p className="px-2 py-1 text-[10px] uppercase text-muted-foreground">{t("Branches")}</p>
          {branches.map((branch) => <PressButton key={branch} onPress={() => void runGit("switch", branch)} className="block w-full truncate rounded-md px-2 py-1.5 text-left font-mono hover:bg-muted">{branch}</PressButton>)}
        </div>}
        {commitError && <p role="alert" className="border-b border-border px-3 py-2 text-destructive">{commitError}</p>}

        <div className="flex gap-1 border-b border-border p-1">
          <PressButton onPress={() => setView("changes")} className={`flex-1 rounded-md px-2 py-1.5 ${view === "changes" ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>{t("Modifications")} ({allFiles.length})</PressButton>
          <PressButton onPress={() => { setView("history"); void loadHistory(); }} className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 ${view === "history" ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}><History className="h-3.5 w-3.5" />{t("Historique")}</PressButton>
        </div>

        {/* Changed Files List */}
        <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
          {view === "history" ? (commits.length ? commits.map((commit) => <div key={commit.sha} className="border-b border-border/60 p-2">
            <PressButton onPress={() => { setSelectedCommit(commit); setCommitFile(null); }} className="w-full text-left">
              <span className="block truncate font-medium">{commit.subject}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{commit.shortSha} · {commit.authorName} · {new Date(commit.authorDate).toLocaleDateString()}</span>
            </PressButton>
            {selectedCommit?.sha === commit.sha && commit.files.map((file) => <PressButton key={file.path} onPress={() => void selectCommitFile(commit, file.path)} className="mt-1 block w-full truncate rounded-md px-2 py-1 text-left font-mono text-muted-foreground hover:bg-muted" title={file.path}>{file.path}</PressButton>)}
          </div>) : <p className="p-4 text-center text-muted-foreground">{t("Aucun commit récent")}</p>) : allFiles.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground space-y-1">
              <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-500 opacity-60" />
              <p className="font-medium text-[11px]">Aucun changement en cours</p>
              <p className="text-[10px] text-muted-foreground/80">Rien à valider</p>
            </div>
          ) : (
            allFiles.map((file) => {
              const isSelected = currentFile?.path === file.path;
              return (
                <div key={file.path} className="group flex min-w-0 items-center">
                <PressButton
                  onPress={() => setSelectedFile(file)}
                  className={`min-w-0 flex-1 flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-accent text-accent-foreground font-medium shadow-2xs"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {getStatusBadge(file.status)}
                    <span className="truncate font-mono text-[11px]">{file.path}</span>
                  </div>

                  {(file.insertions !== undefined || file.deletions !== undefined) && (
                    <div className="flex items-center gap-1 text-[10px] shrink-0 ml-1 font-mono">
                      {file.insertions ? (
                        <span className="text-emerald-600 dark:text-emerald-400">+{file.insertions}</span>
                      ) : null}
                      {file.deletions ? (
                        <span className="text-rose-600 dark:text-rose-400">-{file.deletions}</span>
                      ) : null}
                    </div>
                  )}
                </PressButton>
                <PressButton onPress={() => void runGit("discard", file.path)} className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" title={t("Annuler les modifications")} aria-label={`${t("Annuler les modifications")} ${file.path}`}><RotateCcw className="h-3.5 w-3.5" /></PressButton>
                </div>
              );
            })
          )}
        </div>

        {/* Commit Input Box */}
        {view === "changes" && allFiles.length > 0 && (
          <form onSubmit={handleCommit} className="p-2 border-t border-border bg-card space-y-1.5">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Message de commit (ex. feat: ajouter l'écran X)…"
              className="w-full px-2.5 py-1.5 text-xs rounded-md bg-background border border-border focus:outline-hidden focus:ring-1 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">{t("Le commit inclut tous les changements. Paseo ne propose pas le staging fichier par fichier.")}</p>

            {commitError && (
              <p className="text-[10px] text-destructive font-mono truncate">{commitError}</p>
            )}

            {suggestCommitMessage && (
              <PressButton
                type="button"
                onPress={() => void suggestCommitMessage().catch((error) => setCommitError(error instanceof Error ? error.message : String(error)))}
                className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                Demander un message à l’agent
              </PressButton>
            )}

            <PressButton
              type="submit"
              disabled={!commitMessage.trim() || isCommitting}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                commitMessage.trim() && !isCommitting
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
              }`}
            >
              {commitSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Validé !</span>
                </>
              ) : (
                <>
                  <GitCommit className="w-3.5 h-3.5" />
                  <span>{isCommitting ? "Commit en cours…" : "Valider les changements"}</span>
                </>
              )}
            </PressButton>
          </form>
        )}
        {gitStatus?.hasGithubRemote && <div className="border-t border-border p-2">
          <p className="mb-1 truncate font-mono text-[10px] text-muted-foreground">GitHub · {githubRemoteLabel(gitStatus.remoteUrl) || "origin"}</p>
          <div className="grid grid-cols-4 gap-1">{(["pull", "sync", "push", "pr"] as const).map((action) => <PressButton key={action} onPress={() => void runGit(action)} disabled={busy} className="flex items-center justify-center gap-1 rounded-md border border-border px-1 py-1.5 hover:bg-muted disabled:opacity-50">{action === "pr" ? <GitPullRequest className="h-3 w-3" /> : action === "pull" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}{t(action === "pull" ? "Pull" : action === "sync" ? "Sync" : action === "push" ? "Push" : "Créer une PR")}</PressButton>)}</div>
        </div>}
      </div>

      {/* Right Pane: Diff View */}
      <div className="flex-1 overflow-y-auto p-3 bg-background">
        {(view === "changes" ? currentFile : commitFile) ? (
          <DiffViewer
            filePath={(view === "changes" ? currentFile : commitFile)!.path}
            diffText={(view === "changes" ? currentFile : commitFile)!.diff}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-1">
              <FileCode className="w-8 h-8 mx-auto opacity-30" />
              <p className="text-xs">Choisis un fichier pour voir son diff</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
