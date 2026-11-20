import React from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { resolveContextUsage } from "../../lib/context-usage";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";

const tokenFormatter = new Intl.NumberFormat("fr-FR");

export function ContextUsagePill() {
  const {
    activeAgent,
    models,
    selectedModel,
  } = useWorkspace();

  const usage = activeAgent?.lastUsage || activeAgent?.tokenUsage;
  const { usedTokens, maxTokens, ratio, percentage } = resolveContextUsage(
    activeAgent,
    models,
    selectedModel,
  );

  const tone =
    percentage >= 90
      ? "text-destructive"
      : percentage >= 70
        ? "text-foreground"
        : "text-muted-foreground";

  const size = 16;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Fenêtre de contexte : ${percentage} %`}
          title={`Fenêtre de contexte : ${tokenFormatter.format(usedTokens)} / ${tokenFormatter.format(maxTokens)} (${percentage} %)`}
          className="hidden h-7 shrink-0 select-none items-center gap-1.5 rounded-md px-1.5 text-muted-foreground sm:inline-flex"
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90 shrink-0"
            aria-hidden="true"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              className="text-border"
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={tone}
            />
          </svg>
          <span className="font-mono text-[11px] font-medium tabular-nums text-foreground">
            {percentage}%
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="space-y-1 p-2 text-xs">
        <div className="font-semibold text-foreground">Fenêtre de contexte</div>
        <div className="font-mono text-muted-foreground">
          {tokenFormatter.format(usedTokens)} / {tokenFormatter.format(maxTokens)} ({percentage} %)
        </div>
        <div className="mt-1 space-y-0.5 border-t border-border/40 pt-1 font-mono text-[10px] text-muted-foreground">
          <div>Utilisé : {tokenFormatter.format(usedTokens)} tokens</div>
          <div>Capacité : {tokenFormatter.format(maxTokens)} tokens</div>
          <div>Restant : {tokenFormatter.format(Math.max(0, maxTokens - usedTokens))} tokens</div>
          {!usage && <div>Aucune mesure disponible.</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
