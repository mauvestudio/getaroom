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

/** Extrait la valeur encadrée par `mark` dans la sortie d'un shell (ignore le bruit des rc files). */
export function extractMarked(output: string, mark: string): string | null {
  const start = output.indexOf(mark);
  if (start < 0) return null;
  const from = start + mark.length;
  const end = output.indexOf(mark, from);
  if (end < 0) return null;
  const value = output.slice(from, end).trim();
  return value || null;
}

/** Ajoute à `base` les dossiers de `extra` absents, sans changer l'ordre existant. */
export function mergePaths(base: string | undefined, extra: string | undefined): string {
  const result = (base ?? "").split(path.delimiter).filter(Boolean);
  for (const dir of (extra ?? "").split(path.delimiter).filter(Boolean)) if (!result.includes(dir)) result.push(dir);
  return result.join(path.delimiter);
}

let loginPathPromise: Promise<string | null> | null = null;

/**
 * PATH du shell de connexion (comme `inheritLoginShellEnv` de Paseo) : `$SHELL -i -l -c`, puis repli
 * non interactif, chaque tentative coupée après `timeoutMs`. Résultat mis en cache pour la durée du processus.
 */
export function loginShellPath(timeoutMs = 10_000): Promise<string | null> {
  if (process.platform === "win32") return Promise.resolve(null);
  loginPathPromise ??= (async () => {
    const shell = process.env.SHELL || "/bin/zsh";
    const mark = `gar${process.pid}x`;
    const script = `printf '%s' "${mark}$PATH${mark}"`;
    for (const flags of [["-i", "-l", "-c"], ["-l", "-c"]]) {
      try {
        const proc = Bun.spawn([shell, ...flags, script], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
        const timer = setTimeout(() => proc.kill(), timeoutMs);
        const output = await new Response(proc.stdout).text();
        clearTimeout(timer);
        const found = extractMarked(output, mark);
        if (found) return found;
      } catch {
        // essaie la tentative suivante
      }
    }
    return null;
  })();
  return loginPathPromise;
}

/** Environnement complet pour lancer le démon : PATH du processus + dossiers usuels + shell de connexion. */
export async function daemonEnv(base: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  const login = await loginShellPath();
  return { ...base, PATH: mergePaths(enrichPath(base.PATH).path, login ?? "") };
}
