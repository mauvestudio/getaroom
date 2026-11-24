import React, { useState } from "react";
import { GitCommit, Plus, Sparkles, Terminal, X } from "lucide-react";
import { useWorkspace, type WorkspaceTabItem } from "../../context/WorkspaceContext";
import { sessionVisual } from "../../lib/session-visual";
import { cn } from "../../lib/utils";
import { PressButton, PressTarget } from "../ui/button";
import { SessionStatusIcon } from "../ui/SessionStatusIcon";

// Mêmes mesures que les onglets desktop de Paseo : puce de 28 px, 14 px de texte,
// fond surface2 si active, surface1 au survol, bouton fermer en surimpression.
const TAB_BASE = "group relative flex h-7 min-w-16 max-w-40 shrink items-center gap-1 rounded-[6px] px-2 text-sm font-normal select-none cursor-pointer touch-manipulation transition-colors";
const ACTION = "flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-[var(--surface-1)] hover:text-foreground cursor-pointer touch-manipulation";

export function WorkspaceTabsRow() {
  const {
    workspaceTabs,
    activeTab,
    isNewSessionDraft,
    setActiveTab,
    closeTab,
    createAgentTab,
    createTerminalTab,
    openChangesTab,
    renameTab,
    gitStatus,
    allAgents,
    pendingPermissions,
  } = useWorkspace();

  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");

  const changedFilesCount =
    (gitStatus?.stagedFiles?.length || 0) + (gitStatus?.unstagedFiles?.length || 0);

  const startRename = (tab: WorkspaceTabItem) => {
    if (tab.kind === "changes") return;
    setRenamingTabId(tab.id);
    setRenamingTitle(tab.title);
  };

  const handleSaveRename = (tab: WorkspaceTabItem) => {
    if (renamingTabId !== tab.id) return;
    const trimmed = renamingTitle.trim();
    if (trimmed && trimmed !== tab.title) {
      renameTab(tab, trimmed);
    }
    setRenamingTabId(null);
  };

  return (
    <div
      data-tauri-drag-region
      className="z-10 flex h-9 min-w-0 shrink-0 items-center overflow-hidden border-b border-border bg-[var(--surface-0)] select-none"
    >
      <div className="flex h-full min-w-0 flex-1 items-center overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isNewSessionDraft && (
          <div aria-current="page" className={cn(TAB_BASE, "mx-0.5 bg-[var(--surface-2)] text-foreground")}>
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">Nouvelle session</span>
          </div>
        )}
        {workspaceTabs.map((tab) => {
          const isActive = activeTab?.kind === tab.kind && activeTab?.targetId === tab.targetId;
          const isEditing = renamingTabId === tab.id;
          const iconClass = "h-3.5 w-3.5 shrink-0";

          return (
            <PressTarget
              key={tab.id}
              onPress={() => setActiveTab(tab)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                startRename(tab);
              }}
              aria-current={isActive ? "page" : undefined}
              title={tab.title}
              className={cn(
                TAB_BASE,
                "mx-0.5",
                isActive
                  ? "bg-[var(--surface-2)] text-foreground"
                  : "text-muted-foreground hover:bg-[var(--surface-1)]",
              )}
            >
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {tab.kind === "agent" ? (
                  <SessionStatusIcon
                    state={sessionVisual(
                      allAgents.find((agent) => agent.id === tab.targetId) ?? (tab.status === "running" ? { status: "running" } : null),
                      pendingPermissions.some((entry) => entry.agentId === tab.targetId),
                    )}
                    idle={<Sparkles className={iconClass} />}
                  />
                ) : tab.kind === "terminal" ? (
                  <Terminal className={iconClass} />
                ) : (
                  <GitCommit className={iconClass} />
                )}
              </span>

              {isEditing ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSaveRename(tab);
                  }}
                  className="min-w-0 flex-1"
                >
                  <input
                    type="text"
                    value={renamingTitle}
                    onChange={(event) => setRenamingTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setRenamingTabId(null);
                    }}
                    onBlur={() => handleSaveRename(tab)}
                    className="h-5 w-full rounded border border-ring bg-background px-1 text-xs text-foreground outline-none"
                    autoFocus
                  />
                </form>
              ) : (
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
              )}

              {!isEditing && (
                <span
                  className={cn(
                    "pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end rounded-r-[6px] pr-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                    isActive
                      ? "bg-gradient-to-r from-transparent via-[var(--surface-2)] to-[var(--surface-2)]"
                      : "bg-gradient-to-r from-transparent via-[var(--surface-1)] to-[var(--surface-1)]",
                  )}
                >
                  <PressButton
                    type="button"
                    onPress={() => {
                      void closeTab(tab);
                    }}
                    className="pointer-events-auto flex h-[18px] w-[18px] items-center justify-center rounded-[2px] text-muted-foreground hover:bg-[var(--surface-3)] hover:text-foreground cursor-pointer"
                    title={`Fermer ${tab.kind === "agent" ? "la session" : tab.kind === "terminal" ? "le terminal" : "les changements"}`}
                    aria-label={`Fermer ${tab.title}`}
                  >
                    <X className="h-3 w-3 pointer-events-none" />
                  </PressButton>
                </span>
              )}
            </PressTarget>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-1 py-1 pr-2">
        <PressButton
          type="button"
          onPress={() => createAgentTab()}
          className={ACTION}
          title="Nouvelle session d'agent"
          aria-label="Nouvelle session d'agent"
        >
          <Plus className="h-3.5 w-3.5 pointer-events-none" />
        </PressButton>

        <PressButton
          type="button"
          onPress={() => createTerminalTab()}
          className={ACTION}
          title="Nouveau terminal"
          aria-label="Nouveau terminal"
        >
          <Terminal className="h-3.5 w-3.5 pointer-events-none" />
        </PressButton>

        {gitStatus?.isGitRepo && (
          <PressButton
            type="button"
            onPress={() => openChangesTab()}
            className={cn(ACTION, "relative", activeTab?.kind === "changes" && "bg-[var(--surface-2)] text-foreground")}
            title="Changements git"
            aria-label="Changements git"
          >
            <GitCommit className="h-3.5 w-3.5 pointer-events-none" />
            {changedFilesCount > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-foreground" />
            )}
          </PressButton>
        )}
      </div>
    </div>
  );
}
