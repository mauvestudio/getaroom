import { describe, expect, test } from "bun:test";
import { pickSidebarUsage } from "./useProviderUsage";
import type { ProviderUsage } from "./paseo/types";

const entry = (providerId: string, windows: Array<{ id: string; summary?: boolean }>, status: ProviderUsage["status"] = "available"): ProviderUsage => ({
  providerId, displayName: providerId, status, planLabel: null,
  windows: windows.map((window) => ({ id: window.id, label: window.id, summary: window.summary })),
});

const antigravity = entry("antigravity", [{ id: "gemini-weekly", summary: true }, { id: "3p-weekly", summary: true }, { id: "3p-5h" }]);
const claude = entry("claude", [{ id: "five_hour", summary: true }, { id: "weekly", summary: true }]);
const codex = entry("codex", [{ id: "five_hour", summary: true }]);

describe("pickSidebarUsage", () => {
  test("sans session active : Claude passe avant les autres, même listé après", () => {
    expect(pickSidebarUsage([antigravity, codex, claude]).provider?.providerId).toBe("claude");
  });
  test("le provider de la session active est prioritaire", () => {
    expect(pickSidebarUsage([antigravity, claude, codex], "codex").provider?.providerId).toBe("codex");
  });
  test("ne garde que les fenêtres résumées, 2 au maximum", () => {
    expect(pickSidebarUsage([antigravity]).windows.map((window) => window.id)).toEqual(["gemini-weekly", "3p-weekly"]);
  });
  test("provider indisponible ignoré", () => {
    expect(pickSidebarUsage([entry("claude", [{ id: "x", summary: true }], "error"), codex]).provider?.providerId).toBe("codex");
  });
});
