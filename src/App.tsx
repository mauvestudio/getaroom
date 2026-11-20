import React, { useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { I18nProvider } from "./i18n/I18nContext";
import { PaseoProvider } from "./context/PaseoContext";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import { AppShell } from "./components/layout/AppShell";
import { WorkspaceTabsRow } from "./components/layout/WorkspaceTabsRow";
import { ChatTimeline } from "./components/chat/ChatTimeline";
import { TerminalView } from "./components/terminal/TerminalView";
import { WorkspacePanel } from "./components/drawers/WorkspacePanel";
import { PromptComposer } from "./components/composer/PromptComposer";
import { BottomDrawer } from "./components/drawers/BottomDrawer";
import { TooltipProvider } from "./components/ui/tooltip";
import { ErrorBoundary } from "./components/ui/error-boundary";
import { ModeProvider, useMode } from "./context/ModeContext";
import { RoomHome } from "./components/room/RoomHome";
import { AgentSpace } from "./components/room/AgentSpace";
import { RoomProvider, useRoom } from "./context/RoomContext";
import { SessionViewProvider, useSessionView } from "./context/SessionViewContext";
import { OpenSpaceHome } from "./components/openspace/OpenSpaceHome";
import { TheRoomStandalone } from "./components/room/TheRoomStandalone";
import { FileDiff, Files, Terminal } from "lucide-react";
import { PressButton } from "./components/ui/button";
import { Onboarding } from "./components/layout/Onboarding";
import { ProjectProfileSync } from "./components/layout/ProjectProfileSync";
import { ApprovalNotifier, GlobalShortcuts } from "./components/layout/GlobalShortcuts";
import { AttentionClearer } from "./components/layout/AttentionClearer";
import { cn } from "./lib/utils";
import "./index.css";

function RoomMain() {
  const { selectedAgent } = useRoom();
  return selectedAgent ? <AgentSpace agent={selectedAgent} /> : <RoomHome />;
}

const PANEL_WIDTH_KEY = "getaroom-right-panel-width";
const PANEL_DEFAULT_WIDTH = 440;
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 760;
const clampPanelWidth = (value: number) => Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, value));

function WorkspaceMain() {
  const [panelWidth, setPanelWidth] = useState(() => {
    const stored = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampPanelWidth(stored) : PANEL_DEFAULT_WIDTH;
  });
  const startPanelResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    let latest = startWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // Le panneau est ancré à droite : tirer vers la gauche l'agrandit.
    const onMove = (move: PointerEvent) => {
      latest = clampPanelWidth(startWidth + startX - move.clientX);
      setPanelWidth(latest);
    };
    const onEnd = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      try { localStorage.setItem(PANEL_WIDTH_KEY, String(latest)); } catch {}
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const [composerPrompt, setComposerPrompt] = useState("");
  const {
    activeTab,
    workspaceTabs,
    createTerminalTab,
    closeTab,
    openChangesTab,
    gitStatus,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
  } = useWorkspace();
  const { mode } = useMode();
  const { viewMode } = useSessionView();

  const handleSelectPrompt = (prompt: string) => {
    setComposerPrompt(prompt);
  };

  if (mode === "openspace" || mode === "the-room") {
    return (
      <AppShell>
        <ErrorBoundary resetKey={mode}>
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            <div
              className={cn(
                "absolute inset-0 flex min-h-0 transition-opacity duration-150",
                mode === "openspace" ? "visible z-10 opacity-100" : "invisible z-0 pointer-events-none opacity-0",
              )}
              aria-hidden={mode !== "openspace"}
            >
              <OpenSpaceHome />
            </div>
            <div
              className={cn(
                "absolute inset-0 flex min-h-0 transition-opacity duration-150",
                mode === "the-room" ? "visible z-10 opacity-100" : "invisible z-0 pointer-events-none opacity-0",
              )}
              aria-hidden={mode !== "the-room"}
            >
              <TheRoomStandalone />
            </div>
          </div>
        </ErrorBoundary>
      </AppShell>
    );
  }

  if (mode === "room") {
    return (
      <AppShell>
        <ErrorBoundary resetKey={mode}>
          <RoomMain />
        </ErrorBoundary>
      </AppShell>
    );
  }

  const isChangesActive = activeTab?.kind === "changes";
  const isAgentActive = !activeTab || activeTab.kind === "agent" || activeTab.kind === "changes";
  const showWorkspacePanel =
    isAgentActive && viewMode === "discussion" && (rightPanelOpen || isChangesActive);
  const showRightRail = isAgentActive && viewMode === "discussion";
  const changedCount =
    (gitStatus?.stagedFiles.length ?? 0) +
    (gitStatus?.unstagedFiles.length ?? 0) +
    (gitStatus?.untrackedFiles.length ?? 0);
  const terminalTabs = workspaceTabs.filter((t) => t.kind === "terminal");
  const isFallbackTerminal =
    activeTab?.kind === "terminal" && !terminalTabs.some((t) => t.targetId === activeTab.targetId);

  return (
    <AppShell drawer={<BottomDrawer />}>
      <ErrorBoundary resetKey={mode}>
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        {/* Workspace Tabs Row */}
        <WorkspaceTabsRow />

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0 flex-col min-h-0 overflow-hidden flex">
            {/* Only render the active terminal. PaseoClient retains output for replay on remount. */}
            {terminalTabs.map((tab) => {
              const isActive =
                activeTab?.kind === "terminal" && activeTab?.targetId === tab.targetId;
              if (!isActive) return null;

              return (
                <div
                  key={tab.id}
                  className="flex-1 w-full h-full min-h-0 overflow-hidden flex flex-col"
                >
                  <TerminalView slot={tab.slot ?? 0} terminalId={tab.targetId} isActive />
                </div>
              );
            })}

            {/* Fallback for in-flight terminal creation */}
            {isFallbackTerminal && activeTab && (
              <div className="flex-1 w-full h-full min-h-0 overflow-hidden flex flex-col">
                <TerminalView
                  slot={activeTab.slot ?? 0}
                  terminalId={activeTab.targetId}
                  isActive={true}
                />
              </div>
            )}

            {/* Agent Tab Content (Chat Timeline or Session Terminal based on viewMode) */}
            {isAgentActive && (
              <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
                <div className={`flex-1 flex-col min-h-0 overflow-hidden ${viewMode === "terminal" ? "hidden" : "flex"}`}>
                  <ChatTimeline onSelectPrompt={handleSelectPrompt} />
                  <PromptComposer initialValue={composerPrompt} />
                </div>
                {viewMode === "terminal" && (
                  terminalTabs[0] ? (
                    <div className="flex-1 w-full h-full min-h-0 overflow-hidden flex flex-col">
                      <TerminalView
                        slot={terminalTabs[0].slot ?? 0}
                        terminalId={terminalTabs[0].targetId}
                        isActive
                      />
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center bg-background">
                      <Terminal className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-semibold text-foreground">Terminal PTY du Workspace</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        Connecte un terminal interactif à ce workspace via le daemon Paseo.
                      </p>
                      <PressButton
                        onPress={() => void createTerminalTab()}
                        className="min-h-10 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground cursor-pointer touch-manipulation"
                      >
                        Ouvrir le terminal
                      </PressButton>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          {/* Panneau Paseo Fichiers / Modifications */}
          {showWorkspacePanel && (
            <aside
              className="relative hidden min-h-0 shrink-0 flex-col border-l border-border/60 bg-background lg:flex"
              style={{ width: panelWidth }}
            >
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionner le panneau latéral"
                title="Glisser pour redimensionner · double clic pour réinitialiser"
                onPointerDown={startPanelResize}
                onDoubleClick={() => { setPanelWidth(PANEL_DEFAULT_WIDTH); try { localStorage.removeItem(PANEL_WIDTH_KEY); } catch {} }}
                className="absolute inset-y-0 -left-1 z-40 w-2 cursor-col-resize border-l border-transparent hover:border-foreground/30"
              />
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <WorkspacePanel
                view={isChangesActive ? "changes" : rightPanelTab}
                onViewChange={(tab) => {
                  setRightPanelTab(tab);
                  setRightPanelOpen(true);
                  if (isChangesActive && activeTab) void closeTab(activeTab);
                }}
                onClose={() => {
                  setRightPanelOpen(false);
                  if (isChangesActive && activeTab) void closeTab(activeTab);
                }}
              />
              </div>
            </aside>
          )}

          {/* Rail latéral droit : accès permanent aux panneaux */}
          {showRightRail && (
            <aside
              aria-label="Panneau latéral"
              className="hidden w-10 shrink-0 flex-col items-center gap-1 border-l border-border/60 bg-background py-2 xl:flex"
            >
              <PressButton
                type="button"
                onPress={() => {
                  setRightPanelTab("files");
                  setRightPanelOpen(true);
                }}
                aria-pressed={rightPanelOpen && rightPanelTab === "files"}
                aria-label="Afficher les fichiers"
                title="Fichiers"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  rightPanelOpen && rightPanelTab === "files"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Files className="h-4 w-4 pointer-events-none" />
              </PressButton>

              <PressButton
                type="button"
                onPress={() => {
                  setRightPanelTab("changes");
                  if (!rightPanelOpen && !isChangesActive) setRightPanelOpen(true);
                  openChangesTab();
                }}
                aria-pressed={isChangesActive}
                aria-label="Afficher les modifications"
                title="Modifications"
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  (isChangesActive || (rightPanelOpen && rightPanelTab === "changes"))
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <FileDiff className="h-4 w-4 pointer-events-none" />
                {changedCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-semibold leading-none text-background">
                    {changedCount > 99 ? "99+" : changedCount}
                  </span>
                )}
              </PressButton>
            </aside>
          )}
        </div>
      </div>
      </ErrorBoundary>
    </AppShell>
  );
}

export function App() {
  return (
    <I18nProvider><ThemeProvider>
      <ModeProvider>
        <PaseoProvider>
          <WorkspaceProvider>
            <RoomProvider>
              <SessionViewProvider>
                <TooltipProvider delayDuration={150}>
                  <WorkspaceMain />
                  <Onboarding />
                  <ProjectProfileSync />
                  <GlobalShortcuts />
                  <ApprovalNotifier />
                  <AttentionClearer />
                </TooltipProvider>
              </SessionViewProvider>
            </RoomProvider>
          </WorkspaceProvider>
        </PaseoProvider>
      </ModeProvider>
    </ThemeProvider></I18nProvider>
  );
}

export default App;
