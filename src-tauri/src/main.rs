use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct RelayChild(Mutex<Option<CommandChild>>);

fn wait_for_relay() -> Result<(), String> {
    let address: SocketAddr = "127.0.0.1:5555".parse().expect("adresse valide");
    let deadline = Instant::now() + Duration::from_secs(12);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("Le relais Paseo local n'a pas démarré dans le délai imparti.".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&data_dir, std::fs::Permissions::from_mode(0o700))?;
            }
            let (_events, child) = app
                .shell()
                .sidecar("getaroom-relay")?
                .env("GETAROOM_DATA_DIR", &data_dir)
                .args(["--host", "127.0.0.1", "--port", "5555"])
                .spawn()?;
            app.manage(RelayChild(Mutex::new(Some(child))));
            wait_for_relay().map_err(std::io::Error::other)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erreur pendant le démarrage de getaroom")
        .run(|app, event| {
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
