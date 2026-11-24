import { describe, expect, test } from "bun:test";
import { enrichPath, extractMarked, findBinary, mergePaths } from "./user-path";

const home = "/Users/test";
const present = new Set([
  "/Users/test/.local/bin",
  "/Users/test/.bun/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/Users/test/.nvm/versions/node/v20.1.0/bin",
  "/Users/test/.nvm/versions/node/v22.4.0/bin",
]);
const deps = {
  exists: (target: string) => present.has(target),
  list: (dir: string) => (dir === "/Users/test/.nvm/versions/node" ? ["v20.1.0", "v22.4.0"] : []),
};

describe("enrichPath", () => {
  test("complète le PATH minimal d'un lancement GUI avec les dossiers existants", () => {
    const { path, added } = enrichPath("/usr/bin:/bin:/usr/sbin:/sbin", home, deps);
    expect(path.startsWith("/usr/bin:/bin:/usr/sbin:/sbin:")).toBe(true);
    expect(added).toContain("/Users/test/.local/bin");
    expect(added).toContain("/Users/test/.bun/bin");
    expect(added).toContain("/opt/homebrew/bin");
  });

  test("ignore les dossiers inexistants", () => {
    const { added } = enrichPath("/usr/bin", home, deps);
    expect(added).not.toContain("/Users/test/.opencode/bin");
    expect(added).not.toContain("/Users/test/.cargo/bin");
  });

  test("ne duplique pas et conserve l'ordre du PATH d'origine", () => {
    const { path, added } = enrichPath("/opt/homebrew/bin:/usr/bin", home, deps);
    expect(path.split(":").filter((dir) => dir === "/opt/homebrew/bin")).toHaveLength(1);
    expect(added).not.toContain("/opt/homebrew/bin");
    expect(path.startsWith("/opt/homebrew/bin:/usr/bin")).toBe(true);
  });

  test("ajoute les versions nvm, la plus récente d'abord", () => {
    const { added } = enrichPath("", home, deps);
    const v22 = added.indexOf("/Users/test/.nvm/versions/node/v22.4.0/bin");
    const v20 = added.indexOf("/Users/test/.nvm/versions/node/v20.1.0/bin");
    expect(v22).toBeGreaterThan(-1);
    expect(v22).toBeLessThan(v20);
  });

  test("gère un PATH absent", () => {
    expect(enrichPath(undefined, home, deps).path.length).toBeGreaterThan(0);
  });
});

describe("findBinary", () => {
  test("retourne le premier chemin existant", () => {
    const exists = (target: string) => target === "/Users/test/.local/bin/claude";
    expect(findBinary("claude", "/usr/bin:/Users/test/.local/bin", exists)).toBe("/Users/test/.local/bin/claude");
  });
  test("retourne null si introuvable", () => {
    expect(findBinary("codex", "/usr/bin:/bin", () => false)).toBeNull();
  });
});

describe("login shell PATH", () => {
  test("extractMarked ignore le bruit autour des marqueurs", () => {
    expect(extractMarked("welcome\nMKa:b:cMK\n", "MK")).toBe("a:b:c");
    expect(extractMarked("MKMK", "MK")).toBeNull();
    expect(extractMarked("rien", "MK")).toBeNull();
  });
  test("mergePaths conserve l'ordre et évite les doublons", () => {
    expect(mergePaths("/usr/bin:/bin", "/bin:/opt/x:/usr/bin")).toBe("/usr/bin:/bin:/opt/x");
    expect(mergePaths(undefined, "/a")).toBe("/a");
  });
});
