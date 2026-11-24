import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "../../lib/utils";

interface Anchor { top: number; text: string }

const MAX_TICKS = 48;
/** Repère de lecture : le message actif est le dernier dont le haut a passé ce point de la fenêtre. */
const READING_LINE = 0.35;

const cleanPreview = (value: string) => value.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();

interface Props {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  /** Change quand la timeline change (longueur, mode résumé…) : déclenche une nouvelle mesure. */
  revision: unknown;
  /** Appelé avant un saut : le suivi automatique ne doit pas ramener la conversation en bas. */
  onJump?: () => void;
}

/**
 * Historique visuel : un trait par message envoyé, le message en cours de lecture en surbrillance,
 * aperçu au survol et saut direct au clic. Remplace la barre de défilement.
 */
export function TimelineMinimap({ viewportRef, contentRef, revision, onJump }: Props) {
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const anchorsRef = useRef<Anchor[]>([]);
  const frame = useRef<number | null>(null);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const origin = viewport.getBoundingClientRect().top - viewport.scrollTop;
    const next = [...content.querySelectorAll<HTMLElement>("[data-user-message]")].map((element) => ({
      top: element.getBoundingClientRect().top - origin,
      text: cleanPreview(element.dataset.preview || ""),
    }));
    anchorsRef.current = next;
    setAnchors((current) => current.length === next.length && current.every((entry, index) => entry.top === next[index]!.top && entry.text === next[index]!.text) ? current : next);
  }, [viewportRef, contentRef]);

  const updateActive = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const line = viewport.scrollTop + viewport.clientHeight * READING_LINE;
    const list = anchorsRef.current;
    let index = 0;
    for (let i = 0; i < list.length; i += 1) if (list[i]!.top <= line) index = i;
    // En bas de la conversation, le dernier message est toujours le message actif.
    if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 4) index = Math.max(0, list.length - 1);
    setActive(index);
  }, [viewportRef]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => { frame.current = null; measure(); updateActive(); });
    };
    schedule();
    const resize = new ResizeObserver(schedule);
    resize.observe(content);
    const onScroll = () => updateActive();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resize.disconnect();
      viewport.removeEventListener("scroll", onScroll);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [viewportRef, contentRef, measure, updateActive, revision]);

  if (anchors.length === 0) return null;

  const start = anchors.length > MAX_TICKS ? Math.max(0, Math.min(anchors.length - MAX_TICKS, active - Math.floor(MAX_TICKS / 2))) : 0;
  const visible = anchors.slice(start, start + MAX_TICKS);

  const jump = (index: number) => {
    const viewport = viewportRef.current;
    const anchor = anchors[index];
    if (!viewport || !anchor) return;
    onJump?.();
    viewport.scrollTo({ top: Math.max(0, anchor.top - 24), behavior: "auto" });
  };

  return (
    <nav
      aria-label="Historique visuel de la conversation"
      className="pointer-events-none absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 md:block"
      onMouseLeave={() => setHovered(null)}
    >
      <ol className="pointer-events-auto flex flex-col items-start gap-[3px]">
        {visible.map((anchor, offset) => {
          const index = start + offset;
          const isActive = index === active;
          const width = 8 + Math.min(8, Math.round(anchor.text.length / 40));
          return (
            <li key={index} className="relative flex items-center">
              <button
                type="button"
                onClick={() => jump(index)}
                onMouseEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                aria-label={`Aller au message ${index + 1}`}
                aria-current={isActive ? "true" : undefined}
                className="flex h-[9px] w-6 cursor-pointer items-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "block rounded-full transition-all duration-150",
                    isActive
                      ? "h-[6px] w-[18px] bg-foreground ring-1 ring-emerald-400/90 shadow-[0_0_8px_rgba(52,211,153,.45)]"
                      : hovered === index ? "h-[2px] bg-foreground/80" : "h-[2px] bg-muted-foreground/40",
                  )}
                  style={isActive ? undefined : { width }}
                />
              </button>
              {hovered === index && anchor.text && (
                <div role="tooltip" className="pointer-events-none absolute left-7 top-1/2 z-30 w-max max-w-[260px] -translate-y-1/2 rounded-lg border border-border/60 bg-popover/95 px-2.5 py-1.5 text-[11px] leading-snug text-popover-foreground shadow-xl backdrop-blur-md">
                  <span className="line-clamp-2 break-words">{anchor.text}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
