import { useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { useProviderUsage } from "../../lib/useProviderUsage";
import type { ProviderUsageWindow } from "../../lib/paseo/types";
import { currentLanguage } from "../../i18n/I18nContext";
import { timeAgo } from "../../lib/time";
import { usageCopy, windowTone } from "../../lib/usage-format";
import { PressButton } from "../ui/button";
import { FILL, UsageCardCompact } from "./ProviderUsageCard";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";

function getPercent(window: ProviderUsageWindow): number | null {
  if (typeof window.usedPct === "number") return Math.max(0, Math.min(100, window.usedPct));
  if (typeof window.remainingPct === "number") return Math.max(0, Math.min(100, 100 - window.remainingPct));
  return null;
}

function getShortLabel(window: ProviderUsageWindow): string {
  if (window.shortLabel) return window.shortLabel;
  const label = window.label.trim();
  const shortDuration = label.match(/\b(\d+\s*(?:h|hr|hour|hours|d|day|days|w|wk|week|weeks))\b/i)?.[1];
  return shortDuration || label;
}

export function ProviderUsageGauge() {
  // Source partagée avec la fiche « Fenêtre de contexte » : une seule requête au daemon.
  const { providers, error, loading, refresh, fetchedAt } = useProviderUsage();
  const lang = currentLanguage();
  const copy = usageCopy(lang);
  const [open, setOpen] = useState(false);

  const provider = useMemo(
    () => providers.find((item) => item.status === "available" && item.windows.length > 0) || providers[0],
    [providers],
  );
  const windows = provider?.windows.slice(0, 2) || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
      <PressButton
        type="button"
        onPress={() => setOpen((value) => !value)}
        className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-border/50 bg-background/45 px-2.5 text-muted-foreground transition-colors hover:border-border hover:bg-background/75 hover:text-foreground"
        aria-label="Ouvrir les quotas d’utilisation Paseo"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={provider ? `Quotas Paseo · ${provider.displayName}` : "Quotas d’utilisation Paseo"}
      >
          <Activity className="h-4 w-4 shrink-0 text-foreground/80 pointer-events-none" />
          {windows.length > 0 ? (
            <span className="grid min-w-0 flex-1 grid-cols-2 gap-2.5">
              {windows.map((window) => {
                const percent = getPercent(window);
                return (
                  <span key={window.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-0.5">
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/20">
                      <span className="block h-full rounded-full" style={{ width: `${percent ?? 0}%`, backgroundColor: FILL[windowTone(window, percent)] ?? FILL.default }} />
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-foreground">{percent === null ? "—" : `${Math.round(percent)} %`}</span>
                    <span className="col-span-2 truncate text-left text-[9px] leading-none text-muted-foreground">{getShortLabel(window)}</span>
                  </span>
                );
              })}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-left text-[11px] font-medium">
              {loading ? "Chargement des quotas…" : "Utilisation Paseo indisponible"}
            </span>
          )}
      </PressButton>
      </PopoverAnchor>
      <PopoverContent align="start" side="top" className="w-[340px] space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[14px] font-medium text-foreground">{copy.title}</div>
          <PressButton type="button" onPress={() => void refresh()} disabled={loading} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label={copy.refreshAll} title={copy.refreshAll}>
            <RefreshCw className={`h-3.5 w-3.5 pointer-events-none ${loading ? "animate-spin" : ""}`} />
            {copy.refreshAll}
          </PressButton>
        </div>
        {providers.length > 0 ? (
          <div className="max-h-[420px] space-y-4 overflow-y-auto">
            {providers.map((entry, index) => (
              <div key={entry.providerId} className={index > 0 ? "border-t border-border pt-4" : undefined}>
                <UsageCardCompact provider={entry} lang={lang} loading={loading} onRefresh={() => void refresh()} />
              </div>
            ))}
          </div>
        ) : loading ? (
          <p className="text-[12px] text-muted-foreground">{copy.loading}</p>
        ) : error ? (
          <div className="space-y-1">
            <p className="text-[12px] font-medium text-foreground">{copy.errorTitle}</p>
            <p className="text-[12px] text-muted-foreground">{error}</p>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">{copy.empty}</p>
        )}
        {fetchedAt > 0 && providers.length > 0 && <p className="text-[11px] text-muted-foreground">{copy.updated(timeAgo(fetchedAt))}</p>}
      </PopoverContent>
    </Popover>
  );
}
