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
    <div className="my-2 max-w-full">
      <PressButton
        onPress={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex max-w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <Wrench className={`h-4 w-4 shrink-0 ${running ? "text-amber-500 animate-pulse" : failed ? "text-destructive" : ""}`} />
        <span>{items.length} {t(activity)} {t(state)}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </PressButton>
      {expanded && <div className="ml-5 border-l border-border/60 pl-3">{items.map((item) => <ToolCallItem key={item.callId} item={item} />)}</div>}
    </div>
  );
}
