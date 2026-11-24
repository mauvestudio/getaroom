import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PressButton } from "../ui/button";
import { DiagnosticNotice } from "../ui/DiagnosticNotice";

/** Remplace le composer d'une session archivée, comme le bandeau « Cet agent est archivé » de Paseo. */
export function ArchivedSessionCallout() {
  const { activeAgent, resumeArchivedSession } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!activeAgent) return null;

  const resume = async () => {
    setBusy(true);
    setError(null);
    try {
      await resumeArchivedSession(activeAgent);
    } catch (cause) {
      setError(cause ?? new Error("Impossible de reprendre cette session."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[820px] shrink-0 p-4">
      <div className="flex items-center justify-center gap-3">
        <span className="text-sm text-muted-foreground">Cet agent est archivé</span>
        <PressButton type="button" onPress={() => void resume()} disabled={busy} className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60">
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Reprendre
        </PressButton>
      </div>
      {error != null && <DiagnosticNotice error={error} hostId={activeAgent.hostId} providerId={activeAgent.provider} className="mt-2" />}
    </div>
  );
}
