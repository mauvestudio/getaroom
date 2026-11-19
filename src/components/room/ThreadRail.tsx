import { Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { timeAgo } from "../../lib/time";
import { PressButton, PressTarget } from "../ui/button";
import { StatusDot } from "./LiveBadge";
import type { LiveStatus } from "../../lib/room-status";

export interface ThreadItem {
  id: string;
  title: string;
  at: string | number | null;
  status?: LiveStatus;
}

interface Props {
  items: ThreadItem[];
  activeId: string | null;
  accent: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
  /** `rail` : colonne verticale (bureau) ; `chips` : bandeau défilant (iPhone). */
  layout: "rail" | "chips";
}

export function ThreadRail({ items, activeId, accent, onSelect, onNew, onDelete, layout }: Props) {
  if (layout === "chips") {
    return (
      <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-3 py-2 xl:hidden">
        <PressButton
          onPress={onNew}
          aria-label="Nouveau fil"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground cursor-pointer touch-manipulation"
        >
          <Plus className="h-4 w-4 pointer-events-none" />
        </PressButton>
        {items.map((t) => (
          <PressButton
            key={t.id}
            onPress={() => onSelect(t.id)}
            className={cn(
              "flex h-9 max-w-[200px] shrink-0 items-center gap-2 rounded-full px-3 text-xs font-medium cursor-pointer touch-manipulation",
              t.id === activeId ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
            )}
          >
            {t.status && t.status !== "idle" && <StatusDot status={t.status} accent={accent} />}
            <span className="truncate">{t.title}</span>
          </PressButton>
        ))}
      </div>
    );
  }
  return (
    <nav aria-label="Fils de conversation" className="hidden w-60 shrink-0 flex-col border-r border-border xl:flex">
      <div className="flex h-11 items-center justify-between px-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fils</span>
        <PressButton
          onPress={onNew}
          aria-label="Nouveau fil"
          className="flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 pointer-events-none" /> Nouveau
        </PressButton>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {items.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">Aucun fil. Commence-en un.</li>}
        {items.map((t) => (
          <li key={t.id} className="group relative">
            <PressTarget
              onPress={() => onSelect(t.id)}
              className={cn(
                "cursor-pointer rounded-lg px-2.5 py-2 transition-colors touch-manipulation",
                t.id === activeId ? "bg-accent/60" : "hover:bg-accent/40",
              )}
            >
              <span className="flex items-center gap-2">
                {t.status && t.status !== "idle" && <StatusDot status={t.status} accent={accent} />}
                <span className="truncate text-sm font-medium text-foreground">{t.title}</span>
              </span>
              <span className="block text-[11px] text-muted-foreground">{timeAgo(t.at)}</span>
            </PressTarget>
            {onDelete && (
              <PressButton
                onPress={() => onDelete(t.id)}
                aria-label="Supprimer ce fil"
                className="absolute right-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive group-hover:flex cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5 pointer-events-none" />
              </PressButton>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
