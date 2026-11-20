// Préférence « Historique visuel » (mini-timeline à gauche de la conversation), partagée entre la barre
// supérieure et la timeline sans passer par un contexte React.
import { useCallback, useSyncExternalStore } from "react";

const KEY = "getaroom-visual-history";
const EVENT = "getaroom:visual-history";

const read = () => {
  try { return localStorage.getItem(KEY) !== "false"; } catch { return true; }
};

const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
};

export function useVisualHistory(): [boolean, () => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => true);
  const toggle = useCallback(() => {
    try { localStorage.setItem(KEY, String(!read())); } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [enabled, toggle];
}
