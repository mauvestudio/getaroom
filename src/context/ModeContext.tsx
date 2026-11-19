import React, { createContext, useCallback, useContext, useState } from "react";

export type AppMode = "room" | "studio" | "openspace";
const KEY = "get-a-room-mode";
const LEGACY_KEY = "mauve-mode";

interface ModeCtx {
  mode: AppMode;
  setMode: (m: AppMode) => void;
}
const Ctx = createContext<ModeCtx | undefined>(undefined);

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(() => {
    try {
      const stored = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
      if (stored === "studio" || stored === "openspace") return stored;
      return "room";
    } catch {
      return "room";
    }
  });

  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {}
  }, []);

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export function useMode(): ModeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMode doit être utilisé dans <ModeProvider>");
  return v;
}
