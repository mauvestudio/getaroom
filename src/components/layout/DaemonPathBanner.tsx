import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { usePaseo } from "../../context/PaseoContext";
import { controlLocalDaemon, fetchDaemonStatus, type DaemonStatus } from "../../lib/paseo/daemon-control";
import { providersHiddenByDaemonPath } from "../../lib/paseo/diagnostics";
import { PressButton } from "../ui/button";

const DISMISS_KEY = "getaroom-daemon-path-banner-dismissed";

/**
 * Le démon lancé depuis le Finder hérite d'un PATH minimal : ses providers (codex, antigravity…) sont
 * « indisponibles » alors que leurs CLI sont installées. On le dit et on propose de le relancer avec le PATH complet.
 */
export function DaemonPathBanner() {
  const { providers, refreshProviders } = useWorkspace();
  const { reconnectHost, getHostState } = usePaseo();
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const connected = getHostState("local") === "connected";
  const suspects = useMemo(
    () => providers.filter((provider) => (provider.hostId || "local") === "local" && provider.daemonEnabled !== false && !provider.enabled),
    [providers],
  );

  useEffect(() => {
    if (!connected || suspects.length === 0 || dismissed) return;
    let cancelled = false;
    void fetchDaemonStatus().then((result) => { if (!cancelled) setStatus(result); });
    return () => { cancelled = true; };
  }, [connected, suspects.length, dismissed]);

  const hidden = useMemo(() => status ? providersHiddenByDaemonPath(suspects, status.binaries) : [], [status, suspects]);
  if (dismissed || !connected || !status?.local || hidden.length === 0) return null;

  const restart = async () => {
    if (!window.confirm("Redémarrer le démon Paseo local avec le PATH complet ? Les agents en cours seront interrompus.")) return;
    setBusy(true);
    setMessage("");
    const result = await controlLocalDaemon("restart");
    setMessage(result.message);
    if (result.ok) {
      reconnectHost("local");
      window.setTimeout(() => void refreshProviders(), 1500);
    }
    setBusy(false);
  };

  return (
    <div role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-foreground">
      <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="min-w-0 flex-1">
        Le démon Paseo ne voit pas {hidden.map((entry) => entry.label).join(", ")} : {hidden.length > 1 ? "ces CLI sont installées" : "cette CLI est installée"} ({hidden.map((entry) => entry.binary.path).join(", ")}) mais absente de son PATH (lancement depuis le Finder).
        {message && <span className="ml-1 text-muted-foreground">{message}</span>}
      </span>
      <PressButton type="button" disabled={busy} onPress={() => void restart()} className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 font-medium hover:bg-accent disabled:opacity-60">
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        Redémarrer le démon
      </PressButton>
      <PressButton type="button" aria-label="Masquer" onPress={() => { sessionStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); }} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
        <X className="h-3.5 w-3.5 pointer-events-none" />
      </PressButton>
    </div>
  );
}
