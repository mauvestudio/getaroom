import React, { useMemo, useState } from "react";
import { VisualHistoryButton } from "../chat/VisualHistoryButton";
import { Code2, ChevronDown, GitCommit, LoaderCircle, Menu, PanelRight, Play } from "lucide-react";
import { useSessionView } from "../../context/SessionViewContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { usePaseo } from "../../context/PaseoContext";
import { cn } from "../../lib/utils";
import { resolveActiveProjectWorktree } from "./project-worktree-utils";
import { resolveWorkspacePath } from "../../lib/resolve-workspace-path";
import { PressButton } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

interface TopRailProps {
  onToggleSidebar?: () => void;
}

export function TopRail({ onToggleSidebar }: TopRailProps) {
  const {
    activeAgent,
    activeWorkspace,
    projects,
    workspaces,
    scripts,
    startWorkspaceScript,
    openChangesTab,
    commitGitChanges,
    refreshGitStatus,
    gitStatus,
    activeTab,
    rightPanelOpen,
    toggleRightPanel,
  } = useWorkspace();
  const { viewMode } = useSessionView();
  const panelAvailable = Boolean(activeAgent) && viewMode === "discussion";
  const panelExpanded = rightPanelOpen || activeTab?.kind === "changes";
  const { client } = usePaseo();
  const [commitOpen, setCommitOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitError, setCommitError] = useState("");
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitAndPush, setCommitAndPush] = useState(false);
  const [commitFeedback, setCommitFeedback] = useState("");
  const [pendingScript, setPendingScript] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState("");

  const { projectName, isWorktree, worktreeLabel } = useMemo(
    () => resolveActiveProjectWorktree({ activeAgent, activeWorkspace, projects, workspaces }),
    [activeAgent, activeWorkspace, projects, workspaces],
  );
  const changedCount =
    (gitStatus?.stagedFiles.length ?? 0) +
    (gitStatus?.unstagedFiles.length ?? 0) +
    (gitStatus?.untrackedFiles.length ?? 0);

  const openEditor = () => {
    const path = activeWorkspace?.path;
    if (!path) return;
    window.open(`vscode://file${encodeURI(path)}`, "_blank", "noopener,noreferrer");
  };

  const launchScript = async (scriptName: string) => {
    setScriptError("");
    setPendingScript(scriptName);
    try {
      const result = await startWorkspaceScript(scriptName);
      if (result.error) setScriptError(result.error);
    } finally {
      setPendingScript(null);
    }
  };

  const submitCommit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = commitMessage.trim();
    if (!message || commitBusy) return;
    setCommitBusy(true);
    setCommitError("");
    try {
      await commitGitChanges(message);
      if (commitAndPush && activeWorkspace?.path && gitStatus?.hasRemote) {
        const cwd = await resolveWorkspacePath(activeWorkspace.path);
        const pushResult = await client.checkoutPush(cwd) as { success?: boolean; error?: string | { message?: string }; stderr?: string };
        const pushError = typeof pushResult.error === "string" ? pushResult.error : pushResult.error?.message;
        if (pushResult.success === false || pushError) {
          throw new Error(pushError || pushResult.stderr?.trim() || "Commit créé, mais le push a échoué.");
        }
      }
      await refreshGitStatus();
      setCommitOpen(false);
      setCommitMessage("");
      setCommitFeedback(commitAndPush ? "Commit et push réussis" : "Commit réussi");
      window.setTimeout(() => setCommitFeedback(""), 3000);
    } catch (error) {
      setCommitError(error instanceof Error ? error.message : String(error));
    } finally {
      setCommitBusy(false);
    }
  };

  const breadcrumb = [
    projectName || activeWorkspace?.name,
    isWorktree ? worktreeLabel : null,
    activeAgent?.title || activeAgent?.name || (activeWorkspace ? "Nouvelle session" : "Espace de travail"),
  ].filter(Boolean);

  return (
    <header
      data-tauri-drag-region
      style={{ paddingTop: "var(--safe-area-top, 0px)" }}
      className="flex min-h-10 shrink-0 items-center justify-between gap-3 overflow-hidden border-b border-border/60 bg-background px-2 text-xs sm:min-h-11 sm:px-3.5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {onToggleSidebar && (
          <PressButton
            type="button"
            onPress={onToggleSidebar}
            className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
            title="Ouvrir le menu des sessions"
            aria-label="Ouvrir le menu des sessions"
          >
            <Menu className="h-4 w-4 pointer-events-none" />
          </PressButton>
        )}
        <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-1.5 truncate text-muted-foreground">
          {breadcrumb.map((part, index) => (
            <React.Fragment key={`${part}-${index}`}>
              {index > 0 && <span aria-hidden="true" className="text-muted-foreground/50">/</span>}
              <span className={cn("truncate", index === breadcrumb.length - 1 && "font-medium text-foreground")} title={part || undefined}>
                {part}
              </span>
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <VisualHistoryButton />
        <Popover>
          <PopoverTrigger asChild>
            <PressButton
              type="button"
              disabled={!activeWorkspace || scripts.length === 0 || pendingScript !== null}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-card px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
              title="Lancer un script de l’espace de travail"
            >
              {pendingScript ? <LoaderCircle className="h-3.5 w-3.5 animate-spin pointer-events-none" /> : <Play className="h-3.5 w-3.5 pointer-events-none" />}
              <span className="hidden sm:inline">Lancer</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground pointer-events-none" />
            </PressButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-1.5">
            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Scripts de l’espace de travail</div>
            {scripts.map((script) => (
              <PressButton
                key={script.scriptName}
                type="button"
                disabled={pendingScript !== null}
                onPress={() => void launchScript(script.scriptName)}
                className="flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-foreground hover:bg-accent disabled:opacity-50"
              >
                <Play className="h-3 w-3 shrink-0 text-muted-foreground pointer-events-none" />
                <span className="min-w-0 flex-1 truncate">{script.scriptName}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{script.lifecycle === "running" ? "En cours" : "Arrêté"}</span>
              </PressButton>
            ))}
            {scripts.length === 0 && <p className="px-2.5 py-3 text-xs text-muted-foreground">Aucun script disponible.</p>}
            {scriptError && <p role="alert" className="px-2.5 py-2 text-[11px] text-destructive">{scriptError}</p>}
          </PopoverContent>
        </Popover>

        <PressButton
          type="button"
          onPress={openEditor}
          disabled={!activeWorkspace?.path}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-card px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          title="Ouvrir le projet dans Visual Studio Code"
        >
          <Code2 className="h-3.5 w-3.5 pointer-events-none" />
          <span className="hidden sm:inline">Éditeur</span>
        </PressButton>
        {commitFeedback && <span role="status" className="hidden max-w-40 truncate text-[11px] text-muted-foreground xl:inline">{commitFeedback}</span>}

        <PressButton
          type="button"
          onPress={() => { setCommitError(""); setCommitOpen(true); }}
          disabled={!activeWorkspace || !gitStatus?.isGitRepo || changedCount === 0}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-card px-2 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          title="Créer un commit"
        >
          <GitCommit className="h-3.5 w-3.5 pointer-events-none" />
          <span className="hidden sm:inline">Committer</span>
        </PressButton>

        {panelAvailable && (
          <PressButton
            type="button"
            onPress={toggleRightPanel}
            aria-pressed={panelExpanded}
            aria-label={panelExpanded ? "Masquer le panneau latéral" : "Afficher le panneau latéral"}
            title={panelExpanded ? "Masquer le panneau latéral (⌘E)" : "Afficher le panneau latéral (⌘E)"}
            className={cn(
              "hidden h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground lg:flex",
              panelExpanded ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <PanelRight className="h-4 w-4 pointer-events-none" />
          </PressButton>
        )}
      </div>

      <Dialog open={commitOpen} onOpenChange={setCommitOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Créer un commit</DialogTitle>
            <DialogDescription>Les changements préparés dans ce dépôt seront commités localement.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submitCommit(event)} className="space-y-3">
            <Input autoFocus value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="Message du commit" />
            {gitStatus?.hasRemote && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={commitAndPush} onChange={(event) => setCommitAndPush(event.target.checked)} />
                Commit &amp; Push
              </label>
            )}
            {commitError && <p role="alert" className="text-xs text-destructive">{commitError}</p>}
            <DialogFooter>
              <PressButton type="button" onPress={() => setCommitOpen(false)} className="min-h-9 rounded-lg border border-border px-3 text-xs">Annuler</PressButton>
              <PressButton type="submit" disabled={!commitMessage.trim() || commitBusy} className="min-h-9 rounded-lg bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">
                {commitBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : commitAndPush ? "Commit & Push" : "Committer"}
              </PressButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  );
}
