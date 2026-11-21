import { useEffect, useState, useSyncExternalStore } from "react";

// Ported from SyncedLoader in Paseo's installed web bundle (module 5496).
const DOT_COUNT = 6;
const DURATION_MS = 950;
const OPACITY_STATES = [
  [1, 0, 0.78, 0, 0.56, 0.34],
  [0.78, 1, 0.56, 0, 0.34, 0],
  [0.56, 0.78, 0.34, 1, 0, 0],
  [0.34, 0.56, 0, 0.78, 0, 1],
  [0, 0.34, 0, 0.56, 1, 0.78],
  [0, 0, 1, 0.34, 0.78, 0.56],
] as const;

const subscribers = new Set<() => void>();
let sharedStep = getStep(Date.now());
let frameId: number | null = null;

function getStep(nowMs: number): number {
  return Math.floor((nowMs % DURATION_MS) * DOT_COUNT / DURATION_MS);
}

function notifyAtNextFrame() {
  frameId = null;
  if (subscribers.size === 0) return;

  const nextStep = getStep(Date.now());
  if (sharedStep !== nextStep) {
    sharedStep = nextStep;
    subscribers.forEach((subscriber) => subscriber());
  }
  frameId = requestAnimationFrame(notifyAtNextFrame);
}

function subscribeToSharedStep(subscriber: () => void) {
  subscribers.add(subscriber);
  if (frameId === null) {
    sharedStep = getStep(Date.now());
    frameId = requestAnimationFrame(notifyAtNextFrame);
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0 && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
}

function subscribeToNothing() {
  return () => {};
}

function getSharedStep() {
  return sharedStep;
}

function getStaticStep() {
  return 0;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function usePageVisible() {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  return visible;
}

export function PaseoSyncedLoader({ size = 14, className = "" }: { size?: number; className?: string }) {
  const reducedMotion = useReducedMotion();
  const pageVisible = usePageVisible();
  const active = !reducedMotion && pageVisible;
  const step = useSyncExternalStore(
    active ? subscribeToSharedStep : subscribeToNothing,
    active ? getSharedStep : getStaticStep,
    getStaticStep,
  );

  const gap = Math.max(1, Math.round(0.12 * size));
  const dotSize = Math.max(2, (size - 2 * gap) / 3);
  const gridWidth = 2 * dotSize + gap;
  const gridHeight = 3 * dotSize + 2 * gap;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size, color: "var(--foreground)" }}
    >
      <span className="relative block" style={{ width: gridWidth, height: gridHeight }}>
        {Array.from({ length: DOT_COUNT }, (_, index) => {
          const row = Math.floor(index / 2);
          const column = index % 2;
          return (
            <span
              key={index}
              className="absolute rounded-full bg-current"
              style={{
                width: dotSize,
                height: dotSize,
                left: column * (dotSize + gap),
                top: row * (dotSize + gap),
                opacity: OPACITY_STATES[step]?.[index] ?? 0,
              }}
            />
          );
        })}
      </span>
    </span>
  );
}
