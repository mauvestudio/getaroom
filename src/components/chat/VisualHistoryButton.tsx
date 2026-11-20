import { ListTree } from "lucide-react";
import { useVisualHistory } from "../../lib/visual-history";
import { cn } from "../../lib/utils";
import { PressButton } from "../ui/button";

/** Affiche / masque l'historique visuel (mini-timeline des messages) à gauche de la conversation. */
export function VisualHistoryButton({ className }: { className?: string }) {
  const [enabled, toggle] = useVisualHistory();
  return (
    <PressButton
      type="button"
      onPress={toggle}
      aria-pressed={enabled}
      aria-label="Historique visuel"
      title={enabled ? "Masquer l’historique visuel" : "Afficher l’historique visuel"}
      className={cn(
        "hidden h-7 w-7 items-center justify-center rounded-md transition-colors md:flex",
        enabled ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <ListTree className="h-3.5 w-3.5 pointer-events-none" />
    </PressButton>
  );
}
