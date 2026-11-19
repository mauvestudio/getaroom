import React from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { cn } from "../../lib/utils";
import { StatusBadge } from "./StatusBadge";
import { ContextUsagePill } from "./ContextUsagePill";
import { SessionGitControls } from "./SessionGitControls";
import { SessionViewSwitch } from "../session/SessionViewSwitch";
import {
  Settings,
  LayoutList,
  ListCollapse,
  Plus,
} from "lucide-react";
import { PressButton } from "../ui/button";

interface TopRailProps {
  onOpenSettings: () => void;
  onToggleSidebar?: () => void;
}

export function TopRail({ onOpenSettings }: TopRailProps) {
  const {
    summaryMode,
    setSummaryMode,
    activeWorkspace,
    createSession,
  } = useWorkspace();

  return (
    <header className="h-10 sm:h-11 border-b border-border bg-sidebar/70 backdrop-blur-md px-2 sm:px-3.5 flex items-center justify-between select-none z-20 shrink-0 overflow-hidden">
      {/* Left: Tasks & Services */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <SessionGitControls />
      </div>

      {/* Right: Controls & Badges */}
      <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0">
        {/* Context Window Meter Pill */}
        <ContextUsagePill />

        {/* Contrôle segmenté compact Discussion | Terminal (Cmd+`) */}
        <SessionViewSwitch />

        {/* Status Badge (Prêt / Déconnecté) */}
        <StatusBadge onClick={onOpenSettings} />

        {/* Bouton Nouvelle session */}
        <PressButton
          type="button"
          onPress={() => void createSession(undefined, activeWorkspace?.id)}
          className="h-7 px-2 flex items-center gap-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 cursor-pointer transition-colors touch-manipulation text-xs shrink-0"
          title="Nouvelle session (⌘N)"
          aria-label="Nouvelle session"
        >
          <Plus className="w-3.5 h-3.5 pointer-events-none" />
          <span className="hidden sm:inline">Nouvelle session</span>
        </PressButton>

        {/* Action icons */}
        <div className="flex items-center gap-0.5 border-l border-border/60 pl-1 sm:pl-2">
          <PressButton
            type="button"
            onPress={() => setSummaryMode((prev) => !prev)}
            className={cn(
              "h-7 w-7 flex items-center justify-center rounded-md cursor-pointer transition-colors touch-manipulation",
              summaryMode
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
            title={summaryMode ? "Passer à la vue détaillée" : "Passer à la vue résumée"}
            aria-label={summaryMode ? "Passer à la vue détaillée" : "Passer à la vue résumée"}
          >
            {summaryMode ? (
              <ListCollapse className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            ) : (
              <LayoutList className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            )}
          </PressButton>

          <PressButton
            type="button"
            onPress={onOpenSettings}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors touch-manipulation"
            title="Ouvrir les réglages"
            aria-label="Ouvrir les réglages"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </PressButton>
        </div>
      </div>
    </header>
  );
}
