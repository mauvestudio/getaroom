import React, { useState } from "react";
import { ChartNoAxesColumn, Check, Copy, Loader2, Split } from "lucide-react";
import { formatTime } from "../../lib/utils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { AssistantMessageTimelineItem } from "../../lib/paseo/types";
import { PressButton } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

/** Statistiques d'un tour (tokens, coût), comme le « Turn stats » de Paseo. */
export interface TurnMetrics {
  model?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalCostUsd?: number;
}

export interface AssistantTurnFooter {
  durationMs: number | null;
  /** Fork de la conversation à partir de ce message ; absent si indisponible (ex. session d'un hôte distant). */
  onFork?: () => Promise<void>;
  metrics?: TurnMetrics | null;
}

/** « 5s », « 1m 12s », « 1h 3m » (format court du pied de tour de Paseo). */
export function formatTurnDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const numberFormat = new Intl.NumberFormat("fr-FR");

function MetricsList({ metrics }: { metrics: TurnMetrics }) {
  const rows: Array<[string, string]> = [];
  if (metrics.model) rows.push(["Modèle", metrics.model]);
  if (metrics.inputTokens) rows.push(["Tokens en entrée", numberFormat.format(metrics.inputTokens)]);
  if (metrics.cachedInputTokens) rows.push(["Dont en cache", numberFormat.format(metrics.cachedInputTokens)]);
  if (metrics.outputTokens) rows.push(["Tokens en sortie", numberFormat.format(metrics.outputTokens)]);
  if (metrics.totalCostUsd) rows.push(["Coût", `${metrics.totalCostUsd.toFixed(metrics.totalCostUsd < 1 ? 4 : 2)} $`]);
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <React.Fragment key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-mono tabular-nums text-foreground">{value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export function hasMetrics(metrics?: TurnMetrics | null): metrics is TurnMetrics {
  return Boolean(metrics && (metrics.inputTokens || metrics.outputTokens || metrics.totalCostUsd));
}

const FOOTER_ICON =
  "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground cursor-pointer";

export function AssistantMessage({ item, footer }: { item: AssistantMessageTimelineItem; footer?: AssistantTurnFooter }) {
  const [copied, setCopied] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [labelHovered, setLabelHovered] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(item.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleFork = async () => {
    if (!footer?.onFork || forking) return;
    setForking(true);
    setForkError(null);
    try {
      await footer.onFork();
    } catch (err: any) {
      setForkError(err?.message || "Le fork a échoué.");
    } finally {
      setForking(false);
    }
  };

  const durationLabel = footer?.durationMs ? `A travaillé pendant ${formatTurnDuration(footer.durationMs)}` : "";
  const endedLabel = item.timestamp ? formatTime(item.timestamp) : "";
  const timingLabel = durationLabel && labelHovered && endedLabel ? `Terminé à ${endedLabel}` : durationLabel || endedLabel;
  const metrics = hasMetrics(footer?.metrics) ? footer!.metrics! : null;

  return (
    <div className="group relative my-5">
      <div className="min-w-0 max-w-full overflow-hidden text-[15px] leading-7">
        <MarkdownRenderer content={item.text} />
      </div>
      {footer ? (
        // Pied de tour (Paseo) : copier, forker, statistiques, durée — toujours visible.
        <div className="mt-2 flex min-h-6 items-center gap-2 select-none">
          <PressButton onPress={handleCopy} className={FOOTER_ICON} title="Copier le message" aria-label="Copier le message">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </PressButton>
          {footer.onFork && (
            <PressButton
              onPress={() => void handleFork()}
              disabled={forking}
              className={FOOTER_ICON}
              title="Forker la conversation à partir d’ici (nouvelle session)"
              aria-label="Forker la conversation à partir d’ici"
            >
              {forking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Split className="h-3.5 w-3.5 rotate-90" />}
            </PressButton>
          )}
          {metrics && (
            <Popover open={statsOpen} onOpenChange={setStatsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={FOOTER_ICON}
                  title="Statistiques du tour"
                  aria-label="Statistiques du tour"
                  onMouseEnter={() => setStatsOpen(true)}
                  onMouseLeave={() => setStatsOpen(false)}
                >
                  <ChartNoAxesColumn className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" sideOffset={8} className="w-auto min-w-52 p-3">
                <div className="mb-2 text-xs font-medium text-foreground">Statistiques du tour</div>
                <MetricsList metrics={metrics} />
              </PopoverContent>
            </Popover>
          )}
          {timingLabel && (
            <span
              className="text-xs text-muted-foreground"
              onMouseEnter={() => setLabelHovered(true)}
              onMouseLeave={() => setLabelHovered(false)}
            >
              {timingLabel}
            </span>
          )}
          {forkError && <span className="text-xs text-destructive">{forkError}</span>}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2 select-none">
          <PressButton
            onPress={handleCopy}
            className="p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity cursor-pointer"
            title="Copier le message"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </PressButton>
        </div>
      )}
    </div>
  );
}
