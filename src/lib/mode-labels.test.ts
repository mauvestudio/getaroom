import { expect, test } from "bun:test";
import { modeLabel } from "./mode-labels";

test("modes connus traduits, inconnus inchangés", () => {
  expect(modeLabel("Plan Mode")).toBe("Mode plan");
  expect(modeLabel("  Always Ask ")).toBe("Toujours demander");
  expect(modeLabel("Mode maison")).toBe("Mode maison");
});
