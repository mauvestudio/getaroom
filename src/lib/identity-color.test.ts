import { describe, expect, test } from "bun:test";
import { deriveIdentityColorName, identityColor, identityHash } from "./identity-color";

describe("identité de projet (palette Paseo)", () => {
  test("hash identique à Paseo (31 * t + code, non signé)", () => {
    expect(identityHash("")).toBe(0);
    expect(identityHash("a")).toBe(97);
    expect(identityHash("ab")).toBe(31 * 97 + 98);
  });
  test("ne dépasse jamais 32 bits non signés, même sur une clé longue", () => {
    const hash = identityHash("remote:github.com/mauvestudio/getaroom/".repeat(20));
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });
  test("couleur déterministe et issue de la palette", () => {
    expect(deriveIdentityColorName("getaroom")).toBe(deriveIdentityColorName("getaroom"));
    expect(identityColor("violet")).toBe("#7a6aa8");
    expect(identityColor(deriveIdentityColorName("n'importe quoi"))).toMatch(/^#[0-9a-f]{6}$/);
  });
});
