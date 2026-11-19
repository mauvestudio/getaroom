import { describe, expect, test } from "bun:test";
import { getCompactionMarkerLabel } from "./CompactionMarker";

describe("getCompactionMarkerLabel", () => {
  test("returns loading label when status is loading", () => {
    expect(getCompactionMarkerLabel({ status: "loading" })).toBe("Compactage…");
  });

  test("returns auto compaction label when trigger is auto", () => {
    expect(
      getCompactionMarkerLabel({ status: "completed", trigger: "auto" }),
    ).toBe("Contexte compacté automatiquement");
  });

  test("returns manual compaction label when trigger is manual", () => {
    expect(
      getCompactionMarkerLabel({ status: "completed", trigger: "manual" }),
    ).toBe("Contexte compacté manuellement");
  });

  test("formats preTokens in thousands", () => {
    expect(
      getCompactionMarkerLabel({ status: "completed", preTokens: 12345 }),
    ).toBe("Contexte compacté (12 k tokens)");
  });

  test("returns default completed label when no trigger or tokens specified", () => {
    expect(getCompactionMarkerLabel({ status: "completed" })).toBe(
      "Contexte compacté",
    );
  });
});
