import { useEffect, useRef, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { currentLanguage } from "../../i18n/I18nContext";
import { resolveContextUsage } from "../../lib/context-usage";
import {
  compactTokens, formatPct, formatResetLabel, formatResetTime, formatUsd, usageCopy, usageWindowLabel, windowTone, type Lang,
} from "../../lib/usage-format";
import { usageForProvider, useProviderUsage } from "../../lib/useProviderUsage";
import type { ProviderUsage, ProviderUsageWindow } from "../../lib/paseo/types";
import { cn } from "../../lib/utils";
import { PressButton } from "../ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";

// Réplique de la fiche Paseo au survol de la jauge de contexte :
// ContextWindowDetails (résumé) + séparateur + UsageCard compact (quotas du provider).

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 180;

function usedPercent(window: ProviderUsageWindow): number | null {
  if (typeof window.usedPct === "number") return Math.max(0, Math.min(100, window.usedPct));
  if (typeof window.remainingPct === "number") return Math.max(0, Math.min(100, 100 - window.remainingPct));
  return null;
}

/** Paseo `UsageMeter` : piste surface3 de 6 px, remplissage selon le ton. */
const FILL: Record<string, string> = {
  ok: "var(--usage-ok)",
  warning: "var(--usage-warning)",
  danger: "var(--usage-danger)",
  default: "var(--muted-foreground)",
};

/** Icône de source (14 px dans Paseo) : rayons pour Claude, robot sinon. */
function SourceIcon({ providerId }: { providerId: string }) {
  if (/claude|anthropic/i.test(providerId)) {
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" className="shrink-0 text-foreground" aria-hidden>
        {Array.from({ length: 10 }, (_, index) => {
          const angle = (index / 10) * Math.PI * 2;
          return <line key={index} x1={12 + Math.cos(angle) * 2.5} y1={12 + Math.sin(angle) * 2.5} x2={12 + Math.cos(angle) * 10.5} y2={12 + Math.sin(angle) * 10.5} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />;
        })}
      </svg>
    );
  }
  return <Bot className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />;
}

/** Paseo `UsageWindowBar` (sans épinglage) : libellé + valeur, jauge, ligne de réinitialisation. */
function UsageWindowRow({ window, lang }: { window: ProviderUsageWindow; lang: Lang }) {
  const copy = usageCopy(lang);
  const percent = usedPercent(window);
  const tone = windowTone(window, percent);
  const countdown = formatResetLabel(window.resetsAt, lang);
  const exact = formatResetTime(window.resetsAt, lang);
  return (
    <div className="flex flex-col gap-[3px] py-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{usageWindowLabel(window, lang)}</span>
        <span className="shrink-0 text-[12px] text-foreground">{copy.usedValue(percent == null ? "—" : formatPct(percent, lang))}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-3)]">
        <div className="h-full rounded-full" style={{ width: `${percent ?? 0}%`, backgroundColor: FILL[tone] ?? FILL.default }} />
      </div>
      {countdown && (
        <div className="flex min-w-0 items-center text-[12px] text-muted-foreground">
          <span className="shrink-0">{countdown}</span>
          {exact && <span className="min-w-0 truncate">{` · ${exact}`}</span>}
        </div>
      )}
    </div>
  );
}

/** Paseo `UsageCard` en mode compact. */
function UsageCardCompact({ provider, lang, loading, onRefresh }: { provider: ProviderUsage; lang: Lang; loading: boolean; onRefresh: () => void }) {
  const copy = usageCopy(lang);
  const statusLabel = provider.status === "error" ? copy.status.error : provider.status === "unavailable" ? copy.status.unavailable : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SourceIcon providerId={provider.providerId} />
        <span className="min-w-0 shrink truncate text-[14px] text-foreground">{provider.sourceLabel || provider.displayName}</span>
        {provider.planLabel && (
          <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-[var(--surface-3)] px-1.5 py-px text-[12px] text-muted-foreground">{provider.planLabel}</span>
        )}
        <span className="flex-1" />
        {statusLabel && (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", provider.status === "error" ? "bg-[var(--status-danger)]" : "bg-muted-foreground")} />
            <span className="text-[12px] text-muted-foreground">{statusLabel}</span>
          </span>
        )}
        <PressButton
          type="button"
          onPress={onRefresh}
          disabled={loading}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--foreground-extra-muted)] hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label="Actualiser"
          title="Actualiser"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 pointer-events-none", loading && "animate-spin")} />
        </PressButton>
      </div>

      {provider.error && provider.status !== "available" && (
        <p className="text-[12px] leading-[1.4] text-red-300">{provider.error}</p>
      )}

      {provider.windows.length > 0 && (
        <div className="flex flex-col gap-1">
          {provider.windows.map((window) => <UsageWindowRow key={window.id} window={window} lang={lang} />)}
        </div>
      )}

      {(provider.details?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1">
          {provider.details!.map((detail) => detail.label ? (
            <div key={detail.id} className="flex justify-between gap-2">
              <span className="min-w-0 shrink truncate text-[12px] text-muted-foreground">{detail.label}</span>
              <span className="shrink-0 text-[12px] text-foreground">{detail.value}</span>
            </div>
          ) : (
            <span key={detail.id} className="truncate text-[12px] text-muted-foreground">{detail.value}</span>
          ))}
        </div>
      )}
    </div>
  );
}

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
