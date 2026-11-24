import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { currentLanguage } from "../../i18n/I18nContext";
import { resolveContextUsage } from "../../lib/context-usage";
import { compactTokens, formatPct, formatUsd, usageCopy } from "../../lib/usage-format";
import { usageForProvider, useProviderUsage } from "../../lib/useProviderUsage";
import { UsageCardCompact, usedPercent } from "./ProviderUsageCard";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";

// Réplique de la fiche Paseo au survol de la jauge de contexte :
// ContextWindowDetails (résumé) + séparateur + UsageCard compact (quotas du provider).

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 180;

export function ContextUsagePill() {
  const { activeAgent, models, selectedModel } = useWorkspace();
  const { providers, loading, refresh } = useProviderUsage();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lang = currentLanguage();
  const copy = usageCopy(lang);

  const usage = activeAgent?.lastUsage || activeAgent?.tokenUsage;
  const { usedTokens, maxTokens, ratio, percentage } = resolveContextUsage(activeAgent, models, selectedModel);
  const cost = formatUsd(activeAgent?.lastUsage?.totalCostUsd ?? activeAgent?.tokenUsage?.totalCost);
  const provider = usageForProvider(providers, activeAgent?.provider);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Ouverture au survol (HoverCard Paseo), avec un délai pour pouvoir glisser jusqu'à la fiche.
  const schedule = (next: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), next ? OPEN_DELAY_MS : CLOSE_DELAY_MS);
  };
  const hover = { onPointerEnter: () => schedule(true), onPointerLeave: () => schedule(false) };

  const tone = percentage >= 90 ? "text-destructive" : percentage >= 70 ? "text-foreground" : "text-muted-foreground";
  const size = 16;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          {...hover}
          onClick={() => setOpen((value) => !value)}
          aria-label={`Fenêtre de contexte : ${percentage} %`}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="hidden h-7 shrink-0 select-none items-center gap-1.5 rounded-full px-1.5 text-muted-foreground transition-colors hover:bg-muted/60 sm:inline-flex"
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-border" />
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} className={tone} />
          </svg>
          <span className="font-mono text-[11px] font-medium tabular-nums text-foreground">{percentage}%</span>
        </button>
      </PopoverAnchor>
      <PopoverContent
        {...hover}
        side="top"
        align="end"
        sideOffset={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        data-no-translate
        className="flex w-[272px] flex-col gap-3 rounded-lg border-[var(--border-accent)] bg-popover p-3 shadow-xl"
      >
        {/* ContextWindowDetails */}
        <div className="flex min-w-[200px] flex-col gap-1.5">
          <span className="text-[14px] text-foreground">{lang === "fr" ? "Fenêtre de contexte" : "Context window"}</span>
          {usage ? (
            <>
              <span className="text-[14px] leading-[1.4] text-foreground">{copy.used(formatPct(percentage, lang))}</span>
              <span className="text-[12px] leading-[1.4] text-muted-foreground">{copy.tokens(compactTokens(usedTokens), compactTokens(maxTokens))}</span>
            </>
          ) : (
            <span className="text-[12px] leading-[1.4] text-muted-foreground">{copy.noData}</span>
          )}
          {cost && <span className="text-[12px] leading-[1.4] text-muted-foreground">{copy.sessionCost(cost)}</span>}
        </div>

        {/* AgentUsage : séparateur + carte compacte */}
        {provider && (
          <>
            <div className="h-px bg-[var(--border-accent)]" />
            <UsageCardCompact provider={provider} lang={lang} loading={loading} onRefresh={() => void refresh()} />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
