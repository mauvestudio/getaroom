import React, { useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { I18nProvider } from "./i18n/I18nContext";
import { PaseoProvider } from "./context/PaseoContext";
import { WorkspaceProvider, useWorkspace } from "./context/WorkspaceContext";
import { AppShell } from "./components/layout/AppShell";
import { WorkspaceTabsRow } from "./components/layout/WorkspaceTabsRow";
import { ChatTimeline } from "./components/chat/ChatTimeline";
import { TerminalView } from "./components/terminal/TerminalView";
import { ChangesDrawer } from "./components/drawers/ChangesDrawer";
import { PromptComposer } from "./components/composer/PromptComposer";
import { BottomDrawer } from "./components/drawers/BottomDrawer";
import { TooltipProvider } from "./components/ui/tooltip";
import { ModeProvider, useMode } from "./context/ModeContext";
import { RoomHome } from "./components/room/RoomHome";
import { AgentSpace } from "./components/room/AgentSpace";
import { RoomProvider, useRoom } from "./context/RoomContext";
import { SessionViewProvider, useSessionView } from "./context/SessionViewContext";
import { OpenSpaceHome } from "./components/openspace/OpenSpaceHome";
import { Terminal } from "lucide-react";
import { PressButton } from "./components/ui/button";
import { Onboarding } from "./components/layout/Onboarding";
import { ProjectProfileSync } from "./components/layout/ProjectProfileSync";
import "./index.css";

function RoomMain() {
  const { selectedAgent } = useRoom();
  return selectedAgent ? <AgentSpace key={selectedAgent.id} agent={selectedAgent} /> : <RoomHome />;
}

function WorkspaceMain() {
  const [composerPrompt, setComposerPrompt] = useState("");
  const { activeTab, workspaceTabs, createTerminalTab } = useWorkspace();
  const { mode } = useMode();
  const { viewMode } = useSessionView();

  const handleSelectPrompt = (prompt: string) => {
    setComposerPrompt(prompt);
  };

  if (mode === "openspace") {
    return (
      <AppShell>
        <OpenSpaceHome />
      </AppShell>
    );
  }

  if (mode === "room") {
    return (
      <AppShell>
        <RoomMain />
      </AppShell>
    );
  }

  const isChangesActive = activeTab?.kind === "changes";
  const isAgentActive = !activeTab || activeTab.kind === "agent";
  const terminalTabs = workspaceTabs.filter((t) => t.kind === "terminal");
  const isFallbackTerminal =
    activeTab?.kind === "terminal" && !terminalTabs.some((t) => t.targetId === activeTab.targetId);

  return (
    <AppShell drawer={<BottomDrawer />}>
      <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
        {/* Workspace Tabs Row */}
        <WorkspaceTabsRow />

        {/* Tab Content */}
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

        {/* Changes Tab */}
        <div
          className={
            isChangesActive
              ? "flex-1 h-full min-h-0 overflow-hidden flex flex-col"
              : "hidden"
          }
        >
          {isChangesActive && <ChangesDrawer />}
        </div>

        {/* Agent Tab Content (Chat Timeline or Session Terminal based on viewMode) */}
        {isAgentActive && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {viewMode === "terminal" ? (
              terminalTabs[0] ? (
                <div className="flex-1 w-full h-full min-h-0 overflow-hidden flex flex-col">
                  <TerminalView
                    slot={terminalTabs[0].slot ?? 0}
                    terminalId={terminalTabs[0].targetId}
                    isActive
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center bg-[#181816] text-[#e5e5df]">
                  <Terminal className="h-8 w-8 text-amber-500" />
                  <p className="text-sm font-semibold">Terminal PTY du Workspace</p>
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
            ) : (
              <>
                <ChatTimeline onSelectPrompt={handleSelectPrompt} />
                <PromptComposer initialValue={composerPrompt} />
              </>
            )}
          </div>
        )}
      </div>
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
