import { useState } from "react";
import { ChevronDown, Wrench } from "lucide-react";
import type { ToolCallTimelineItem } from "../../lib/paseo/types";
import { ToolCallItem } from "./ToolCallItem";
import { PressButton } from "../ui/button";
import { useI18n } from "../../i18n/I18nContext";

export function ToolActivityGroup({ items }: { items: ToolCallTimelineItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const running = items.some((item) => item.status === "running");
  const failed = items.some((item) => item.status === "failed");
  const commands = items.every((item) => /bash|command|terminal|exec|shell/i.test(item.tool || item.name || ""));
  const activity = commands ? (items.length === 1 ? "commande" : "commandes") : (items.length === 1 ? "action" : "actions");
  const state = running ? "en cours" : failed ? "dont certaines en échec" : items.length === 1 ? "exécutée" : "exécutées";

  return (
    <div className="my-1 max-w-full">
      <PressButton
        onPress={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex max-w-full items-center gap-2 py-1 min-h-[44px] sm:min-h-[32px] text-left text-[12px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Wrench className={`h-3 w-3 shrink-0 ${running ? "text-amber-500 animate-pulse" : failed ? "text-destructive" : ""}`} />
        <span>{items.length} {t(activity)} {t(state)}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </PressButton>
      {expanded && (
        <div className="mt-1 ml-[5px] border-l border-border/50 pl-3">
          {items.map((item) => <ToolCallItem key={item.callId} item={item} />)}
        </div>
      )}
    </div>
  );
}
