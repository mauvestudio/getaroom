import { agents, toPublic, validateAgents, type AgentConfig } from "../config/agents";
import { appDataFile, readJson, writeJson } from "./app-data";
import path from "node:path";
import { guardRoutes } from "./request-guard";

const profileFile = appDataFile("agents.json");
const legacyFile = path.join(process.cwd(), "src", "config", "agents.json");

export async function getRoomProfiles(): Promise<AgentConfig[]> {
  try { return validateAgents(await readJson(profileFile, null)); } catch {}
  try {
    const legacy = validateAgents(await readJson(legacyFile, null));
    await writeJson(profileFile, { agents: legacy });
    return legacy;
  } catch {}
  return agents;
}

export async function saveRoomProfiles(value: unknown): Promise<AgentConfig[]> {
  const profiles = validateAgents(value);
  await writeJson(profileFile, { agents: profiles });
  return profiles;
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

/** Routes ROOM sans relais de modèle : les conversations passent par le daemon ACP. */
export const roomApi = guardRoutes({
  "/api/room/agents": { GET: async () => json((await getRoomProfiles()).map(toPublic)) },
  "/api/room/profiles": { GET: async () => json({ agents: await getRoomProfiles() }) },
  "/avatars/:file": {
    GET: (req: Request & { params: { file: string } }) => {
      const file = req.params.file;
      if (!/^[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(file)) return json({ error: "Introuvable" }, 404);
      return new Response(Bun.file(new URL(`../../public/avatars/${file}`, import.meta.url)), {
        headers: { "cache-control": "public, max-age=86400" },
      });
    },
  },
});
