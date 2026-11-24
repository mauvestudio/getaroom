use std::net::{SocketAddr, TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Port historique : le garder tant qu'il est libre préserve l'origine web
/// (donc le localStorage : réglages, hôtes, mode…) d'un lancement à l'autre.
const PREFERRED_PORT: u16 = 5555;

struct RelayChild(Mutex<Option<CommandChild>>);

static EXITING: AtomicBool = AtomicBool::new(false);

/// Lancée depuis le Finder, l'app hérite d'un PATH minimal (/usr/bin:/bin…) : les CLI installées par
/// l'utilisateur (claude, codex, opencode…) sont alors introuvables pour le démon Paseo.
/// On complète le PATH avec les dossiers usuels qui existent, sans passer devant ceux déjà présents.
fn enriched_path(home: &std::path::Path, current: &str) -> String {
    let mut entries: Vec<std::path::PathBuf> = std::env::split_paths(current).collect();
    let mut candidates: Vec<std::path::PathBuf> = [".local/bin", ".bun/bin", ".opencode/bin", ".claude/local", ".cargo/bin", ".volta/bin", ".npm-global/bin"]
        .iter()
        .map(|dir| home.join(dir))
        .collect();
    // nvm : versions installées, la plus récente d'abord.
    let nvm_root = home.join(".nvm/versions/node");
    if let Ok(read) = std::fs::read_dir(&nvm_root) {
        let mut versions: Vec<String> = read.flatten().filter_map(|entry| entry.file_name().into_string().ok()).collect();
        let key = |name: &str| -> Vec<u64> { name.trim_start_matches('v').split('.').map(|part| part.parse().unwrap_or(0)).collect() };
        versions.sort_by(|a, b| key(b).cmp(&key(a)));
        candidates.extend(versions.into_iter().map(|version| nvm_root.join(version).join("bin")));
    }
    candidates.extend(["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin"].iter().map(std::path::PathBuf::from));
    for dir in candidates {
        if dir.is_dir() && !entries.contains(&dir) {
            entries.push(dir);
        }
    }
    std::env::join_paths(entries).map(|joined| joined.to_string_lossy().into_owned()).unwrap_or_else(|_| current.to_string())
}

fn user_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    match std::env::var_os("HOME") {
        Some(home) => enriched_path(std::path::Path::new(&home), &current),
        None => current,
    }
}

/// Start Paseo's own background supervisor with its existing local profile.
/// The daemon is shared with other clients and outlives this window.
#[cfg(target_os = "macos")]
fn start_local_paseo_if_needed() {
    if ["PASEO_DAEMON_WS_URL", "PASEO_DAEMON_URL", "PASEO_WS_URL", "PASEO_URL", "PASEO_PORT"]
        .iter()
        .any(|key| std::env::var(key).is_ok_and(|value| !value.trim().is_empty()))
    {
        return;
    }
    // Veille : si Paseo.app est quitté, son daemon (enfant du superviseur de l'app) s'arrête avec lui.
    // On le relance dès que le port 6767 ne répond plus, pour que getaroom reste connecté.
    thread::spawn(|| {
        let address: SocketAddr = ([127, 0, 0, 1], 6767).into();
        let mut failures = 0u32;
        while !EXITING.load(Ordering::SeqCst) {
            if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
                failures = 0;
                thread::sleep(Duration::from_secs(3));
                continue;
            }
            let bundled_cli = "/Applications/Paseo.app/Contents/Resources/bin/paseo";
            let cli = if std::path::Path::new(bundled_cli).is_file() { bundled_cli } else { "paseo" };
            match Command::new(cli)
                .env("PATH", user_path())
                .args(["daemon", "start", "--timeout", "15"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
            {
                Ok(status) if status.success() => failures = 0,
                result => {
                    failures = failures.saturating_add(1);
                    eprintln!("[getaroom] Impossible de démarrer le daemon Paseo : {result:?}");
                }
            }
            // Recul progressif (3 s → 30 s) si le démarrage échoue en boucle.
            thread::sleep(Duration::from_secs((3 * (1 + u64::from(failures))).min(30)));
        }
    });
}

fn pick_port() -> Result<u16, String> {
    for candidate in [PREFERRED_PORT, 0] {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", candidate)) {
            if let Ok(address) = listener.local_addr() {
                return Ok(address.port());
            }
        }
    }
    Err("Aucun port local disponible pour le relais Paseo.".into())
}

fn wait_for_relay(port: u16) -> Result<(), String> {
    let address: SocketAddr = ([127, 0, 0, 1], port).into();
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(80));
    }
    Err("Le relais Paseo local n'a pas démarré dans le délai imparti.".into())
}

/// Boîte de dialogue native sans dépendance supplémentaire.
fn show_fatal_dialog(message: &str) {
    let escaped = message.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "display dialog \"{escaped}\" with title \"getaroom\" buttons {{\"Quitter\"}} default button \"Quitter\" with icon stop"
    );
    let _ = Command::new("osascript").args(["-e", &script]).status();
}

fn fatal(message: &str) -> ! {
    eprintln!("[getaroom] {message}");
    show_fatal_dialog(message);
    std::process::exit(1);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&data_dir, std::fs::Permissions::from_mode(0o700))?;
            }

            let port = pick_port().unwrap_or_else(|error| fatal(&error));
            #[cfg(target_os = "macos")]
            start_local_paseo_if_needed();
            let (mut events, child) = app
                .shell()
                .sidecar("getaroom-relay")?
                .env("GETAROOM_DATA_DIR", &data_dir)
                .env("GETAROOM_LOOPBACK_ONLY", "1")
                .env("GETAROOM_PARENT_PID", std::process::id().to_string())
                .env("PATH", user_path())
                .args(["--host", "127.0.0.1", "--port", &port.to_string()])
                .spawn()?;
            app.manage(RelayChild(Mutex::new(Some(child))));

            // Si le relais meurt pendant la session, l'interface devient muette :
            // on le dit clairement plutôt que de laisser un écran figé.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = events.recv().await {
                    if let CommandEvent::Terminated(payload) = event {
                        if !EXITING.load(Ordering::SeqCst) {
                            let code = payload.code.map(|c| c.to_string()).unwrap_or_else(|| "inconnu".into());
                            show_fatal_dialog(&format!(
                                "Le relais Paseo local s'est arrêté (code {code}). getaroom va se fermer ; relance l'application."
                            ));
                            handle.exit(1);
                        }
                        break;
                    }
                }
            });

            wait_for_relay(port).unwrap_or_else(|error| fatal(&error));

            let url = format!("http://127.0.0.1:{port}")
                .parse()
                .map_err(|_| std::io::Error::other("URL du relais invalide"))?;
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("getaroom")
                .inner_size(1480.0, 940.0)
                .min_inner_size(900.0, 640.0);
            #[cfg(target_os = "macos")]
            let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
            builder.build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|error| fatal(&format!("Erreur pendant le démarrage de getaroom : {error}")))
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                EXITING.store(true, Ordering::SeqCst);
            }
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(relay) = app.try_state::<RelayChild>() {
                    if let Some(child) = relay.0.lock().expect("verrou sidecar").take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}

fn main() {
    run();
}

#[cfg(test)]
mod tests {
    use super::enriched_path;
    use std::fs;

    fn temp_home(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("getaroom-path-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn adds_existing_user_dirs_after_the_current_path() {
        let home = temp_home("add");
        fs::create_dir_all(home.join(".local/bin")).unwrap();
        fs::create_dir_all(home.join(".bun/bin")).unwrap();
        let path = enriched_path(&home, "/usr/bin:/bin");
        assert!(path.starts_with("/usr/bin:/bin:"));
        assert!(path.contains(&home.join(".local/bin").to_string_lossy().to_string()));
        assert!(path.contains(&home.join(".bun/bin").to_string_lossy().to_string()));
        assert!(!path.contains(".opencode"));
        let _ = fs::remove_dir_all(home);
    }

    #[test]
    fn does_not_duplicate_and_prefers_newest_nvm() {
        let home = temp_home("nvm");
        fs::create_dir_all(home.join(".local/bin")).unwrap();
        fs::create_dir_all(home.join(".nvm/versions/node/v20.1.0/bin")).unwrap();
        fs::create_dir_all(home.join(".nvm/versions/node/v22.4.0/bin")).unwrap();
        let local = home.join(".local/bin").to_string_lossy().to_string();
        let path = enriched_path(&home, &format!("{local}:/usr/bin"));
        assert_eq!(path.matches(&local).count(), 1);
        assert!(path.find("v22.4.0").unwrap() < path.find("v20.1.0").unwrap());
        let _ = fs::remove_dir_all(home);
    }
}
