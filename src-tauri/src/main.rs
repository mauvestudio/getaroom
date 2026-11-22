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
