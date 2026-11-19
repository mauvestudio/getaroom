import { Code2, Users } from "lucide-react";
import { useMode } from "../../context/ModeContext";
import { PressButton } from "../ui/button";
import { cn } from "../../lib/utils";

export function ModeSwitch() {
  const { mode, setMode } = useMode();

  return (
    <div
      role="tablist"
      aria-label="Navigation principale"
      className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted/80 border border-border/60"
    >
      {/* Onglet ROOM */}
      <PressButton
        role="tab"
        aria-selected={mode === "room"}
        onPress={() => setMode("room")}
        className={cn(
          "flex flex-col items-center justify-center text-center gap-0.5 rounded-lg px-2 py-1.5 min-h-12 cursor-pointer transition-all duration-150 touch-manipulation",
          mode === "room"
            ? "bg-sidebar-room-active text-foreground shadow-xs font-semibold border border-sidebar-room-edge/70 ring-1 ring-sidebar-room-edge/25"
            : "text-muted-foreground hover:text-foreground hover:bg-background/40",
        )}
        title="ROOM — tous les agents"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-tight">
          <Users className={cn("w-3.5 h-3.5 pointer-events-none shrink-0", mode === "room" && "text-sidebar-room-edge")} />
          <span>ROOM</span>
        </span>
        <span className="text-[10px] tracking-tight font-normal text-muted-foreground/80 lowercase">tous les agents</span>
      </PressButton>

      {/* Onglet PROJETS */}
      <PressButton
        role="tab"
        aria-selected={mode === "studio"}
        onPress={() => setMode("studio")}
        className={cn(
          "flex flex-col items-center justify-center text-center gap-0.5 rounded-lg px-2 py-1.5 min-h-12 cursor-pointer transition-all duration-150 touch-manipulation",
          mode === "studio"
            ? "bg-sidebar-studio-active text-foreground shadow-xs font-semibold border border-sidebar-studio-edge/70 ring-1 ring-sidebar-studio-edge/25"
            : "text-muted-foreground hover:text-foreground hover:bg-background/40",
        )}
        title="PROJETS — studio et développement"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold tracking-tight">
          <Code2 className={cn("w-3.5 h-3.5 pointer-events-none shrink-0", mode === "studio" && "text-sidebar-studio-edge")} />
          <span>PROJETS</span>
        </span>
        <span className="text-[10px] tracking-tight font-normal text-muted-foreground/80 lowercase">studio et dev</span>
      </PressButton>
    </div>
  );
}
