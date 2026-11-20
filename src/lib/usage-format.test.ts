import { describe, expect, test } from "bun:test";
import {
  compactTokens, formatPct, formatResetLabel, formatResetTime, formatUsd, usageCopy, usageWindowLabel, windowTone,
} from "./usage-format";
import { usageForProvider } from "./useProviderUsage";
import type { ProviderUsage } from "./paseo/types";

const now = new Date(2026, 10, 20, 22, 26).getTime(); // ven. 20 nov. 22:26

describe("fiche contexte — formats identiques à Paseo", () => {
  test("tokens (formatTokenCount)", () => {
    expect(compactTokens(552_000)).toBe("552k");
    expect(compactTokens(1_000_000)).toBe("1m");
    expect(compactTokens(1_250_000)).toBe("1m");
    expect(compactTokens(840)).toBe("840");
  });

  test("lignes de résumé", () => {
    const fr = usageCopy("fr");
    expect(fr.used(formatPct(55, "fr"))).toBe("55 % utilisés");
    expect(fr.tokens("552k", "1m")).toBe("552k / 1m tokens");
    expect(fr.sessionCost(formatUsd(34.236)!)).toBe("Coût de la session : $34.24");
    expect(usageCopy("en").used(formatPct(55, "en"))).toBe("55% used");
  });

  test("réinitialisation : compte à rebours + heure exacte", () => {
    const soon = new Date(2026, 10, 21, 2, 10).toISOString();
    const thursday = new Date(2026, 10, 26, 19, 0).toISOString();
    expect(formatResetLabel(soon, "fr", now)).toBe("se réinitialise dans 3 h 44 min");
    expect(formatResetTime(soon, "fr", now)).toBe("2:10"); // comme Paseo : « · 2:10 »
    expect(formatResetLabel(thursday, "fr", now)).toBe("se réinitialise dans 5 j 20 h");
    expect(formatResetTime(thursday, "fr", now)).toBe("jeu. 19:00");
    expect(formatResetLabel(new Date(now - 1000).toISOString(), "fr", now)).toBe("réinitialisation en cours");
    expect(formatResetTime(new Date(2026, 11, 20, 9, 0).toISOString(), "fr", now)).toContain("déc.");
  });

  test("libellés et tons des périodes", () => {
    expect(usageWindowLabel({ id: "weekly", label: "Weekly" }, "fr")).toBe("Hebdomadaire");
    expect(usageWindowLabel({ id: "five_hour", label: "Session" }, "fr")).toBe("Session");
    expect(usageWindowLabel({ id: "custom", label: "Opus" }, "fr")).toBe("Opus");
    expect(windowTone({ id: "s", label: "S", usedPct: 56 }, 56)).toBe("ok");
    expect(windowTone({ id: "s", label: "S" }, 75)).toBe("warning");
    expect(windowTone({ id: "s", label: "S" }, 95)).toBe("danger");
    expect(windowTone({ id: "s", label: "S", tone: "danger" }, 10)).toBe("danger");
  });

  test("quotas du provider de la session active", () => {
    const providers = [
      { providerId: "codex", displayName: "Codex", status: "available", planLabel: null, windows: [] },
      { providerId: "claude", displayName: "Claude", status: "available", planLabel: "Pro", windows: [] },
    ] as ProviderUsage[];
    expect(usageForProvider(providers, "claude")?.displayName).toBe("Claude");
    expect(usageForProvider(providers, "gemini")).toBeUndefined();
  });
});
