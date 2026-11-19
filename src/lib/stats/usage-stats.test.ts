import { describe, expect, it } from "bun:test";
import { calculateUsageMetrics, filterUsageSessions, formatDuration, previousUsageRange, type UsageSession } from "./usage-stats";

const range = { from: new Date("2026-11-01T00:00:00"), to: new Date("2026-11-30T00:00:00") };
const sample: UsageSession[] = [
  { id: "a", universe: "room", targetId: "agent-1", targetName: "Agent", createdAt: "2026-11-02T10:00:00Z", updatedAt: "2026-11-02T11:00:00Z", status: "completed", turnsCount: 3, inputTokens: 100, outputTokens: 50, costUsd: 0.04 },
  { id: "b", universe: "studio", targetId: "mauve", targetName: "Mauve", createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-20T11:00:00Z", status: "completed", turnsCount: 2 },
];

describe("usage-stats", () => {
  it("filters sessions by period, target and universe", () => {
    expect(filterUsageSessions(sample, range, { targetId: "agent-1", universe: "room" }).map((s) => s.id)).toEqual(["a"]);
  });

  it("calculates counts, usage, durations and leaves unavailable costs null", () => {
    const metrics = calculateUsageMetrics(sample.slice(0, 1), range, new Date("2026-11-30T12:00:00Z"));
    expect(metrics.sessions).toBe(1);
    expect(metrics.prompts).toBe(3);
    expect(metrics.tokens).toBe(150);
    expect(metrics.openMs).toBe(60 * 60_000);
    expect(metrics.activeMs).toBe(0);
    expect(metrics.costUsd).toBe(0.04);
    expect(calculateUsageMetrics([sample[1]!], range).costUsd).toBeNull();
  });

  it("estimates active duration for running sessions and formats durations", () => {
    const running = { ...sample[0]!, status: "running", createdAt: "2026-11-03T10:00:00Z", updatedAt: "2026-11-03T10:01:00Z" };
    const metrics = calculateUsageMetrics([running], range, new Date("2026-11-03T10:15:00Z"));
    expect(metrics.activeMs).toBe(15 * 60_000);
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
  });

  it("builds an adjacent previous range", () => {
    const previous = previousUsageRange({ from: new Date("2026-11-11T00:00:00"), to: new Date("2026-11-20T00:00:00") });
    expect(previous.from.toDateString()).toBe(new Date("2026-11-01T00:00:00").toDateString());
    expect(previous.to.toDateString()).toBe(new Date("2026-11-10T00:00:00").toDateString());
  });
});
