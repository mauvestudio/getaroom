import { expect, test } from "bun:test";
import { mergeRoomProviders, type AgentConfig } from "./agents";
import type { PaseoProviderInfo } from "../lib/paseo/types";

const provider: PaseoProviderInfo = {
  id: "hermes-maintenance",
  label: "Maintenance 360",
  enabled: true,
  status: "available",
  kind: "custom",
  hostId: "unraid",
  models: [],
};

const profile: AgentConfig = {
  id: "maintenance",
  name: "Maintenance 360",
  role: "Maintenance WordPress",
  avatar: "robot.png",
  accentColor: "#5EE6F2",
  paseo: { provider: "hermes-maintenance" },
};

test("ROOM preserves an imported provider profile over an old generic onboarding customization", () => {
  const agents = mergeRoomProviders([provider], {
    "hermes-maintenance": { name: "Agent général", role: "Recherche et tâches du quotidien", avatar: "medecin.png", accentColor: "#ffffff" },
  }, [profile]);
  expect(agents).toHaveLength(1);
  expect(agents[0]?.name).toBe("Maintenance 360");
  expect(agents[0]?.role).toBe("Maintenance WordPress");
  expect(agents[0]?.paseo.provider).toBe("hermes-maintenance");
  expect(agents[0]?.paseo.hostId).toBe("unraid");
});

test("ROOM shows live ACP providers instead of unmatched generic examples", () => {
  const examples: AgentConfig[] = [
    { id: "general", name: "Agent général", role: "Example", avatar: "robot.png", accentColor: "#5EE6F2", paseo: {} },
    { id: "developer", name: "Agent développeur", role: "Example", avatar: "medecin.png", accentColor: "#5B9BFF", paseo: {} },
  ];
  const agents = mergeRoomProviders([provider], {}, examples);
  expect(agents).toHaveLength(1);
  expect(agents[0]?.name).toBe("Maintenance 360");
});
