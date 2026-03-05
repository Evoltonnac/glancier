use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_autostart::MacosLauncher;

pub mod scraper;

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())
    } else {
        autostart.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(scraper::ScraperState::default())
        .invoke_handler(tauri::generate_handler![
            scraper::push_scraper_task,
            scraper::handle_scraped_data,
            scraper::handle_scraper_auth,
            scraper::show_scraper_window,
            scraper::cancel_scraper_task,
            scraper::scraper_log,
            set_autostart,
            get_autostart
        ])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // 开发模式：跳过 sidecar，由用户手动启动 Python 后端
            // 生产模式：启动编译后的 Python 二进制 sidecar
            #[cfg(not(debug_assertions))]
            {
                let sidecar_command = app
                    .shell()
                    .sidecar("quota-board-server")
                    .expect("failed to create sidecar command");

                let (mut _rx, _child) = sidecar_command
                    .spawn()
                    .expect("failed to spawn python backend");

                // 监听 sidecar 输出
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = _rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                log::info!("[python-backend] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                log::warn!("[python-backend] {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Terminated(status) => {
                                log::error!("[python-backend] terminated with {:?}", status);
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

