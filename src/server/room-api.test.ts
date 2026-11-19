import { expect, test } from "bun:test";
import { roomApi } from "./room-api";
import { validateAgents } from "../config/agents";

test("ROOM publie des profils ACP sans secret ni configuration HTTP", async () => {
  const response = await roomApi["/api/room/agents"].GET();
  const list = await response.json();
  expect(list.length).toBeGreaterThan(0);
  expect(JSON.stringify(list)).not.toContain("systemPrompt");
  expect(JSON.stringify(list)).not.toContain("API_KEY");
  expect(list.every((agent: any) => agent.paseo)).toBe(true);
});

test("validation des profils Paseo", () => {
  expect(() => validateAgents({ agents: [{ id: "A b" }] })).toThrow();
  expect(() => validateAgents({ agents: [{ id: "valid", name: "x", role: "x", avatar: "x.png", accentColor: "#ffffff", systemPrompt: "x" }] })).toThrow();
});
