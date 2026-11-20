import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { isSkinId, skinScheme, skinVariables, type SkinId, type ThemePreference } from "../lib/paseo-themes";

/** Préférence : un skin Paseo, ou « system » (clair/sombre selon macOS). */
export type Theme = ThemePreference;

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Skin réellement appliqué (résout « system »). */
  skin: SkinId;
  isDark: boolean;
}

const STORAGE_KEY = "amble-theme";
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readPreference(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "system" || isSkinId(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(query.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  const skin: SkinId = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  const isDark = skinScheme(skin) === "dark";

  // Avant le premier rendu visible : pas de flash entre deux skins.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.dataset.skin = skin;
    root.style.colorScheme = isDark ? "dark" : "light";
    for (const [name, value] of Object.entries(skinVariables(skin))) root.style.setProperty(name, value);
  }, [skin, isDark]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, skin, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
