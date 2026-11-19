import { LayoutGrid } from "lucide-react";
import { useRoom } from "../../context/RoomContext";
import { useMode } from "../../context/ModeContext";
import { STATUS_LABEL } from "../../lib/room-status";
import { cn } from "../../lib/utils";
import { ScrollArea } from "../ui/scroll-area";
import { PressTarget } from "../ui/button";
import { StatusDot } from "./LiveBadge";
import { HermesStatusBadge } from "../ui/HermesStatusBadge";
import type { CSSProperties } from "react";

/** Liste des agents dans la barre latérale (mode ROOM), avec accès Open Space en tête. */
export function RoomAgentList({ onSelect }: { onSelect?: () => void }) {
  const { agents, loadError, selectedAgentId, openAgent, statusOf } = useRoom();
  const { mode, setMode } = useMode();
  const isOpenSpace = mode === "openspace";
  const row = "flex items-center gap-3 rounded-xl px-2.5 py-2 cursor-pointer touch-manipulation transition-colors";

  return (
    <ScrollArea className="flex-1 h-full min-h-0" viewportClassName="py-3 px-2">
      {/* Bouton Open Space en haut de la barre latérale */}
      <PressTarget
        onPress={() => {
          setMode("openspace");
          onSelect?.();
        }}
        className={cn(
          row,
          "mb-3 border",
          isOpenSpace
            ? "border-sidebar-room-edge bg-sidebar-room-active text-foreground font-semibold shadow-xs"
            : "border-border/60 bg-card/60 hover:bg-accent/60 text-foreground",
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            isOpenSpace ? "bg-sidebar-room-edge/15 text-sidebar-room-edge" : "bg-muted text-muted-foreground",
          )}
        >
          <LayoutGrid className="h-4 w-4 pointer-events-none" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-xs font-bold tracking-tight">Open Space</span>
          <span
            className={cn(
              "block text-[10px] lowercase",
              isOpenSpace ? "text-foreground/75" : "text-muted-foreground",
            )}
          >
            tour de contrôle
          </span>
        </div>
      </PressTarget>

      <div className="px-1.5 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Agents
      </div>
      {loadError && <p className="px-2 text-xs text-destructive">Impossible de charger les agents : {loadError}</p>}
      <ul className="space-y-1">
        {agents.map((a) => {
          const st = statusOf(a);
          const isSelected = mode === "room" && selectedAgentId === a.id;
          return (
            <li key={a.id}>
              <PressTarget
                onPress={() => {
                  setMode("room");
                  openAgent(a.id);
                  onSelect?.();
                }}
                className={cn(row, "room-agent-glass", isSelected && "font-medium")}
                data-selected={isSelected}
                style={{ "--agent-accent": a.accentColor } as CSSProperties}
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-end justify-center overflow-hidden rounded-xl"
                  style={{ backgroundColor: `${a.accentColor}26` }}
                >
                  <img src={a.avatarUrl} alt="" className="h-11 w-11 pointer-events-none object-contain" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{a.name}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <StatusDot status={st} accent={a.accentColor} />
                    <span className={cn(st === "approval" && "font-medium text-amber-600 dark:text-amber-400")}>
                      {STATUS_LABEL[st]}
                    </span>
                  </span>
                  <HermesStatusBadge providerId={a.paseo.provider} providerLabel={a.paseo.providerLabel} compact className="mt-1" />
                </span>
              </PressTarget>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
