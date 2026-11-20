import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";
import { STATUS_LABEL, type LiveStatus } from "../../lib/room-status";

const TONE: Record<LiveStatus, { text: string; wash: string; dot: string; pulse: boolean }> = {
  working: { text: "text-foreground", wash: "bg-muted", dot: "bg-foreground", pulse: true },
  approval: { text: "text-amber-600 dark:text-amber-400", wash: "bg-amber-500/10", dot: "bg-amber-500", pulse: true },
  review: { text: "text-blue-600 dark:text-blue-400", wash: "bg-blue-500/10", dot: "bg-blue-500", pulse: false },
  idle: { text: "text-muted-foreground", wash: "bg-muted", dot: "bg-muted-foreground/50", pulse: false },
};

/** Quand l'agent travaille, la pastille prend la couleur d'accent de l'agent (sinon neutre). */
const accentStyle = (status: LiveStatus, accent?: string): CSSProperties | undefined =>
  status === "working" && accent ? { backgroundColor: accent } : undefined;

/** Pastille d'état en direct : pulse quand l'agent travaille ou attend une validation. */
export function StatusDot({ status, accent, className }: { status: LiveStatus; accent?: string; className?: string }) {
  const t = TONE[status];
  const style = accentStyle(status, accent);
  return (
    <span className={cn("relative inline-flex h-2 w-2 shrink-0", className)} aria-hidden>
      {t.pulse && <span style={style} className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", t.dot)} />}
      <span style={style} className={cn("relative h-2 w-2 rounded-full", t.dot)} />
    </span>
  );
}

export function LiveBadge({ status, accent, className }: { status: LiveStatus; accent?: string; className?: string }) {
  const t = TONE[status];
  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-1.5 text-[11px] font-medium", t.text, className)}
    >
      <StatusDot status={status} accent={accent} />
      {STATUS_LABEL[status]}
    </span>
  );
}
