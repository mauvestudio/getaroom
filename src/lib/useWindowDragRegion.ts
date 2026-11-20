import { useEffect, useRef } from "react";

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "label",
  '[role="button"]',
  '[role="combobox"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="textbox"]',
  '[role="slider"]',
  '[role="checkbox"]',
  '[role="tablist"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function isTauriWindow(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function dragWindow(detail: number): void {
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      if (detail === 2) void win.toggleMaximize().catch(() => {});
      else void win.startDragging().catch(() => {});
    })
    .catch(() => {});
}

/**
 * Écouteur global (capture) : tout pixel non interactif à l'intérieur d'un
 * conteneur [data-tauri-drag-region] déplace la fenêtre, même à travers les
 * wrapper overflow-hidden et les enfants intermédiaires.
 */
export function useGlobalWindowDrag(): void {
  useEffect(() => {
    if (!isTauriWindow()) return;

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest) return;
      if (target.matches("[data-tauri-drag-region]")) return; // géré par Tauri natif
      if (target.closest(INTERACTIVE_SELECTOR)) return;
      if (!target.closest("[data-tauri-drag-region]")) return;
      event.preventDefault();
      dragWindow(event.detail);
    };

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, []);
}

/** Drag par conteneur (conservé pour les mounts conditionnels hors AppShell). */
export function useWindowDragRegion<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !isTauriWindow()) return;

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest || target.closest(INTERACTIVE_SELECTOR)) return;
      event.preventDefault();
      dragWindow(event.detail);
    };

    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, []);

  return ref;
}

export function openProjectWindow(projectId: string, title: string): void {
  const url = `${window.location.origin}/?project=${encodeURIComponent(projectId)}`;
  if (!isTauriWindow()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void Promise.all([import("@tauri-apps/api/webviewWindow"), import("@tauri-apps/api/window")])
    .then(async ([{ WebviewWindow }, { getAllWindows }]) => {
      const label = `project-${projectId.replace(/[^a-zA-Z0-9_-]/g, "-")}`.slice(0, 60);
      const windows = await getAllWindows();
      const existing = windows.find((win: { label: string }) => win.label === label);
      if (existing) {
        await existing.setFocus();
        return;
      }
      new WebviewWindow(label, { url, title, width: 1280, height: 860 });
    })
    .catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
}
