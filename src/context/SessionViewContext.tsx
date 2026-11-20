import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type SessionViewMode = "discussion" | "terminal" | "the-room";

interface SessionViewCtx {
  viewMode: SessionViewMode;
  setViewMode: (mode: SessionViewMode) => void;
  toggleViewMode: () => void;
}

const Ctx = createContext<SessionViewCtx | undefined>(undefined);

export function SessionViewProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewMode] = useState<SessionViewMode>("discussion");

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === "discussion" ? "terminal" : "discussion"));
  }, []);

  // Écouteur global pour Cmd+` (ou Ctrl+`)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "`" || e.key === "~")) {
        e.preventDefault();
        toggleViewMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleViewMode]);

  return (
    <Ctx.Provider value={{ viewMode, setViewMode, toggleViewMode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSessionView(): SessionViewCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useSessionView doit être utilisé au sein de SessionViewProvider");
  }
  return ctx;
}
