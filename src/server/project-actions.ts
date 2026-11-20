import { realpath, stat } from "node:fs/promises";
import { guardRoutes } from "./request-guard";

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

const failed = (error: unknown) =>
  json({ error: error instanceof Error ? error.message : String(error) }, 500);

export const projectActionsApi = guardRoutes({
  "/api/workspace/resolve-path": {
    async POST(req: Request) {
      try {
        const body = (await req.json()) as { path?: unknown };
        const rawPath = typeof body.path === "string" ? body.path.trim() : "";
        if (!rawPath.startsWith("/") || rawPath.length > 4096) {
          return json({ error: "Chemin de workspace invalide." }, 400);
        }
        const canonicalPath = await realpath(rawPath);
        const info = await stat(canonicalPath);
        if (!info.isDirectory()) return json({ error: "Le chemin du workspace n’est pas un dossier." }, 400);
        return json({ path: canonicalPath });
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
          return json({ error: "Le dossier du workspace sélectionné n’existe plus. Sélectionne un workspace valide dans Paseo." }, 404);
        }
        return failed(error);
      }
    },
  },
  "/api/reveal": {
    async POST(req: Request) {
      try {
        const body = (await req.json()) as { path?: unknown };
        const rawPath = typeof body.path === "string" ? body.path.trim() : "";
        if (!rawPath.startsWith("/") || rawPath.length > 4096) {
          return json({ error: "Chemin invalide." }, 400);
        }

        let info;
        try {
          info = await stat(rawPath);
        } catch {
          return json({ error: "Chemin introuvable." }, 404);
        }

        const isDirectory = info.isDirectory();
        const command = process.platform === "darwin"
          ? (isDirectory ? ["open", rawPath] : ["open", "-R", rawPath])
          : process.platform === "linux"
            ? ["xdg-open", isDirectory ? rawPath : rawPath.replace(/\/[^/]*$/, "") || rawPath]
            : null;

        if (!command) {
          return json({ error: "Ouverture du gestionnaire de fichiers non supportée." }, 501);
        }

        const proc = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          return json({ error: "Impossible d’ouvrir le gestionnaire de fichiers." }, 500);
        }

        return json({ ok: true });
      } catch (error) {
        return failed(error);
      }
    },
  },
});
