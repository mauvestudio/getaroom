import { expect, test } from "bun:test";
import { deriveStatus, sessionsInCwd } from "./room-status";

const s = (o: object) => ({ status: "idle", requiresAttention: false, attentionReason: null, ...o }) as any;

test("priorité des états", () => {
  expect(deriveStatus([], false)).toBe("idle");
  expect(deriveStatus([s({ status: "running" })], false)).toBe("working");
  expect(deriveStatus([s({ status: "running" })], true)).toBe("approval");
  expect(deriveStatus([s({ attentionReason: "permission" })], false)).toBe("approval");
  expect(deriveStatus([s({ requiresAttention: true, attentionReason: "finished" })], false)).toBe("review");
  expect(deriveStatus([s({ status: "running" }), s({ requiresAttention: true, attentionReason: "finished" })], false)).toBe("working");
});

test("sessions rattachées à un dossier", () => {
  const all = [{ cwd: "/agents/todo" }, { cwd: "/agents/todo/sub" }, { cwd: "/agents/todo2" }, {}];
  expect(sessionsInCwd(all, "/agents/todo/").length).toBe(2);
});
