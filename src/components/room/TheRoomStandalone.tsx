import { useEffect } from "react";
import { ArrowLeft, Boxes } from "lucide-react";
import { useMode } from "../../context/ModeContext";
import { useRoom } from "../../context/RoomContext";
import { PressButton } from "../ui/button";
import { TheRoomCanvas } from "./TheRoomCanvas";
import { ErrorBoundary } from "../ui/error-boundary";

export function TheRoomStandalone() {
  const { mode, setMode } = useMode();
  const { agents, statusOf } = useRoom();
  const activeCount = agents.filter((agent) => statusOf(agent) !== "idle").length;

  useEffect(() => {
    if (mode !== "the-room") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      const escape = event.key === "Escape" && !event.metaKey && !event.ctrlKey && !event.altKey;
      const shortcut = (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLocaleLowerCase() === "r";
      if ((!escape && !shortcut) || isEditing || event.defaultPrevented) return;
      event.preventDefault();
      setMode("openspace");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, setMode]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-background" aria-label="ROOM, simulateur visuel d’agents IA">
      <header data-tauri-drag-region className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-3 sm:px-4">
        <PressButton
          onPress={() => setMode("openspace")}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border/70 bg-muted/35 px-2.5 text-[11px] font-medium text-muted-foreground hover:border-foreground/30 hover:bg-muted hover:text-foreground"
          aria-label="Retour à Open Space"
          title="Retour à Open Space (Échap ou ⌘⇧R)"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Open Space
        </PressButton>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-muted/35 text-foreground">
            <Boxes className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xs font-semibold text-foreground">ROOM</h1>
            <p className="hidden truncate font-mono text-[9px] text-muted-foreground sm:block">Simulateur visuel d’agents IA · états Paseo en direct</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[9px] text-muted-foreground" title={`${activeCount} agent${activeCount === 1 ? "" : "s"} actif${activeCount === 1 ? "" : "s"} dans The Room`}>
          <span className={activeCount > 0 ? "h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" : "h-1.5 w-1.5 rounded-full bg-muted-foreground/40"} />
          {activeCount} actif{activeCount === 1 ? "" : "s"}
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {/* Boundary dédiée : un crash du Canvas ne doit jamais emporter Open Space. */}
        <ErrorBoundary resetKey={mode}>
          <TheRoomCanvas active={mode === "the-room"} />
        </ErrorBoundary>
      </div>
    </section>
  );
}
