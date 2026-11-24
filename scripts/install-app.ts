// Construit l'app macOS et l'installe dans /Applications en remplaçant l'ancienne version.
//
//   bun run install-app            # build + installation + relance
//   bun run install-app --no-build # réinstalle le dernier build sans recompiler
//   bun run install-app --no-open  # n'ouvre pas l'app à la fin
//
// Sécurités : le build doit réussir et porter la version de package.json avant de toucher à quoi que ce soit ;
// l'ancienne app est mise de côté dans src-tauri/target/app-backups (les 2 dernières sont gardées) ; on n'arrête jamais l'app de force ; seul le cache HTTP du
// webview est vidé (pas les réglages ni le stockage local).
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "..");
const bundle = path.join(root, "src-tauri/target/release/bundle/macos/getaroom.app");
const target = "/Applications/getaroom.app";
const bundleId = "paris.mauve.getaroom";
const backups = path.join(root, "src-tauri/target/app-backups");
const KEEP_BACKUPS = 2;
const args = new Set(process.argv.slice(2));

// Lancé depuis une app GUI, le PATH est minimal : on ajoute les dossiers où vivent cargo, bun, etc.
const extraDirs = [".cargo/bin", ".bun/bin", ".local/bin"].map((dir) => path.join(homedir(), dir)).concat(["/opt/homebrew/bin", "/usr/local/bin"]);
const env = { ...process.env, PATH: [...extraDirs, process.env.PATH ?? ""].join(":") };

const step = (message: string) => console.log(`\n▸ ${message}`);
const fail = (message: string): never => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

async function plistVersion(app: string): Promise<string | null> {
  const result = await $`/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" ${path.join(app, "Contents/Info.plist")}`.quiet().nothrow();
  return result.exitCode === 0 ? result.text().trim() : null;
}

async function isRunning(): Promise<boolean> {
  return (await $`pgrep -f ${target + "/Contents/MacOS/getaroom"}`.quiet().nothrow()).exitCode === 0;
}

const pkg = await Bun.file(path.join(root, "package.json")).json();
const version: string = pkg.version;

if (!args.has("--no-build")) {
  step(`Build de getaroom ${version} (plusieurs minutes la première fois)`);
  const build = await $`bun run tauri:build --bundles app`.cwd(root).env(env).nothrow();
  if (build.exitCode !== 0) fail("Le build a échoué : rien n'a été modifié dans /Applications.");
}

if (!existsSync(bundle)) fail(`App construite introuvable : ${bundle}`);
const built = await plistVersion(bundle);
if (built !== version) fail(`Le build est en ${built ?? "version inconnue"} mais package.json est en ${version} : rien n'a été modifié.`);
console.log(`✔ Build ${built} prêt`);

// Vérifie qu'on peut écrire dans /Applications et dans le dossier de sauvegarde AVANT de fermer l'app.
mkdirSync(backups, { recursive: true });
const probe = await $`touch ${path.join("/Applications", ".getaroom-install-probe")}`.quiet().nothrow();
if (probe.exitCode !== 0) fail("Impossible d'écrire dans /Applications (droits macOS) : rien n'a été modifié.");
await $`rm -f ${path.join("/Applications", ".getaroom-install-probe")}`.quiet().nothrow();

step("Arrêt de l'app en cours (si elle tourne)");
if (await isRunning()) {
  await $`osascript -e ${`tell application id "${bundleId}" to quit`}`.quiet().nothrow();
  for (let waited = 0; waited < 20_000 && (await isRunning()); waited += 500) await Bun.sleep(500);
  if (await isRunning()) fail("L'app ne s'est pas fermée d'elle-même (travail en cours ?). Ferme-la puis relance cette commande.");
}

step("Remplacement dans /Applications");
if (existsSync(target)) {
  const previous = (await plistVersion(target)) ?? "ancienne";
  const backup = path.join(backups, `getaroom-${previous}-${Date.now()}.app`);
  await $`mv ${target} ${backup}`;
  console.log(`✔ Ancienne version ${previous} sauvegardée : ${path.relative(root, backup)}`);
  // On ne garde que les plus récentes sauvegardes (ce sont nos propres copies, dans le dossier de build).
  const old = readdirSync(backups).filter((name) => name.endsWith(".app")).map((name) => ({ name, time: statSync(path.join(backups, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time).slice(KEEP_BACKUPS);
  for (const entry of old) rmSync(path.join(backups, entry.name), { recursive: true, force: true });
}
await $`ditto ${bundle} ${target}`;
await $`xattr -dr com.apple.quarantine ${target}`.quiet().nothrow();
const installed = await plistVersion(target);
if (installed !== version) fail(`Installation vérifiée en ${installed}, attendu ${version}.`);
console.log(`✔ getaroom ${installed} installée`);

step("Vidage du cache web (évite d'afficher une ancienne version)");
await $`rm -rf ${path.join(homedir(), "Library/Caches", bundleId, "WebKit/NetworkCache")}`.quiet().nothrow();

if (!args.has("--no-open")) {
  step("Lancement");
  await $`open ${target}`;
}
console.log(`\n✔ Terminé : getaroom ${version}.`);
