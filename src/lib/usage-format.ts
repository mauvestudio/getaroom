// Formats de la fiche « Fenêtre de contexte », repris à l'identique de Paseo
// (formatTokenCount, formatPct, formatResetLabel, formatResetTime, libellés de périodes).
import type { ProviderUsageTone, ProviderUsageWindow } from "./paseo/types";

export type Lang = "fr" | "en";

const COPY = {
  fr: {
    used: (pct: string) => `${pct.replace("%", "").trim()} % utilisés`,
    tokens: (used: string, max: string) => `${used} / ${max} tokens`,
    sessionCost: (cost: string) => `Coût de la session : ${cost}`,
    noData: "Aucune donnée de contexte",
    usedValue: (pct: string) => `Utilisé : ${pct}`,
    resetsIn: (duration: string) => `se réinitialise dans ${duration}`,
    resettingNow: "réinitialisation en cours",
    days: (n: number) => `${n} j`,
    hours: (n: number) => `${n} h`,
    minutes: (n: number) => `${n} min`,
    labels: { session: "Session", weekly: "Hebdomadaire", monthly: "Mensuel", code_review: "Révision de code", credits: "Crédits", monthly_credits: "Crédits mensuels" },
    status: { error: "Erreur", unavailable: "Indisponible" },
    loading: "Chargement de l’utilisation...",
    title: "Utilisation du forfait",
    refreshAll: "Tout actualiser",
    empty: "Aucune donnée d’utilisation",
    errorTitle: "Impossible de charger l’utilisation",
    retry: "Réessayer",
    updated: (relative: string) => `Mis à jour ${relative}`,
  },
  en: {
    used: (pct: string) => `${pct.replace("%", "").trim()}% used`,
    tokens: (used: string, max: string) => `${used} / ${max} tokens`,
    sessionCost: (cost: string) => `Session cost ${cost}`,
    noData: "No context data",
    usedValue: (pct: string) => `Used: ${pct}`,
    resetsIn: (duration: string) => `resets in ${duration}`,
    resettingNow: "resetting now",
    days: (n: number) => `${n}d`,
    hours: (n: number) => `${n}h`,
    minutes: (n: number) => `${n}m`,
    labels: { session: "Session", weekly: "Weekly", monthly: "Monthly", code_review: "Code review", credits: "Credits", monthly_credits: "Monthly credits" },
    status: { error: "Error", unavailable: "Unavailable" },
    loading: "Loading usage...",
    title: "Plan usage",
    refreshAll: "Refresh all",
    empty: "No usage data",
    errorTitle: "Couldn't load usage",
    retry: "Retry",
    updated: (relative: string) => `Updated ${relative}`,
  },
} as const;

export const usageCopy = (lang: Lang) => COPY[lang];

/** Paseo `formatTokenCount` : 552 000 → « 552k », 1 000 000 → « 1m ». */
export function compactTokens(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value >= 1e6) return `${Math.round(value / 1e6)}m`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return Math.round(value).toString();
}

export function formatUsd(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${value.toFixed(2)}`;
}

/** Paseo `formatPct` : Intl en pourcentage (« 56 % » en français, « 56% » en anglais). */
export function formatPct(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(Math.max(0, Math.min(100, value)) / 100);
}

/** Paseo `windowTone` : ton fourni, sinon > 90 % danger, ≥ 70 % alerte. */
export function windowTone(window: ProviderUsageWindow, used: number | null): ProviderUsageTone | "default" {
  if (window.tone) return window.tone;
  if (used == null) return "default";
  return used > 90 ? "danger" : used >= 70 ? "warning" : "ok";
}

/** Paseo `formatProviderUsageLabel` : libellés connus traduits, sinon tels quels. */
export function usageWindowLabel(window: Pick<ProviderUsageWindow, "id" | "label">, lang: Lang): string {
  const english: Record<string, string> = { session: "Session", weekly: "Weekly", monthly: "Monthly", code_review: "Code review", credits: "Credits", monthly_credits: "Monthly credits" };
  const id = window.id === "five_hour" ? "session" : window.id;
  const key = id as keyof typeof COPY.fr.labels;
  return english[id] && english[id] === window.label ? COPY[lang].labels[key] : window.label;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 604_800_000;

/** Paseo `formatResetLabel` : « se réinitialise dans 3 h 44 min ». */
export function formatResetLabel(resetsAt: string | null | undefined, lang: Lang, now = Date.now()): string | null {
  if (!resetsAt) return null;
  const ms = new Date(resetsAt).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  const copy = COPY[lang];
  if (ms <= 0) return copy.resettingNow;
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  const parts = days > 0
    ? [copy.days(days), hours > 0 ? copy.hours(hours) : null]
    : hours > 0
      ? [copy.hours(hours), minutes > 0 ? copy.minutes(minutes) : null]
      : [copy.minutes(minutes)];
  return copy.resetsIn(parts.filter(Boolean).join(" "));
}

/** Paseo `formatTimeOfDay` : heure locale « 2:10 » / « 19:00 ». */
export function formatTimeOfDay(date: Date, lang: Lang): string {
  const { hourCycle } = new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit" }).resolvedOptions();
  return new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit", hourCycle }).format(date);
}

/** Paseo `formatResetTime` : heure (< 1 j), jour + heure (< 7 j), sinon date + heure. */
export function formatResetTime(resetsAt: string | null | undefined, lang: Lang, now = Date.now()): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  const ms = date.getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const time = formatTimeOfDay(date, lang);
  if (ms < DAY) return time;
  if (ms < WEEK) return `${date.toLocaleDateString(lang, { weekday: "short" })} ${time}`;
  return `${date.toLocaleDateString(lang, { month: "short", day: "numeric" })}, ${time}`;
}
