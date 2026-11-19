import { useState } from "react";
import { Check, FileCode, Loader2, ShieldAlert, Terminal, X } from "lucide-react";
import type { AgentPermissionResponse, PendingPermission } from "../../lib/paseo/types";
import { PendingPermissionCard } from "../chat/PendingPermissionCard";
import { PressButton } from "../ui/button";
import { cn } from "../../lib/utils";
import { describeApproval, pickChoices, toResponse } from "./approval-utils";

interface Props {
  permission: PendingPermission;
  onRespond: (response: AgentPermissionResponse) => Promise<void>;
  /** Nom de l'agent concerné, affiché quand la carte est hors de son espace. */
  agentLabel?: string;
}

const ICON = { shell: Terminal, edit: FileCode, write: FileCode, other: ShieldAlert } as const;

/** Demande d'approbation lisible d'un coup d'œil. Les questions à choix gardent le formulaire d'origine. */
export function ApprovalCard({ permission, onRespond, agentLabel }: Props) {
  const { request } = permission;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (request.kind === "question" || request.name === "question") {
    return <PendingPermissionCard permission={permission} onRespond={onRespond} />;
  }

  const v = describeApproval(request);
  const { deny, allow, always } = pickChoices(request.actions);
  const Icon = ICON[v.kind];

  const respond = async (action: typeof allow) => {
    if (busy) return;
    setBusy(action.id);
    setError(null);
    try {
      await onRespond(toResponse(action));
    } catch (e) {
      setError(e instanceof Error ? e.message : "La réponse n'a pas pu être envoyée");
      setBusy(null);
    }
  };

  return (
    <section
      role="group"
      aria-label={v.title}
      className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 space-y-3"
    >
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Icon className="h-4 w-4 pointer-events-none" />
        </span>
        <div className="min-w-0">
          {agentLabel && <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{agentLabel}</p>}
          <h3 className="text-base font-semibold leading-snug text-foreground">{v.title}</h3>
          {v.description && <p className="mt-0.5 text-sm text-muted-foreground">{v.description}</p>}
        </div>
      </header>

      {v.subject && (
        <pre className="overflow-x-auto rounded-lg border border-border bg-background/70 px-3 py-2 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap break-all">
          {v.subject}
        </pre>
      )}
      {v.preview && (
        <pre className="max-h-44 overflow-auto rounded-lg border border-border bg-background/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
          {v.preview}
        </pre>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-2.5">
        <PressButton
          onPress={() => respond(deny)}
          disabled={!!busy}
          className={cn(
            "flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-semibold text-foreground cursor-pointer touch-manipulation",
            busy && "opacity-60",
          )}
        >
          {busy === deny.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 pointer-events-none" />}
          Refuser
        </PressButton>
        <PressButton
          onPress={() => respond(allow)}
          disabled={!!busy}
          className={cn(
            "flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground cursor-pointer touch-manipulation",
            busy && "opacity-60",
          )}
        >
          {busy === allow.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 pointer-events-none" />}
          Valider
        </PressButton>
      </div>
      {always && (
        <PressButton
          onPress={() => respond(always)}
          disabled={!!busy}
          className="min-h-9 w-full rounded-lg text-xs text-muted-foreground underline-offset-2 cursor-pointer touch-manipulation"
        >
          Valider et ne plus demander pour ce type d'action
        </PressButton>
      )}
    </section>
  );
}
