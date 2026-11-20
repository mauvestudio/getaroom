import { Bot, Code2, LayoutGrid } from "lucide-react";
import { useMode } from "../../context/ModeContext";
import { PressButton } from "../ui/button";
import { cn } from "../../lib/utils";

export function ModeSwitch({ onNavigate }: { onNavigate?: () => void }) {
  const { mode, setMode } = useMode();
  const isRoomMode = mode === "room" || mode === "the-room";

  const chooseMode = (nextMode: "openspace" | "studio" | "room") => {
    setMode(nextMode);
    onNavigate?.();
  };

  return (
    <nav aria-label="Navigation principale" className="grid gap-1.5">
      <PressButton
        type="button"
        role="tab"
        aria-selected={mode === "openspace"}
        onPress={() => chooseMode("openspace")}
        className={cn(
          "flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-semibold tracking-tight transition-all duration-150 touch-manipulation",
          mode === "openspace"
            ? "border-sidebar-openspace-edge/70 bg-background/80 text-foreground shadow-xs ring-1 ring-sidebar-openspace-edge/25"
            : "border-border/70 bg-background/35 text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
        )}
        title="Open Space"
      >
        <LayoutGrid className={cn("h-3.5 w-3.5 shrink-0 pointer-events-none", mode === "openspace" && "text-sidebar-openspace-edge")} />
        <span>Open Space</span>
      </PressButton>

      <div className="grid grid-cols-2 gap-1.5">
        <PressButton
          type="button"
          role="tab"
          aria-selected={mode === "studio"}
          onPress={() => chooseMode("studio")}
          className={cn(
            "flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold tracking-tight transition-all duration-150 touch-manipulation",
            mode === "studio"
              ? "border-sidebar-studio-edge/70 bg-sidebar-studio-active text-foreground shadow-xs ring-1 ring-sidebar-studio-edge/25"
              : "border-border/70 bg-background/35 text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
          )}
          title="Dev"
        >
          <Code2 className="h-3.5 w-3.5 shrink-0 pointer-events-none text-sidebar-studio-edge" />
          <span>Dev</span>
        </PressButton>

        <PressButton
          type="button"
          role="tab"
          aria-selected={isRoomMode}
          onPress={() => chooseMode("room")}
          className={cn(
            "flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold tracking-tight transition-all duration-150 touch-manipulation",
            isRoomMode
              ? "border-sidebar-room-edge/80 bg-sidebar-room-active text-foreground shadow-xs ring-1 ring-sidebar-room-edge/35"
              : "border-border/70 bg-background/35 text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
          )}
          title="Room"
        >
          <Bot className="h-3.5 w-3.5 shrink-0 pointer-events-none text-sidebar-room-edge" />
          <span>Room</span>
        </PressButton>
      </div>
    </nav>
  );
}
