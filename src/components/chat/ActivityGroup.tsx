import { ChevronDown, Sparkles, Wrench } from "lucide-react";
import type { ActivityEntry } from "../../lib/chat-nodes";
import { formatDuration, summarizeActivity } from "../../lib/chat-nodes";
import { useI18n } from "../../i18n/I18nContext";
import { PressButton } from "../ui/button";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { PaseoShimmerRow } from "./PaseoShimmerRow";
import { PaseoSyncedLoader } from "./PaseoSyncedLoader";
import { ToolCallItem } from "./ToolCallItem";

interface ActivityGroupProps {
  entries: ActivityEntry[];
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Une séquence d'activité de l'agent (réflexions + appels d'outils) sur UNE ligne repliable, comme le
 * « toolCallGroup » de Paseo : le résumé compte les actions, et le détail (dans l'ordre) s'ouvre au clic.
 */
export function ActivityGroup({ entries, expanded, onToggle }: ActivityGroupProps) {
  const { t } = useI18n();
  const summary = summarizeActivity(entries);
  const tools = summary.toolCalls;
  const hasThoughts = entries.some((entry) => entry.kind === "reasoning");
  const thinking = summary.reasoningStreaming;
  const duration = formatDuration(summary.reasoningMs);
  const running = tools.some((item) => item.status === "running");
  const failed = tools.some((item) => item.status === "failed");
  const commands = tools.length > 0 && tools.every((item) => /bash|command|terminal|exec|shell/i.test(item.tool || item.name || ""));
  const activity = commands ? (tools.length === 1 ? "commande" : "commandes") : (tools.length === 1 ? "action" : "actions");
  const state = running ? "en cours" : failed ? "dont certaines en échec" : tools.length === 1 ? "exécutée" : "exécutées";

  return (
    <div className="my-1.5 max-w-full text-xs">
      <PressButton
        type="button"
        onPress={onToggle}
        aria-expanded={expanded}
        className="group/activity flex max-w-full items-center gap-2 py-1.5 min-h-[44px] sm:min-h-[32px] text-left text-[12px] text-muted-foreground transition-colors hover:text-foreground cursor-pointer select-none"
      >
        {tools.length === 0 ? (
          <>
            {thinking ? <PaseoSyncedLoader className="text-foreground" /> : <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
            {thinking ? (
              <PaseoShimmerRow label={t("Réflexion")} secondaryLabel={duration ?? undefined} labelClassName="text-[12px]" secondaryClassName="text-[11px] font-mono text-muted-foreground/50" />
            ) : (
              <>
                <span>{t("Raisonnement")}</span>
                {duration && <span className="font-mono text-[11px] text-muted-foreground/50">{duration}</span>}
              </>
            )}
          </>
        ) : (
          <>
            {thinking ? <PaseoSyncedLoader className="text-foreground" /> : <Wrench className={`h-3 w-3 shrink-0 ${running ? "text-amber-500 animate-pulse" : failed ? "text-destructive" : ""}`} />}
            <span>{tools.length} {t(activity)} {t(state)}</span>
            {hasThoughts && <span className="font-mono text-[11px] text-muted-foreground/50">· {t(thinking ? "réflexion" : "raisonnement")}{duration ? ` ${duration}` : ""}</span>}
          </>
        )}
        <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </PressButton>

      {expanded && (
        <div className="mt-1 ml-[5px] space-y-1 border-l border-border/50 pl-3">
          {entries.map((entry, index) => entry.kind === "tool" ? (
            <ToolCallItem key={entry.item.callId} item={entry.item} />
          ) : (
            <div key={`thought-${index}`} className="max-h-80 min-w-0 overflow-y-auto overflow-x-hidden py-1 text-[13px] leading-6 text-muted-foreground">
              {entry.item.text?.trim()
                ? <MarkdownRenderer content={entry.item.text} variant="thought" />
                : <span className="italic">{t("Aucun détail de raisonnement disponible.")}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
