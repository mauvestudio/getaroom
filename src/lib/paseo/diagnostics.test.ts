import { describe, expect, test } from "bun:test";
import { diagnoseFailure, providerBinaryName, providerFromMessage, providersHiddenByDaemonPath } from "./diagnostics";

const local = { hostId: "local", hostName: "MacBook", isLocal: true, hostState: "connected" };
const remote = { hostId: "h1", hostName: "Unraid", isLocal: false, hostState: "connected" };

describe("diagnoseFailure", () => {
  test("démon local déconnecté → démon arrêté avec action de démarrage", () => {
    const d = diagnoseFailure(new Error("Unable to refresh agent"), { ...local, hostState: "disconnected" });
    expect(d.kind).toBe("daemon-down");
    expect(d.actions).toContain("start-daemon");
  });

  test("reconnexion en cours → message d'attente, pas d'erreur", () => {
    const d = diagnoseFailure("x", { ...local, hostState: "reconnecting" });
    expect(d.title).toContain("Reconnexion");
    expect(d.actions).toEqual(["reconnect"]);
  });

  test("hôte distant déconnecté → injoignable, nomme l'hôte", () => {
    const d = diagnoseFailure("x", { ...remote, hostState: "disconnected" });
    expect(d.kind).toBe("host-unreachable");
    expect(d.title).toContain("Unraid");
  });

  test("timeout distant → host-timeout", () => {
    expect(diagnoseFailure(new Error("Request timed out after 15000ms"), remote).kind).toBe("host-timeout");
  });

  test("timeout local → démon gelé, propose le redémarrage", () => {
    const d = diagnoseFailure(new Error("timeout"), local);
    expect(d.kind).toBe("daemon-unresponsive");
    expect(d.actions).toContain("restart-daemon");
  });

  test("jeton expiré → auth", () => {
    expect(diagnoseFailure(new Error("401 Unauthorized"), remote).kind).toBe("auth");
    expect(diagnoseFailure(new Error("session expired"), remote).kind).toBe("auth");
  });

  test("provider non détecté avec binaire hors du PATH du démon → redémarrage", () => {
    const d = diagnoseFailure(new Error("Unable to refresh agent"), {
      ...local,
      provider: { id: "claude", label: "Claude", status: "unavailable", enabled: true, error: "spawn claude ENOENT" },
      binary: { name: "claude", path: "/Users/test/.local/bin/claude" },
    });
    expect(d.kind).toBe("provider-missing");
    expect(d.detail).toContain("/Users/test/.local/bin/claude");
    expect(d.actions).toContain("restart-daemon");
  });

  test("binaire introuvable → liste les dossiers testés", () => {
    const d = diagnoseFailure("x", {
      ...local,
      provider: { id: "codex", status: "error", error: "codex: command not found" },
      binary: { name: "codex", path: null },
      searchedDirs: ["/usr/bin", "/opt/homebrew/bin"],
    });
    expect(d.kind).toBe("provider-missing");
    expect(d.detail).toContain("/opt/homebrew/bin");
    expect(d.providerId).toBe("codex");
  });

  test("provider non authentifié", () => {
    const d = diagnoseFailure("x", { ...local, provider: { id: "claude", label: "Claude", status: "error", error: "Not logged in · run claude login" } });
    expect(d.kind).toBe("provider-auth");
    expect(d.title).toContain("Claude");
  });

  test("provider sain + message réseau local → démon injoignable", () => {
    const d = diagnoseFailure(new Error("ECONNREFUSED 127.0.0.1:6767"), { ...local, provider: { id: "claude", status: "available", enabled: true } });
    expect(d.kind).toBe("daemon-down");
  });

  test("cause inconnue → message brut conservé", () => {
    const d = diagnoseFailure(new Error("boom"), local);
    expect(d.kind).toBe("unknown");
    expect(d.detail).toBe("boom");
  });

  test("message du démon « Provider 'antigravity' is not available » → provider nommé, binaire agy trouvé hors PATH du démon", () => {
    const message = "Impossible de charger l’historique : Provider 'antigravity' is not available. Please ensure the CLI is installed.";
    expect(providerFromMessage(message)).toBe("antigravity");
    const d = diagnoseFailure(new Error(message), {
      ...local,
      provider: { id: "antigravity", label: "Antigravity", status: "available", enabled: true },
      binary: { name: "agy", path: "/opt/homebrew/bin/agy" },
    });
    expect(d.kind).toBe("provider-missing");
    expect(d.providerId).toBe("antigravity");
    expect(d.detail).toContain("/opt/homebrew/bin/agy");
    expect(d.actions).toContain("restart-daemon");
  });

  test("provider antigravity cherche le binaire agy", () => {
    expect(providerBinaryName("antigravity")).toBe("agy");
    expect(providerBinaryName("mistral-vibe")).toBe("vibe");
    expect(providerBinaryName("inconnu")).toBe("inconnu");
  });
});

describe("providersHiddenByDaemonPath", () => {
  const binaries = [{ name: "codex", path: "/Users/t/.bun/bin/codex" }, { name: "agy", path: "/opt/homebrew/bin/agy" }, { name: "gemini", path: null }];
  test("liste les providers activés, indisponibles, dont la CLI existe", () => {
    const hidden = providersHiddenByDaemonPath([
      { id: "codex", label: "Codex", status: "unavailable", daemonEnabled: true },
      { id: "antigravity", label: "Antigravity", status: "unavailable", daemonEnabled: true },
      { id: "claude", status: "available", daemonEnabled: true },
      { id: "gemini", status: "unavailable", daemonEnabled: true },
      { id: "copilot", status: "unavailable", daemonEnabled: false },
    ], binaries);
    expect(hidden.map((entry) => entry.id)).toEqual(["codex", "antigravity"]);
  });
  test("ignore les hôtes distants", () => {
    expect(providersHiddenByDaemonPath([{ id: "codex", status: "unavailable", hostId: "h1" }], binaries)).toEqual([]);
  });
});
