import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "./en.json";
import fr from "./fr.json";

export type Language = "en" | "fr";
const STORAGE_KEY = "getaroom-language";
const translations: Record<Language, Record<string, string>> = { en, fr };
const textOrigins = new WeakMap<Text, { original: string; last: string }>();
const attributeOrigins = new WeakMap<Element, Map<string, { original: string; last: string }>>();
const attributes = ["title", "aria-label", "placeholder", "alt"];

function translate(value: string, language: Language): string {
  if (language === "fr") return value;
  const whitespace = value.match(/^(\s*)(.*?)(\s*)$/s);
  if (!whitespace) return value;
  const before = whitespace[1] || "";
  const core = whitespace[2] || "";
  const after = whitespace[3] || "";
  const compound = core.includes(" · ") ? core.split(" · ").map((part) => translations.en[part] || part).join(" · ") : undefined;
  const translated = translations.en[core] || (compound !== core ? compound : undefined) ||
    (/^Personnaliser (.+)$/.test(core) ? core.replace(/^Personnaliser /, "Customize ") : undefined) ||
    (/^Tester et reconnecter (.+)$/.test(core) ? core.replace(/^Tester et reconnecter /, "Test and reconnect ") : undefined) ||
    (/^Désactiver (.+)$/.test(core) ? core.replace(/^Désactiver /, "Disable ") : undefined) ||
    (/^Activer (.+)$/.test(core) ? core.replace(/^Activer /, "Enable ") : undefined) ||
    (/^Supprimer (.+)$/.test(core) ? core.replace(/^Supprimer /, "Delete ") : undefined) ||
    (/^Fenêtre de contexte : (.+)$/.test(core) ? core.replace(/^Fenêtre de contexte : /, "Context window: ") : undefined) ||
    (/^Daemon Paseo : (.+)$/.test(core) ? core.replace(/^Daemon Paseo : /, "Paseo daemon: ").replace(/déconnecté$/, "disconnected").replace(/connecté$/, "connected") : undefined) ||
    (/^Effort de raisonnement : (.+)$/.test(core) ? core.replace(/^Effort de raisonnement : /, "Reasoning effort: ") : undefined) ||
    (/^Modèle : (.+)$/.test(core) ? core.replace(/^Modèle : /, "Model: ") : undefined) ||
    (/^Choisir le modèle : (.+)$/.test(core) ? core.replace(/^Choisir le modèle : /, "Choose model: ") : undefined) ||
    (/^Écrire à (.+)$/.test(core) ? core.replace(/^Écrire à /, "Write to ") : undefined) ||
    (/^(\d+) agents?$/.test(core) ? core.replace(/agents?$/, (word) => word === "agent" ? "agent" : "agents") : undefined);
  return translated ? `${before}${translated}${after}` : value;
}

function translateElement(root: Node, language: Language): void {
  if (root.nodeType === Node.TEXT_NODE) {
    const node = root as Text;
    if (node.parentElement?.closest("script, style, pre, code, [contenteditable='true'], [data-no-translate]")) return;
    const current = node.data;
    let entry = textOrigins.get(node);
    if (!entry || entry.last !== current) entry = { original: current, last: current };
    const next = translate(entry.original, language);
    entry.last = next;
    textOrigins.set(node, entry);
    if (next !== current) node.data = next;
    return;
  }
  if (!(root instanceof Element)) return;
  if (root.matches("script, style, pre, code, [data-no-translate]")) return;
  let originals = attributeOrigins.get(root);
  if (!originals) { originals = new Map(); attributeOrigins.set(root, originals); }
  for (const attribute of attributes) {
    const current = root.getAttribute(attribute);
    if (current === null) continue;
    let entry = originals.get(attribute);
    if (!entry || entry.last !== current) entry = { original: current, last: current };
    const next = translate(entry.original, language);
    entry.last = next;
    originals.set(attribute, entry);
    if (next !== current) root.setAttribute(attribute, next);
  }
  for (const child of root.childNodes) translateElement(child, language);
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
}
const Context = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "fr" || stored === "en" ? stored : navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
  });
  const setLanguage = (next: Language) => { localStorage.setItem(STORAGE_KEY, next); setLanguageState(next); };
  useEffect(() => {
    document.documentElement.lang = language;
    let scheduled = false;
    const apply = () => { scheduled = false; translateElement(document.body, language); };
    apply();
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(apply);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
    return () => observer.disconnect();
  }, [language]);
  const value = useMemo<I18nValue>(() => ({ language, setLanguage, t: (key) => translations[language][key] || key }), [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n requires I18nProvider");
  return value;
}
