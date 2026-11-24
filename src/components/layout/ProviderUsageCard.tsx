import { Bot, RefreshCw } from "lucide-react";
import { formatPct, formatResetLabel, formatResetTime, usageCopy, usageWindowLabel, windowTone, type Lang } from "../../lib/usage-format";
import type { ProviderUsage, ProviderUsageWindow } from "../../lib/paseo/types";
import { cn } from "../../lib/utils";
import { PressButton } from "../ui/button";

// Carte d'utilisation du forfait, réplique de `UsageCard` (mode compact) de Paseo.
// Partagée par la fiche au survol du contexte et la fenêtre de quotas de la sidebar.

export function usedPercent(window: ProviderUsageWindow): number | null {
  if (typeof window.usedPct === "number") return Math.max(0, Math.min(100, window.usedPct));
  if (typeof window.remainingPct === "number") return Math.max(0, Math.min(100, 100 - window.remainingPct));
  return null;
}

/** Paseo `UsageMeter` : piste surface3 de 6 px, remplissage selon le ton. */
export const FILL: Record<string, string> = {
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
export function UsageCardCompact({ provider, lang, loading, onRefresh }: { provider: ProviderUsage; lang: Lang; loading: boolean; onRefresh: () => void }) {
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
