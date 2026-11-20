import { describe, expect, test } from "bun:test";
import { PASEO_SKINS, SKIN_OPTIONS, isSkinId, skinVariables } from "./paseo-themes";

describe("skins Paseo", () => {
  test("les 7 skins de Paseo sont proposés dans les réglages", () => {
    expect(SKIN_OPTIONS.map((option) => option.id)).toEqual(["light", "dark", "zinc", "midnight", "claude", "ghostty", "pureBlack"]);
    for (const option of SKIN_OPTIONS) expect(PASEO_SKINS[option.id]).toBeDefined();
  });
  test("couleurs exactes de Paseo (sombre par défaut, accent vert)", () => {
    const dark = skinVariables("dark");
    expect(dark["--background"]).toBe("#1E2120"); // espace de travail = surface1
    expect(dark["--sidebar"]).toBe("#141716");
    expect(dark["--ring"]).toBe("#20744A");
    expect(dark["--status-success"]).toBe("#35c264");
    expect(skinVariables("light")["--background"]).toBe("#ffffff");
    expect(skinVariables("light")["--status-success"]).toBe("#299f51");
  });
  test("chaque skin produit toutes les variables", () => {
    const keys = Object.keys(skinVariables("dark")).sort();
    for (const option of SKIN_OPTIONS) expect(Object.keys(skinVariables(option.id)).sort()).toEqual(keys);
  });
  test("préférence enregistrée valide", () => {
    expect(isSkinId("midnight")).toBe(true);
    expect(isSkinId("system")).toBe(false);
    expect(isSkinId("neon")).toBe(false);
  });
});
