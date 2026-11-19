import { MessageSquare, Terminal } from "lucide-react";
import { useSessionView } from "../../context/SessionViewContext";
import { PressButton } from "../ui/button";
import { cn } from "../../lib/utils";

interface Props {
  className?: string;
}

export function SessionViewSwitch({ className }: Props) {
  const { viewMode, setViewMode } = useSessionView();

  return (
    <div
      role="group"
      aria-label="Mode d'affichage de session"
      className={cn(
        "inline-flex items-center rounded-lg bg-muted p-0.5 border border-border/60 select-none",
        className,
      )}
    >
      <PressButton
        onPress={() => setViewMode("discussion")}
        aria-pressed={viewMode === "discussion"}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors duration-150 touch-manipulation",
          viewMode === "discussion"
            ? "bg-background text-foreground shadow-2xs font-semibold"
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
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors duration-150 touch-manipulation",
          viewMode === "terminal"
            ? "bg-background text-foreground shadow-2xs font-semibold"
            : "text-muted-foreground hover:text-foreground",
        )}
        title="Vue Terminal (⌘`)"
      >
        <Terminal className="w-3.5 h-3.5 pointer-events-none shrink-0" />
        <span className="hidden sm:inline">Terminal</span>
      </PressButton>
    </div>
  );
}
