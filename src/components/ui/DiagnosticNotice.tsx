import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { LOCAL_HOST_ID } from "../../lib/paseo/hosts";
import { controlLocalDaemon, fetchDaemonStatus, type DaemonStatus } from "../../lib/paseo/daemon-control";
import { DIAGNOSIS_ACTION_LABEL, diagnoseFailure, providerBinaryName, providerFromMessage, type DiagnosisAction } from "../../lib/paseo/diagnostics";
import { PressButton } from "./button";

interface Props {
  error: unknown;
  /** Hôte concerné ; « local » par défaut. */
  hostId?: string;
  /** Provider concerné (ex. celui de la session) pour distinguer binaire manquant / non authentifié. */
  providerId?: string;
  className?: string;
}

/** Explique la cause réelle d'un échec Paseo (démon, hôte distant, jeton, provider) et propose l'action adaptée. */
export function DiagnosticNotice({ error, hostId = LOCAL_HOST_ID, providerId: providerProp, className }: Props) {
  const providerId = providerProp ?? providerFromMessage(error) ?? undefined;
  const { hosts, getHostState, reconnectHost } = usePaseo();
  const { providers, refreshProviders } = useWorkspace();
  const host = hosts.find((candidate) => candidate.id === hostId);
  const isLocal = hostId === LOCAL_HOST_ID;
  const provider = providerId
    ? providers.find((item) => item.id.toLowerCase() === providerId.toLowerCase() && (item.hostId || LOCAL_HOST_ID) === hostId)
    : null;
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [busy, setBusy] = useState<DiagnosisAction | null>(null);
  // Confirmation intégrée : window.confirm est muet dans le webview Tauri.
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [outcome, setOutcome] = useState("");

  // Chemin testé pour le binaire du provider : disponible seulement pour le démon de cette machine.
  useEffect(() => {
    if (!isLocal || !providerId) return;
    let cancelled = false;
    void fetchDaemonStatus().then((result) => { if (!cancelled) setStatus(result); });
    return () => { cancelled = true; };
  }, [isLocal, providerId, error]);

  const diagnosis = diagnoseFailure(error, {
    hostId,
    hostName: host?.name,
    isLocal,
    hostState: getHostState(hostId),
    provider: provider ? { id: provider.id, label: provider.label, status: provider.status, enabled: provider.enabled, error: provider.error } : null,
    binary: providerId ? status?.binaries.find((entry) => entry.name === providerBinaryName(providerId)) ?? null : null,
    searchedDirs: status?.searchedDirs,
  });

  const run = async (action: DiagnosisAction) => {
    if (action === "restart-daemon" && !confirmRestart) {
      setConfirmRestart(true);
      return;
    }
    setConfirmRestart(false);
    setBusy(action);
    setOutcome("");
    try {
      if (action === "reconnect") reconnectHost(hostId);
      else if (action === "refresh-providers") await refreshProviders();
      else {
        const result = await controlLocalDaemon(action === "start-daemon" ? "start" : "restart");
        setOutcome(result.message);
        if (result.ok) {
          reconnectHost(hostId);
          window.setTimeout(() => void refreshProviders(), 1200);
        }
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div role="alert" className={`rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs ${className ?? ""}`}>
      <div className="flex items-start gap-2">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold text-foreground">{diagnosis.title}</p>
          <p className="break-words text-muted-foreground">{diagnosis.detail}</p>
          {diagnosis.hint && <p className="text-muted-foreground">{diagnosis.hint}</p>}
          {outcome && <p role="status" className="text-foreground">{outcome}</p>}
          {diagnosis.actions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {diagnosis.actions.filter((action) => isLocal || !action.endsWith("daemon")).map((action) => (
                <PressButton key={action} type="button" disabled={busy !== null} onPress={() => void run(action)} className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-secondary px-2.5 font-medium text-foreground hover:bg-accent disabled:opacity-60">
                  {busy === action && <Loader2 className="h-3 w-3 animate-spin" />}
                  {action === "restart-daemon" && confirmRestart ? "Confirmer : les agents en cours seront interrompus" : DIAGNOSIS_ACTION_LABEL[action]}
                </PressButton>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
