#[cfg(not(debug_assertions))]
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
#[cfg(not(debug_assertions))]
use std::io::{BufRead, BufReader, Read, Write};
#[cfg(not(debug_assertions))]
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
#[cfg(not(debug_assertions))]
use std::process::Command;
#[cfg(not(debug_assertions))]
use std::process::{Child, Stdio};
#[cfg(all(not(debug_assertions), target_os = "windows"))]
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(not(debug_assertions))]
use std::sync::Mutex;
use std::sync::RwLock;
use std::thread;
use std::time::Duration;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
#[cfg(not(debug_assertions))]
use tar::Archive;
use tauri_plugin_autostart::MacosLauncher;

pub mod scraper;

const WINDOW_MAIN: &str = "main";
const APP_NAVIGATE_EVENT: &str = "app:navigate";
const TRAY_ID: &str = "glanceus-tray";
const MENU_SHOW_WINDOW: &str = "tray.show_window";
const MENU_OPEN_INTEGRATIONS: &str = "tray.open_integrations";
const MENU_OPEN_SETTINGS: &str = "tray.open_settings";
const MENU_QUIT: &str = "tray.quit";
#[cfg(target_os = "macos")]
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/tray-icon-white.png");
#[cfg(target_os = "windows")]
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/icon-win.png");
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/icon.png");
const DEBUG_API_PORT: u16 = 8400;
#[cfg(not(debug_assertions))]
const RELEASE_API_PREFERRED_PORT: u16 = 18640;
#[cfg(not(debug_assertions))]
const WEB_MODE_HOST: &str = "127.0.0.1";
#[cfg(not(debug_assertions))]
const RELEASE_WEB_PREFERRED_PORT: u16 = 18641;
#[cfg(not(debug_assertions))]
const WEB_MODE_PROXY_TIMEOUT: Duration = Duration::from_secs(60);
#[cfg(not(debug_assertions))]
const MAX_WEB_MODE_REQUEST_HEADER_BYTES: usize = 64 * 1024;
#[cfg(not(debug_assertions))]
const MAX_WEB_MODE_REQUEST_BODY_BYTES: usize = 8 * 1024 * 1024;
#[cfg(not(debug_assertions))]
const BACKEND_BINARY_BASENAME: &str = "glanceus-server";
#[cfg(all(not(debug_assertions), target_os = "windows"))]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const DEVTOOLS_GUARD_INTERVAL: Duration = Duration::from_millis(80);

#[cfg(all(not(debug_assertions), target_os = "macos", target_arch = "aarch64"))]
const CURRENT_TARGET_TRIPLE: &str = "aarch64-apple-darwin";
#[cfg(all(not(debug_assertions), target_os = "macos", target_arch = "x86_64"))]
const CURRENT_TARGET_TRIPLE: &str = "x86_64-apple-darwin";
#[cfg(all(not(debug_assertions), target_os = "linux", target_arch = "x86_64"))]
const CURRENT_TARGET_TRIPLE: &str = "x86_64-unknown-linux-gnu";
#[cfg(all(not(debug_assertions), target_os = "linux", target_arch = "aarch64"))]
const CURRENT_TARGET_TRIPLE: &str = "aarch64-unknown-linux-gnu";
#[cfg(all(not(debug_assertions), target_os = "windows", target_arch = "x86_64"))]
const CURRENT_TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";
#[cfg(all(not(debug_assertions), target_os = "windows", target_arch = "aarch64"))]
const CURRENT_TARGET_TRIPLE: &str = "aarch64-pc-windows-msvc";

#[derive(Debug, Deserialize)]
struct PersistedSystemSettings {
    debug_logging_enabled: Option<bool>,
}

#[derive(Default)]
struct AppLifecycleState {
    quitting: AtomicBool,
}

#[derive(Default)]
struct RuntimeState {
    api_target_port: RwLock<u16>,
    web_mode_port: RwLock<Option<u16>>,
    #[cfg(not(debug_assertions))]
    backend_child: Mutex<Option<Child>>,
}

#[derive(Debug, Serialize)]
struct RuntimePortInfo {
    api_target_port: u16,
    web_mode_port: Option<u16>,
}

fn ensure_command_window(
    window: &tauri::Window,
    allowed_labels: &[&str],
    command_name: &str,
) -> Result<(), String> {
    let current = window.label();
    if allowed_labels.iter().any(|label| *label == current) {
        return Ok(());
    }
    Err(format!(
        "IPC denied for command '{}' from window '{}'",
        command_name, current
    ))
}

#[tauri::command]
fn set_autostart(
    window: tauri::Window,
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<(), String> {
    ensure_command_window(&window, &["main"], "set_autostart")?;
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    let current = autostart.is_enabled().map_err(|e| e.to_string())?;
    if current == enabled {
        return Ok(());
    }

    if enabled {
        autostart.enable().map_err(|e| e.to_string())
    } else {
        autostart.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn get_autostart(window: tauri::Window, app: tauri::AppHandle) -> Result<bool, String> {
    ensure_command_window(&window, &["main"], "get_autostart")?;
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn open_main_devtools(window: tauri::Window, app: tauri::AppHandle) -> Result<(), String> {
    ensure_command_window(&window, &["main"], "open_main_devtools")?;

    if !should_allow_devtools(&app) {
        return Err("Debug mode is disabled. Enable it in Settings > Advanced.".to_string());
    }

    let main_window = app
        .get_webview_window(WINDOW_MAIN)
        .ok_or_else(|| "Main window not found".to_string())?;
    main_window.open_devtools();
    Ok(())
}

#[tauri::command]
fn open_logs_folder(window: tauri::Window, app: tauri::AppHandle) -> Result<String, String> {
    ensure_command_window(&window, &["main"], "open_logs_folder")?;

    let log_dir = resolve_log_dir(&app);
    fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log directory: {e}"))?;
    open_path_in_file_manager(&log_dir)?;
    Ok(log_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn open_external_url(window: tauri::Window, url: String) -> Result<(), String> {
    ensure_command_window(&window, &["main"], "open_external_url")?;
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only http(s) URLs are allowed".to_string());
    }
    open_with_system_default(&url).map_err(|e| format!("Failed to open URL '{url}': {e}"))
}

#[tauri::command]
fn get_runtime_port_info(
    window: tauri::Window,
    app: tauri::AppHandle,
) -> Result<RuntimePortInfo, String> {
    ensure_command_window(&window, &["main"], "get_runtime_port_info")?;
    Ok(RuntimePortInfo {
        api_target_port: get_api_target_port(&app),
        web_mode_port: get_web_mode_port(&app),
    })
}

fn resolve_log_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Some(root) = resolve_data_root(app) {
        return root.join("logs");
    }
    app.path()
        .app_log_dir()
        .unwrap_or_else(|_| env::temp_dir().join("glanceus-logs"))
}

fn open_path_in_file_manager(path: &Path) -> Result<(), String> {
    let target = path.to_string_lossy();
    open_with_system_default(target.as_ref())
        .map_err(|e| format!("Failed to open folder '{}': {e}", path.display()))
}

fn open_with_system_default(target: &str) -> Result<(), String> {
    #[allow(deprecated)]
    tauri_plugin_shell::open::open(None, target, None).map_err(|e| e.to_string())
}

fn mark_quitting(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<AppLifecycleState>() {
        state.quitting.store(true, Ordering::Relaxed);
    }
}

fn is_quitting(app: &tauri::AppHandle) -> bool {
    app.try_state::<AppLifecycleState>()
        .map(|state| state.quitting.load(Ordering::Relaxed))
        .unwrap_or(false)
}

fn resolve_data_root(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok()
}

fn ensure_data_root_dirs(data_root: Option<&PathBuf>) {
    let Some(root) = data_root else {
        return;
    };
    let _ = fs::create_dir_all(root.join("data"));
    let _ = fs::create_dir_all(root.join("config").join("integrations"));
    let _ = fs::create_dir_all(root.join("logs"));
}

fn read_debug_logging_enabled(data_root: Option<&PathBuf>) -> bool {
    let Some(root) = data_root else {
        return false;
    };

    let settings_file = root.join("data").join("settings.json");
    let content = match fs::read_to_string(settings_file) {
        Ok(content) => content,
        Err(_) => return false,
    };

    serde_json::from_str::<PersistedSystemSettings>(&content)
        .ok()
        .and_then(|settings| settings.debug_logging_enabled)
        .unwrap_or(false)
}

fn should_allow_devtools(app: &tauri::AppHandle) -> bool {
    let data_root = resolve_data_root(app);
    read_debug_logging_enabled(data_root.as_ref())
}

fn enforce_devtools_policy(app: &tauri::AppHandle) {
    if should_allow_devtools(app) {
        return;
    }

    let Some(main_window) = app.get_webview_window(WINDOW_MAIN) else {
        return;
    };

    if main_window.is_devtools_open() {
        main_window.close_devtools();
    }
}

fn start_devtools_guard(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    thread::spawn(move || loop {
        enforce_devtools_policy(&app_handle);
        thread::sleep(DEVTOOLS_GUARD_INTERVAL);
    });
}

fn set_web_mode_port(app: &tauri::AppHandle, port: Option<u16>) {
    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.web_mode_port.write() {
            *guard = port;
        }
    }
}

fn set_api_target_port(app: &tauri::AppHandle, port: u16) {
    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.api_target_port.write() {
            *guard = port;
        }
    }
}

#[cfg(not(debug_assertions))]
fn set_backend_child(app: &tauri::AppHandle, child: Child) {
    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.backend_child.lock() {
            if let Some(mut previous) = guard.take() {
                let _ = previous.kill();
                let _ = previous.wait();
            }
            *guard = Some(child);
        }
    }
}

#[cfg(not(debug_assertions))]
fn terminate_backend_child(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.backend_child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    // Ensure no backend process remains bound to the API port after quit.
    let api_port = get_api_target_port(app);
    terminate_backend_by_port(api_port);
}

#[cfg(all(not(debug_assertions), unix))]
fn terminate_backend_by_port(port: u16) {
    let port_expr = format!("tcp:{port}");
    let kill_by_signal = |signal: &str| {
        let output = Command::new("lsof")
            .args(["-t", "-i", &port_expr])
            .output();
        let Ok(output) = output else {
            return;
        };

        let pids = String::from_utf8_lossy(&output.stdout);
        for pid in pids.lines() {
            let trimmed = pid.trim();
            if trimmed.is_empty() {
                continue;
            }
            let _ = Command::new("kill").args([signal, trimmed]).status();
        }
    };

    kill_by_signal("-TERM");
    thread::sleep(Duration::from_millis(220));
    kill_by_signal("-KILL");
}

#[cfg(all(not(debug_assertions), not(unix)))]
fn terminate_backend_by_port(_port: u16) {
}

#[cfg(not(debug_assertions))]
fn backend_entry_filename() -> &'static str {
    if cfg!(target_os = "windows") {
        "glanceus-server.exe"
    } else {
        BACKEND_BINARY_BASENAME
    }
}

#[cfg(not(debug_assertions))]
fn resolve_backend_archive_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("failed to resolve resource dir: {e}"))?;
    let archive_path = resource_dir
        .join("binaries")
        .join(format!("{BACKEND_BINARY_BASENAME}-{CURRENT_TARGET_TRIPLE}.tar.gz"));
    if !archive_path.is_file() {
        return Err(format!(
            "backend archive not found: {}",
            archive_path.display()
        ));
    }
    Ok(archive_path)
}

#[cfg(not(debug_assertions))]
fn backend_runtime_root(data_root: Option<&PathBuf>) -> PathBuf {
    if let Some(root) = data_root {
        root.join("runtime").join("backend").join(CURRENT_TARGET_TRIPLE)
    } else {
        env::temp_dir()
            .join("glanceus-runtime")
            .join("backend")
            .join(CURRENT_TARGET_TRIPLE)
    }
}

#[cfg(not(debug_assertions))]
fn backend_archive_fingerprint(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("failed to inspect backend archive '{}': {e}", path.display()))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    Ok(format!("{}-{modified}", metadata.len()))
}

#[cfg(not(debug_assertions))]
fn ensure_backend_bundle_dir(
    app: &tauri::AppHandle,
    data_root: Option<&PathBuf>,
) -> Result<PathBuf, String> {
    let archive_path = resolve_backend_archive_path(app)?;
    let runtime_root = backend_runtime_root(data_root);
    let bundle_dir = runtime_root.join(BACKEND_BINARY_BASENAME);
    let marker_file = runtime_root.join(".archive_fingerprint");
    let fingerprint = backend_archive_fingerprint(&archive_path)?;

    let should_reuse = bundle_dir.join(backend_entry_filename()).is_file()
        && marker_file.is_file()
        && fs::read_to_string(&marker_file)
            .ok()
            .map(|value| value.trim().to_string())
            == Some(fingerprint.clone());

    if !should_reuse {
        if runtime_root.exists() {
            fs::remove_dir_all(&runtime_root).map_err(|e| {
                format!(
                    "failed to clear backend runtime dir '{}': {e}",
                    runtime_root.display()
                )
            })?;
        }
        fs::create_dir_all(&runtime_root).map_err(|e| {
            format!(
                "failed to create backend runtime dir '{}': {e}",
                runtime_root.display()
            )
        })?;

        let archive_file = fs::File::open(&archive_path).map_err(|e| {
            format!(
                "failed to open backend archive '{}': {e}",
                archive_path.display()
            )
        })?;
        let decoder = GzDecoder::new(archive_file);
        let mut archive = Archive::new(decoder);
        archive.unpack(&runtime_root).map_err(|e| {
            format!(
                "failed to extract backend archive '{}' into '{}': {e}",
                archive_path.display(),
                runtime_root.display()
            )
        })?;

        fs::write(&marker_file, format!("{fingerprint}\n")).map_err(|e| {
            format!(
                "failed to persist backend runtime fingerprint '{}': {e}",
                marker_file.display()
            )
        })?;
    }

    let executable = bundle_dir.join(backend_entry_filename());
    if !executable.is_file() {
        return Err(format!(
            "backend executable missing after extraction: {}",
            executable.display()
        ));
    }

    Ok(bundle_dir)
}

#[cfg(not(debug_assertions))]
fn spawn_backend_process(
    app: &tauri::AppHandle,
    api_port: u16,
    data_root: Option<&PathBuf>,
) -> Result<Child, String> {
    let bundle_dir = ensure_backend_bundle_dir(app, data_root)?;
    let backend_executable = bundle_dir.join(backend_entry_filename());
    if !backend_executable.is_file() {
        return Err(format!(
            "backend executable not found: {}",
            backend_executable.display()
        ));
    }

    let mut command = Command::new(&backend_executable);
    command
        .arg(api_port.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(root) = data_root {
        command
            .env("GLANCEUS_DATA_DIR", root.as_os_str())
            .current_dir(root);
    } else {
        command.current_dir(&bundle_dir);
    }

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command.spawn().map_err(|e| {
        format!(
            "failed to spawn backend from '{}': {e}",
            backend_executable.display()
        )
    })?;

    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                match line {
                    Ok(content) => log::info!("[python-backend] {content}"),
                    Err(err) => {
                        log::warn!("[python-backend] failed to read stdout: {err}");
                        break;
                    }
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                match line {
                    Ok(content) => log::warn!("[python-backend] {content}"),
                    Err(err) => {
                        log::warn!("[python-backend] failed to read stderr: {err}");
                        break;
                    }
                }
            }
        });
    }

    Ok(child)
}

pub(crate) fn get_api_target_port(app: &tauri::AppHandle) -> u16 {
    let Some(state) = app.try_state::<RuntimeState>() else {
        return DEBUG_API_PORT;
    };
    let Ok(guard) = state.api_target_port.read() else {
        return DEBUG_API_PORT;
    };
    *guard
}

fn get_web_mode_port(app: &tauri::AppHandle) -> Option<u16> {
    let state = app.try_state::<RuntimeState>()?;
    let guard = state.web_mode_port.read().ok()?;
    *guard
}

fn init_log_plugin(
    app: &tauri::AppHandle,
    debug_enabled: bool,
    log_dir: &Path,
) -> tauri::Result<()> {
    let level = if debug_enabled {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    let targets = vec![
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
            path: log_dir.to_path_buf(),
            file_name: Some("glanceus".to_string()),
        }),
    ];

    app.plugin(
        tauri_plugin_log::Builder::default()
            .level(level)
            .targets(targets)
            .build(),
    )?;
    Ok(())
}

#[cfg(not(debug_assertions))]
struct ParsedHttpRequest {
    method: String,
    raw_path: String,
    version: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

#[cfg(not(debug_assertions))]
fn find_header_terminator(buffer: &[u8]) -> Option<usize> {
    buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
}

#[cfg(not(debug_assertions))]
fn parse_content_length(headers: &[(String, String)]) -> Result<usize, String> {
    let mut content_length: Option<usize> = None;

    for (name, value) in headers {
        if !name.eq_ignore_ascii_case("content-length") {
            continue;
        }
        let parsed = value
            .parse::<usize>()
            .map_err(|_| format!("invalid content-length: '{value}'"))?;
        if let Some(existing) = content_length {
            if existing != parsed {
                return Err("conflicting content-length headers".to_string());
            }
        }
        content_length = Some(parsed);
    }

    Ok(content_length.unwrap_or(0))
}

#[cfg(not(debug_assertions))]
fn parse_http_request(stream: &mut TcpStream) -> Result<ParsedHttpRequest, String> {
    let mut buffer: Vec<u8> = Vec::with_capacity(4096);
    let mut read_chunk = [0_u8; 4096];

    let header_end = loop {
        let n = stream
            .read(&mut read_chunk)
            .map_err(|e| format!("failed to read request: {e}"))?;
        if n == 0 {
            return Err("empty request".to_string());
        }
        buffer.extend_from_slice(&read_chunk[..n]);
        if let Some(end) = find_header_terminator(&buffer) {
            break end;
        }
        if buffer.len() > MAX_WEB_MODE_REQUEST_HEADER_BYTES {
            return Err("request headers exceed limit".to_string());
        }
    };

    let request_header = String::from_utf8_lossy(&buffer[..header_end]);
    let mut header_lines = request_header.split("\r\n");
    let request_line = header_lines
        .next()
        .ok_or_else(|| "missing request line".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| "missing method".to_string())?
        .to_string();
    let raw_path = parts
        .next()
        .ok_or_else(|| "missing path".to_string())?
        .to_string();
    let version = parts.next().unwrap_or("HTTP/1.1").to_string();
    if parts.next().is_some() {
        return Err("invalid request line".to_string());
    }

    let mut headers: Vec<(String, String)> = Vec::new();
    for line in header_lines {
        if line.is_empty() {
            continue;
        }
        let (name, value) = line
            .split_once(':')
            .ok_or_else(|| format!("invalid header line: '{line}'"))?;
        let name = name.trim();
        let value = value.trim();
        if name.is_empty() {
            return Err("header name must not be empty".to_string());
        }
        if name.eq_ignore_ascii_case("transfer-encoding")
            && !value.is_empty()
            && !value.eq_ignore_ascii_case("identity")
        {
            return Err("transfer-encoding request is not supported".to_string());
        }
        headers.push((name.to_string(), value.to_string()));
    }

    let content_length = parse_content_length(&headers)?;
    if content_length > MAX_WEB_MODE_REQUEST_BODY_BYTES {
        return Err("request body exceeds limit".to_string());
    }

    let mut body: Vec<u8> = Vec::with_capacity(content_length);
    if buffer.len() > header_end {
        let already_read = (buffer.len() - header_end).min(content_length);
        body.extend_from_slice(&buffer[header_end..(header_end + already_read)]);
    }

    while body.len() < content_length {
        let n = stream
            .read(&mut read_chunk)
            .map_err(|e| format!("failed to read request body: {e}"))?;
        if n == 0 {
            return Err("request body truncated".to_string());
        }
        let remaining = content_length - body.len();
        let copy_len = n.min(remaining);
        body.extend_from_slice(&read_chunk[..copy_len]);
    }

    Ok(ParsedHttpRequest {
        method,
        raw_path,
        version,
        headers,
        body,
    })
}

#[cfg(not(debug_assertions))]
fn is_hop_by_hop_header(name: &str) -> bool {
    name.eq_ignore_ascii_case("connection")
        || name.eq_ignore_ascii_case("proxy-connection")
        || name.eq_ignore_ascii_case("keep-alive")
        || name.eq_ignore_ascii_case("proxy-authenticate")
        || name.eq_ignore_ascii_case("proxy-authorization")
        || name.eq_ignore_ascii_case("te")
        || name.eq_ignore_ascii_case("trailer")
        || name.eq_ignore_ascii_case("transfer-encoding")
        || name.eq_ignore_ascii_case("upgrade")
}

#[cfg(not(debug_assertions))]
fn proxy_api_request(
    client_stream: &mut TcpStream,
    app: &tauri::AppHandle,
    request: ParsedHttpRequest,
) {
    let api_port = get_api_target_port(app);
    let mut backend_stream = match TcpStream::connect((WEB_MODE_HOST, api_port)) {
        Ok(stream) => stream,
        Err(err) => {
            log::warn!("web mode proxy connect failed (port={api_port}): {err}");
            write_http_response(
                client_stream,
                "502 Bad Gateway",
                "text/plain; charset=utf-8",
                b"Bad Gateway",
                false,
            );
            return;
        }
    };

    let _ = backend_stream.set_read_timeout(Some(WEB_MODE_PROXY_TIMEOUT));
    let _ = backend_stream.set_write_timeout(Some(WEB_MODE_PROXY_TIMEOUT));

    let mut outbound_request: Vec<u8> = Vec::new();
    outbound_request.extend_from_slice(
        format!(
            "{} {} {}\r\n",
            request.method, request.raw_path, request.version
        )
        .as_bytes(),
    );

    let mut has_content_length = false;
    for (name, value) in &request.headers {
        if name.eq_ignore_ascii_case("host") || is_hop_by_hop_header(name) {
            continue;
        }
        if name.eq_ignore_ascii_case("content-length") {
            has_content_length = true;
        }
        outbound_request.extend_from_slice(name.as_bytes());
        outbound_request.extend_from_slice(b": ");
        outbound_request.extend_from_slice(value.as_bytes());
        outbound_request.extend_from_slice(b"\r\n");
    }

    outbound_request.extend_from_slice(format!("Host: {WEB_MODE_HOST}:{api_port}\r\n").as_bytes());
    outbound_request.extend_from_slice(b"Connection: close\r\n");
    if !request.body.is_empty() && !has_content_length {
        outbound_request
            .extend_from_slice(format!("Content-Length: {}\r\n", request.body.len()).as_bytes());
    }
    outbound_request.extend_from_slice(b"\r\n");
    outbound_request.extend_from_slice(&request.body);

    if let Err(err) = backend_stream.write_all(&outbound_request) {
        log::warn!("web mode proxy write failed: {err}");
        write_http_response(
            client_stream,
            "502 Bad Gateway",
            "text/plain; charset=utf-8",
            b"Bad Gateway",
            false,
        );
        return;
    }
    let _ = backend_stream.flush();
    let _ = backend_stream.shutdown(Shutdown::Write);

    if let Err(err) = std::io::copy(&mut backend_stream, client_stream) {
        log::warn!("web mode proxy read failed: {err}");
    }
    let _ = client_stream.flush();
}

#[cfg(not(debug_assertions))]
fn write_http_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &[u8],
    head_only: bool,
) {
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    if !head_only {
        let _ = stream.write_all(body);
    }
    let _ = stream.flush();
}

#[cfg(not(debug_assertions))]
fn resolve_asset_path(raw_path: &str) -> String {
    let path = raw_path.trim_start_matches('/');
    if path.is_empty() {
        "index.html".to_string()
    } else {
        path.to_string()
    }
}

#[cfg(not(debug_assertions))]
fn resolve_web_asset(app: &tauri::AppHandle, request_path: &str) -> Option<tauri::Asset> {
    let asset_path = resolve_asset_path(request_path);
    let resolver = app.asset_resolver();
    if let Some(asset) = resolver.get(asset_path.clone()) {
        return Some(asset);
    }

    // Fallback to SPA entry only for route-like paths.
    let route_like = asset_path == "index.html" || !asset_path.contains('.');
    if route_like {
        return resolver.get("index.html".to_string());
    }
    None
}

#[cfg(not(debug_assertions))]
fn handle_web_mode_client(mut stream: TcpStream, app: &tauri::AppHandle) {
    let request = match parse_http_request(&mut stream) {
        Ok(request) => request,
        Err(err) => {
            log::warn!("web mode parse request failed: {err}");
            write_http_response(
                &mut stream,
                "400 Bad Request",
                "text/plain; charset=utf-8",
                b"Bad Request",
                false,
            );
            return;
        }
    };

    let request_path = request.raw_path.split('?').next().unwrap_or("/");
    if request_path.starts_with("/api") {
        proxy_api_request(&mut stream, app, request);
        return;
    }

    let head_only = request.method.eq_ignore_ascii_case("HEAD");
    if !request.method.eq_ignore_ascii_case("GET") && !head_only {
        let body = b"Method Not Allowed";
        write_http_response(
            &mut stream,
            "405 Method Not Allowed",
            "text/plain; charset=utf-8",
            body,
            false,
        );
        return;
    }

    if request_path.contains("..") {
        let body = b"Forbidden";
        write_http_response(
            &mut stream,
            "403 Forbidden",
            "text/plain; charset=utf-8",
            body,
            head_only,
        );
        return;
    }

    if let Some(asset) = resolve_web_asset(app, request_path) {
        write_http_response(
            &mut stream,
            "200 OK",
            asset.mime_type(),
            asset.bytes(),
            head_only,
        );
        return;
    }

    let body = b"Not Found";
    write_http_response(
        &mut stream,
        "404 Not Found",
        "text/plain; charset=utf-8",
        body,
        head_only,
    );
}

#[cfg(not(debug_assertions))]
fn bind_with_fallback(preferred: u16) -> Option<TcpListener> {
    TcpListener::bind((WEB_MODE_HOST, preferred))
        .or_else(|_| TcpListener::bind((WEB_MODE_HOST, 0)))
        .ok()
}

#[cfg(not(debug_assertions))]
fn find_available_port(preferred: u16) -> u16 {
    bind_with_fallback(preferred)
        .and_then(|listener| listener.local_addr().ok().map(|addr| addr.port()))
        .unwrap_or(preferred)
}

#[cfg(not(debug_assertions))]
fn start_web_mode_server(app: &tauri::AppHandle, preferred_port: u16) -> Option<u16> {
    let listener = bind_with_fallback(preferred_port)?;
    let port = listener.local_addr().ok()?.port();
    let app_handle = app.clone();

    thread::spawn(move || {
        for stream in listener.incoming() {
            match stream {
                Ok(stream) => handle_web_mode_client(stream, &app_handle),
                Err(err) => {
                    log::warn!("web mode server accept failed: {err}");
                    break;
                }
            }
        }
    });

    Some(port)
}

fn show_main_window(app: &tauri::AppHandle, route: Option<&str>) -> Result<(), String> {
    // Switch to Regular activation policy when showing window
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    }

    let window = app
        .get_webview_window(WINDOW_MAIN)
        .ok_or_else(|| "Main window not found".to_string())?;

    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }

    if !window.is_visible().unwrap_or(false) {
        window.show().map_err(|e| e.to_string())?;
    }

    window.set_focus().map_err(|e| e.to_string())?;

    if let Some(route) = route {
        app.emit(APP_NAVIGATE_EVENT, route.to_string())
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn handle_tray_menu_action(app: &tauri::AppHandle, menu_id: &str) {
    match menu_id {
        MENU_SHOW_WINDOW => {
            let _ = show_main_window(app, None);
        }
        MENU_OPEN_INTEGRATIONS => {
            let _ = show_main_window(app, Some("/integrations"));
        }
        MENU_OPEN_SETTINGS => {
            let _ = show_main_window(app, Some("/settings"));
        }
        MENU_QUIT => {
            #[cfg(not(debug_assertions))]
            terminate_backend_child(app);
            mark_quitting(app);
            app.exit(0);
        }
        _ => {}
    }
}

fn create_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show_window = MenuItemBuilder::with_id(MENU_SHOW_WINDOW, "显示窗口").build(app)?;
    let open_integrations =
        MenuItemBuilder::with_id(MENU_OPEN_INTEGRATIONS, "集成管理").build(app)?;
    let open_settings = MenuItemBuilder::with_id(MENU_OPEN_SETTINGS, "设置").build(app)?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT, "退出").build(app)?;

    let tray_menu = MenuBuilder::new(app)
        .items(&[&show_window, &open_integrations, &open_settings])
        .separator()
        .item(&quit)
        .build()?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&tray_menu)
        .tooltip("Glanceus")
        .on_menu_event(|app, event| {
            handle_tray_menu_action(app, event.id().as_ref());
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                let _ = show_main_window(tray.app_handle(), None);
            }
            TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => {
                let _ = show_main_window(tray.app_handle(), None);
            }
            _ => {}
        });

    #[cfg(target_os = "macos")]
    {
        tray_builder = tray_builder.icon_as_template(true);
    }

    if let Ok(icon) = tauri::image::Image::from_bytes(TRAY_ICON_BYTES) {
        tray_builder = tray_builder.icon(icon);
    } else if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(AppLifecycleState::default())
        .manage(RuntimeState::default())
        .manage(scraper::ScraperState::default())
        .invoke_handler(tauri::generate_handler![
            scraper::push_scraper_task,
            scraper::handle_scraped_data,
            scraper::handle_scraper_auth,
            scraper::show_scraper_window,
            scraper::cancel_scraper_task,
            scraper::scraper_log,
            scraper::get_scraper_error_logs,
            set_autostart,
            get_autostart,
            open_main_devtools,
            open_logs_folder,
            open_external_url,
            get_runtime_port_info
        ])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = show_main_window(app, None);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .on_window_event(|window, event| {
            if window.label() != WINDOW_MAIN {
                return;
            }
            if let tauri::WindowEvent::Focused(_) = event {
                enforce_devtools_policy(&window.app_handle());
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if is_quitting(&window.app_handle()) {
                    return;
                }
                api.prevent_close();
                let _ = window.hide();

                // Switch to Accessory activation policy when window is hidden
                #[cfg(target_os = "macos")]
                {
                    let _ = window
                        .app_handle()
                        .set_activation_policy(tauri::ActivationPolicy::Accessory);
                }
            }
        })
        .setup(|app| {
            let data_root = resolve_data_root(&app.handle());
            ensure_data_root_dirs(data_root.as_ref());
            let log_dir = resolve_log_dir(&app.handle());
            let _ = fs::create_dir_all(&log_dir);

            let debug_logging_enabled =
                cfg!(debug_assertions) || read_debug_logging_enabled(data_root.as_ref());
            init_log_plugin(&app.handle(), debug_logging_enabled, &log_dir)?;

            #[cfg(debug_assertions)]
            {
                set_api_target_port(&app.handle(), DEBUG_API_PORT);
            }

            start_devtools_guard(&app.handle());
            create_tray(&app.handle())?;

            // Development mode: skip backend process; user starts Python backend manually
            // Production mode: start packaged Python backend under resources/binaries
            #[cfg(not(debug_assertions))]
            {
                let api_port = find_available_port(RELEASE_API_PREFERRED_PORT);
                set_api_target_port(&app.handle(), api_port);
                if api_port == RELEASE_API_PREFERRED_PORT {
                    log::info!("api target available on preferred port {api_port}");
                } else {
                    log::warn!(
                        "api preferred port {} is occupied, fallback to {}",
                        RELEASE_API_PREFERRED_PORT,
                        api_port
                    );
                }

                let web_mode_port =
                    start_web_mode_server(&app.handle(), RELEASE_WEB_PREFERRED_PORT);
                set_web_mode_port(&app.handle(), web_mode_port);
                if let Some(port) = web_mode_port {
                    if port == RELEASE_WEB_PREFERRED_PORT {
                        log::info!("web mode available at http://{WEB_MODE_HOST}:{port}");
                    } else {
                        log::warn!(
                            "web mode preferred port {} is occupied, fallback to {}",
                            RELEASE_WEB_PREFERRED_PORT,
                            port
                        );
                    }
                } else {
                    log::warn!("web mode port exposure skipped: failed to bind listener");
                }

                let child = spawn_backend_process(&app.handle(), api_port, data_root.as_ref())
                    .map_err(std::io::Error::other)?;
                set_backend_child(&app.handle(), child);
            }
            #[cfg(debug_assertions)]
            {
                set_web_mode_port(&app.handle(), None);
            }

            scraper::start_scraper_daemon(&app.handle());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        #[cfg(not(debug_assertions))]
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            terminate_backend_child(app);
        }

        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            let _ = show_main_window(app, None);
        }
    });
}
