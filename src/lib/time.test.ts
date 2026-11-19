import { expect, test } from "bun:test";
import { timeAgo } from "./time";

test("durées en français", () => {
  const now = Date.UTC(2026, 0, 10, 12);
  expect(timeAgo(now - 10_000, now)).toBe("à l'instant");
  expect(timeAgo(now - 5 * 60_000, now)).toBe("il y a 5 min");
  expect(timeAgo(now - 3 * 3600_000, now)).toBe("il y a 3 h");
  expect(timeAgo(now - 2 * 86400_000, now)).toBe("il y a 2 j");
  expect(timeAgo(null)).toBe("");
});
