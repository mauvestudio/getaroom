import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { SESSION_VISUAL_LABEL, type SessionVisual } from "../../lib/session-visual";

interface Props {
  state: SessionVisual;
  /** Affiché quand la session est au repos (ex. icône de session) ; rien par défaut. */
  idle?: ReactNode;
  className?: string;
  /** Couleur de la roue (ex. couleur d'accent d'un agent Room). */
  color?: string;
}

/**
 * Indicateur d'état façon Paseo : roue fine qui tourne pendant que l'agent réfléchit,
 * pastille verte quand c'est terminé, ambre pour une validation, rouge en cas d'erreur.
 */
export function SessionStatusIcon({ state, idle = null, className, color }: Props) {
  if (state === "idle") return <>{idle}</>;
  const label = SESSION_VISUAL_LABEL[state];
  if (state === "running") {
    return (
      <span role="status" aria-label={label} title={label} className={cn("inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
        <svg viewBox="0 0 16 16" className="h-3 w-3 motion-safe:animate-spin [animation-duration:.9s]" style={color ? { color } : undefined} aria-hidden>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="2" />
          <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  const tone = state === "finished"
    ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.18)]"
    : state === "permission"
      ? "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,.2)] motion-safe:animate-pulse"
      : "bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,.18)]";
  return (
    <span role="status" aria-label={label} title={label} className={cn("inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center", className)}>
      <span className={cn("h-[7px] w-[7px] rounded-full", tone)} aria-hidden />
    </span>
  );
}
