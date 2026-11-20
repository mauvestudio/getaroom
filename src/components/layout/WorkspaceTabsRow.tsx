import React, { useState } from "react";
import { useWorkspace, type WorkspaceTabItem } from "../../context/WorkspaceContext";
import { Sparkles, Terminal, GitCommit, X, Loader2, Pencil } from "lucide-react";
import { PressButton, PressTarget } from "../ui/button";

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
      className="h-9 bg-background border-b border-border/60 flex items-center justify-between px-2 gap-1 select-none shrink-0 z-10 overflow-hidden"
    >
      {/* Tabs list */}
      <div className="flex items-center gap-1 min-w-0 flex-1 h-full pt-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isNewSessionDraft && (
          <div aria-current="page" className="flex h-8 min-w-[120px] shrink-0 items-center gap-1.5 border-b-2 border-foreground px-2.5 text-xs font-medium text-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>Nouvelle session</span>
          </div>
        )}
        {workspaceTabs.map((tab) => {
          const isActive =
            activeTab?.kind === tab.kind && activeTab?.targetId === tab.targetId;
          const isEditing = renamingTabId === tab.id;

          return (
            <PressTarget
              key={tab.id}
              onPress={() => setActiveTab(tab)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename(tab);
              }}
              className={`group flex items-center gap-1.5 px-2 h-8 text-xs cursor-pointer transition-colors shrink-0 min-w-[72px] sm:min-w-[60px] max-w-[200px] border-b-2 touch-manipulation ${
                isActive
                  ? "border-foreground text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              title={tab.title}
            >
              {/* Tab Icon & Status */}
              {tab.kind === "agent" ? (
                tab.status === "running" ? (
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin shrink-0" />
                ) : (
                  <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
                )
              ) : tab.kind === "terminal" ? (
                <Terminal className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
              ) : (
                <GitCommit className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
              )}

              {/* Title or Inline Edit Form */}
              {isEditing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveRename(tab);
                  }}
                  className="min-w-0 flex-1"
                >
                  <input
                    type="text"
                    value={renamingTitle}
                    onChange={(e) => setRenamingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setRenamingTabId(null);
                    }}
                    onBlur={() => handleSaveRename(tab)}
                    className="w-full h-5 text-xs bg-background border border-primary rounded px-1 outline-none text-foreground font-medium"
                    autoFocus
                  />
                </form>
              ) : (
                <span className="truncate text-xs min-w-0 flex-1">{tab.title}</span>
              )}

              {/* Actions on hover */}
              {!isEditing && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {tab.kind !== "changes" && (
                    <PressButton
                      type="button"
                      onPress={() => {
                        startRename(tab);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-opacity"
                      title="Renommer l'onglet"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </PressButton>
                  )}

                  <PressButton
                    type="button"
                    onPress={() => {
                      closeTab(tab);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-opacity"
                    title={`Fermer ${tab.kind === "agent" ? "la session" : tab.kind === "terminal" ? "le terminal" : "les changements"}`}
                  >
                    <X className="w-3 h-3" />
                  </PressButton>
                </div>
              )}
            </PressTarget>
          );
        })}
      </div>

      {/* 3 New Tab Action Buttons: Agent, Terminal, Changes */}
      <div className="flex items-center gap-0.5 shrink-0 pl-1 border-l border-border/40 ml-1">
        <PressButton
          type="button"
          onPress={() => createAgentTab()}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors touch-manipulation"
          title="Nouvelle session d'agent"
          aria-label="Nouvelle session d'agent"
        >
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </PressButton>

        <PressButton
          type="button"
          onPress={() => createTerminalTab()}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors touch-manipulation"
          title="Nouveau terminal"
          aria-label="Nouveau terminal"
        >
          <Terminal className="w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </PressButton>

        {gitStatus?.isGitRepo && <PressButton
          type="button"
          onPress={() => openChangesTab()}
          className={`h-7 w-7 flex items-center justify-center rounded-md cursor-pointer transition-colors relative touch-manipulation ${
            activeTab?.kind === "changes"
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
          title="Changements git"
          aria-label="Changements git"
        >
          <GitCommit className="w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          {changedFilesCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-foreground" />
          )}
        </PressButton>}
      </div>
    </div>
  );
}
