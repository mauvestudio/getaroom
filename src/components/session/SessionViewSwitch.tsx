import { Boxes, MessageSquare, Terminal } from "lucide-react";
import { useSessionView } from "../../context/SessionViewContext";
import { PressButton } from "../ui/button";
import { cn } from "../../lib/utils";

interface Props {
  className?: string;
  activeAgents?: number;
}

export function SessionViewSwitch({ className, activeAgents = 0 }: Props) {
  const { viewMode, setViewMode } = useSessionView();

  return (
    <div
      role="group"
      aria-label="Mode d'affichage de session"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5 select-none",
        className,
      )}
    >
      <PressButton
        onPress={() => setViewMode("discussion")}
        aria-pressed={viewMode === "discussion"}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 min-h-7 rounded-md text-[11px] font-medium cursor-pointer transition-colors duration-150 touch-manipulation",
          viewMode === "discussion"
            ? "bg-background text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Vue Discussion (⌘`)"
      >
        <MessageSquare className="w-3.5 h-3.5 pointer-events-none shrink-0" />
        <span className="hidden sm:inline">Discussion</span>
      </PressButton>

      <PressButton
        onPress={() => setViewMode("terminal")}
        aria-pressed={viewMode === "terminal"}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 min-h-7 rounded-md text-[11px] font-medium cursor-pointer transition-colors duration-150 touch-manipulation",
          viewMode === "terminal"
            ? "bg-background text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Vue Terminal (⌘`)"
      >
        <Terminal className="w-3.5 h-3.5 pointer-events-none shrink-0" />
        <span className="hidden sm:inline">Terminal</span>
      </PressButton>

      <PressButton
        onPress={() => setViewMode("the-room")}
        aria-pressed={viewMode === "the-room"}
        className={cn(
          "flex min-h-7 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 touch-manipulation",
          viewMode === "the-room"
            ? "bg-background text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Vue isométrique The Room"
      >
        <Boxes className="h-3.5 w-3.5 shrink-0 pointer-events-none" />
        <span className="hidden sm:inline">The Room</span>
        {activeAgents > 0 && <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-[9px] tabular-nums text-foreground">{activeAgents}</span>}
      </PressButton>
    </div>
  );
}
