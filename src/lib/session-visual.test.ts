import { describe, expect, test } from "bun:test";
import { aggregateVisual, sessionVisual } from "./session-visual";

describe("sessionVisual (comme Paseo)", () => {
  test("roue quand ça réfléchit, vert quand c'est fini", () => {
    expect(sessionVisual({ status: "running" })).toBe("running");
    expect(sessionVisual({ status: "idle", requiresAttention: true, attentionReason: "finished" })).toBe("finished");
    expect(sessionVisual({ status: "idle", requiresAttention: false, attentionReason: "finished" })).toBe("idle"); // déjà lu
  });
  test("la validation attendue prime sur tout", () => {
    expect(sessionVisual({ status: "running" }, true)).toBe("permission");
    expect(sessionVisual({ status: "running", attentionReason: "permission" })).toBe("permission");
  });
  test("erreur", () => {
    expect(sessionVisual({ status: "failed" })).toBe("failed");
    expect(sessionVisual({ status: "idle", requiresAttention: true, attentionReason: "error" })).toBe("failed");
  });
  test("agrégat d'un projet", () => {
    expect(aggregateVisual(["idle", "finished", "running"])).toBe("running");
    expect(aggregateVisual(["idle", "finished"])).toBe("finished");
    expect(aggregateVisual([])).toBe("idle");
  });
});
