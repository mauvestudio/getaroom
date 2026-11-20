import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import type { ProviderUsage, ProviderUsageWindow } from "../../lib/paseo/types";
import { PressButton } from "../ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";

function getPercent(window: ProviderUsageWindow): number | null {
  if (typeof window.usedPct === "number") return Math.max(0, Math.min(100, window.usedPct));
  if (typeof window.remainingPct === "number") return Math.max(0, Math.min(100, 100 - window.remainingPct));
  return null;
}

function getTone(window: ProviderUsageWindow, percent: number | null): string {
  if (window.tone === "danger" || (percent !== null && percent >= 90)) return "bg-destructive";
  if (window.tone === "warning" || (percent !== null && percent >= 70)) return "bg-primary";
  return "bg-foreground/70";
}

function getShortLabel(window: ProviderUsageWindow): string {
  if (window.shortLabel) return window.shortLabel;
  const label = window.label.trim();
  const shortDuration = label.match(/\b(\d+\s*(?:h|hr|hour|hours|d|day|days|w|wk|week|weeks))\b/i)?.[1];
  return shortDuration || label;
}

export function ProviderUsageGauge() {
  const { client, connectionState } = usePaseo();
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (connectionState !== "connected") {
      setProviders([]);
      setError("Connexion au daemon Paseo indisponible.");
      return;
    }
    setLoading(true);
    try {
      const result = await client.listProviderUsage();
      setProviders(result.providers || []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [client, connectionState]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

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
                      <span className={`block h-full rounded-full ${getTone(window, percent)}`} style={{ width: `${percent ?? 0}%` }} />
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
      <PopoverContent align="start" side="top" className="w-80 space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-foreground">Utilisation Paseo</div>
            {provider && <div className="truncate text-[10px] text-muted-foreground">{provider.displayName}{provider.planLabel ? ` · ${provider.planLabel}` : ""}</div>}
          </div>
          <PressButton type="button" onPress={() => void refresh()} disabled={loading} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" title="Actualiser les quotas" aria-label="Actualiser les quotas">
            <RefreshCw className={`h-3.5 w-3.5 pointer-events-none ${loading ? "animate-spin" : ""}`} />
          </PressButton>
        </div>
        {providers.length > 0 ? (
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {providers.map((entry) => (
              <section key={entry.providerId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate font-medium text-foreground">{entry.displayName}</span>
                  <span className="shrink-0 text-muted-foreground">{entry.planLabel || (entry.status === "available" ? "Disponible" : entry.status === "error" ? "Erreur" : "Indisponible")}</span>
                </div>
                {entry.windows.map((window) => {
                  const percent = getPercent(window);
                  return (
                    <div key={window.id} className="space-y-1">
                      <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="truncate">{window.label}</span>
                        <span className="shrink-0 font-mono text-foreground">{percent === null ? "—" : `${Math.round(percent)} %`}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted-foreground/15">
                        <div className={`h-full rounded-full ${getTone(window, percent)}`} style={{ width: `${percent ?? 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{error || "Aucun quota n’est actuellement communiqué par Paseo."}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
