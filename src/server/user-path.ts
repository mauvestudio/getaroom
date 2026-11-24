import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Lancée depuis le Finder, une app macOS hérite d'un PATH minimal (/usr/bin:/bin:/usr/sbin:/sbin) :
 * les CLI installées par l'utilisateur (claude, codex, opencode…) sont alors introuvables.
 * On complète le PATH avec les dossiers usuels, sans jamais passer devant ceux déjà présents.
 */
export interface PathDeps {
  exists: (target: string) => boolean;
  list: (dir: string) => string[];
}

const defaultDeps: PathDeps = {
  exists: (target) => existsSync(target),
  list: (dir) => {
    try { return readdirSync(dir); } catch { return []; }
  },
};

/** Compare des versions « v22.1.0 » de la plus récente à la plus ancienne. */
function byVersionDesc(a: string, b: string): number {
  const parts = (value: string) => value.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Dossiers candidats, du plus spécifique au plus générique (aucun test d'existence ici). */
export function candidateBinDirs(home: string, deps: Pick<PathDeps, "list"> = defaultDeps): string[] {
  const nvmRoot = path.join(home, ".nvm", "versions", "node");
  const nvm = deps.list(nvmRoot).sort(byVersionDesc).map((version) => path.join(nvmRoot, version, "bin"));
  return [
    path.join(home, ".local", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".opencode", "bin"),
    path.join(home, ".claude", "local"),
    path.join(home, ".cargo", "bin"),
    path.join(home, ".volta", "bin"),
    path.join(home, ".npm-global", "bin"),
    ...nvm,
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
  ];
}

export interface EnrichedPath {
  path: string;
  /** Dossiers ajoutés (existants et absents du PATH d'origine). */
  added: string[];
}

export function enrichPath(
  current: string | undefined,
  home: string = homedir(),
  deps: PathDeps = defaultDeps,
): EnrichedPath {
  const sep = path.delimiter;
  const existing = (current ?? "").split(sep).filter(Boolean);
  const seen = new Set(existing);
  const added: string[] = [];
  for (const dir of candidateBinDirs(home, deps)) {
    if (seen.has(dir) || !deps.exists(dir)) continue;
    seen.add(dir);
    added.push(dir);
  }
  return { path: [...existing, ...added].join(sep), added };
}

/** Premier exécutable `name` trouvé dans `searchPath`, ou null. */
export function findBinary(name: string, searchPath: string, exists: (target: string) => boolean = existsSync): string | null {
  for (const dir of searchPath.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, name);
    if (exists(candidate)) return candidate;
  }
  return null;
}

/** Environnement à donner aux processus enfants (daemon, CLI) avec le PATH complété. */
export function childEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...base, PATH: enrichPath(base.PATH).path };
}
