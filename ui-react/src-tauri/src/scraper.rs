use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Emitter;
use tauri::{AppHandle, Manager, Window};

const MAX_LOG_MESSAGE_CHARS: usize = 800;
const MAX_CONSECUTIVE_DUPLICATE_LOGS: usize = 3;
const LOG_BURST_WINDOW_MS: u128 = 2_000;
const LOG_BURST_LIMIT: usize = 180;
const MAX_TRACKED_TASKS: usize = 256;
const MAX_ERROR_LOGS_PER_SOURCE: usize = 80;
const MAX_ERROR_LOG_QUERY: usize = 200;
const WINDOW_MAIN: &str = "main";
const WINDOW_SCRAPER_WORKER: &str = "scraper_worker";
const WINDOW_SCRAPER_FOREGROUND: &str = "scraper_foreground";
const SCRAPER_DAEMON_INTERVAL: Duration = Duration::from_secs(2);
const SCRAPER_DAEMON_LEASE_SECONDS: u64 = 20;

fn apply_webview_proxy<'a>(
    app: &'a AppHandle,
    mut builder: tauri::WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
    source_id: &'a str,
    task_id: &'a str,
) -> tauri::WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    if let Some(proxy_url) = crate::resolve_webview_proxy_url(app) {
        emit_lifecycle_log(
            app,
            ScraperLifecycleLog::new(
                source_id.to_string(),
                task_id.to_string(),
                "proxy_applied",
                "info",
                "Applying app proxy for webview scraper".to_string(),
            ),
        );
        builder = builder.proxy_url(proxy_url);
    }
    builder
}

fn enhanced_scrape_patches_script(enabled: bool) -> String {
    if !enabled {
        return String::new();
    }
    r#"
            // Enhanced scraping mode:
            // Keep page logic in "visible" state and drive animation callbacks under background throttling.
            try {
                Object.defineProperty(document, 'visibilityState', {
                    configurable: true,
                    get: function() { return 'visible'; }
                });
                Object.defineProperty(document, 'hidden', {
                    configurable: true,
                    get: function() { return false; }
                });
            } catch (_err) {
                // Ignore patch failures; continue with best-effort compatibility.
            }

            try {
                const originalAddEventListener = document.addEventListener;
                const patchedAddEventListener = function(type, listener, options) {
                    if (type === 'visibilitychange') {
                        return;
                    }
                    return originalAddEventListener.call(this, type, listener, options);
                };
                safeOverride(document, 'addEventListener', patchedAddEventListener);
            } catch (_err) {
                // Ignore patch failures; continue with best-effort compatibility.
            }

            try {
                const NativeIntersectionObserver = window.IntersectionObserver;
                if (typeof NativeIntersectionObserver === 'function') {
                    const PatchedIntersectionObserver = class extends NativeIntersectionObserver {
                        constructor(callback, options) {
                            const wrapped = (entries, observer) => {
                                const fakeEntries = entries.map((entry) => ({
                                    ...entry,
                                    isIntersecting: true,
                                    intersectionRatio: 1
                                }));
                                callback(fakeEntries, observer);
                            };
                            super(wrapped, options);
                        }
                    };
                    safeOverride(window, 'IntersectionObserver', PatchedIntersectionObserver);
                }
            } catch (_err) {
                // Ignore patch failures; continue with best-effort compatibility.
            }

            try {
                const patchedRaf = function(callback) {
                    if (typeof callback !== 'function') {
                        return window.setTimeout(function() {}, 16);
                    }
                    return window.setTimeout(function() {
                        callback(performance.now());
                    }, 16);
                };
                const patchedCancelRaf = function(id) {
                    return window.clearTimeout(id);
                };
                safeOverride(window, 'requestAnimationFrame', patchedRaf);
                safeOverride(window, 'cancelAnimationFrame', patchedCancelRaf);
            } catch (_err) {
                // Ignore patch failures; continue with best-effort compatibility.
            }
"#
    .to_string()
}

fn resolve_enhanced_scraping_enabled(app: &AppHandle) -> bool {
    crate::is_enhanced_scraping_enabled(app)
}

fn ensure_invoker_window(
    window: &Window,
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

/// Structured log entry for scraper lifecycle events
#[derive(Debug, Clone, Serialize)]
pub struct ScraperLifecycleLog {
    pub source_id: String,
    pub task_id: String,
    pub stage: String,
    pub level: String, // "info", "warn", "error", "debug"
    pub message: String,
    pub timestamp: u64,
    pub details: Option<serde_json::Value>,
}

impl ScraperLifecycleLog {
    fn new(source_id: String, task_id: String, stage: &str, level: &str, message: String) -> Self {
        Self {
            source_id,
            task_id,
            stage: stage.to_string(),
            level: level.to_string(),
            message: sanitize_log_message(message),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            details: None,
        }
    }

    fn with_details(mut self, details: serde_json::Value) -> Self {
        self.details = Some(details);
        self
    }
}

fn sanitize_log_message(message: String) -> String {
    let char_count = message.chars().count();
    if char_count <= MAX_LOG_MESSAGE_CHARS {
        return message;
    }
    let mut shortened = message
        .chars()
        .take(MAX_LOG_MESSAGE_CHARS)
        .collect::<String>();
    shortened.push_str("...[truncated]");
    shortened
}

#[derive(Default)]
struct BurstWindow {
    start_ms: u128,
    count: usize,
}

enum LogDecision {
    Emit,
    Drop,
    Kill { reason: String },
}

#[derive(Default)]
struct LogControlState {
    last_key_by_task: HashMap<String, String>,
    duplicate_streak_by_task: HashMap<String, usize>,
    burst_window_by_task: HashMap<String, BurstWindow>,
    killed_tasks: HashSet<String>,
}

impl LogControlState {
    fn evaluate(&mut self, log: &ScraperLifecycleLog, now_ms: u128) -> LogDecision {
        if self.killed_tasks.len() > MAX_TRACKED_TASKS {
            self.killed_tasks.clear();
        }
        if self.last_key_by_task.len() > MAX_TRACKED_TASKS {
            self.last_key_by_task.clear();
            self.duplicate_streak_by_task.clear();
            self.burst_window_by_task.clear();
        }

        let task_id = log.task_id.as_str();
        if task_id.is_empty() {
            return LogDecision::Emit;
        }
        if self.killed_tasks.contains(task_id) {
            return LogDecision::Drop;
        }

        let log_key = format!(
            "{}|{}|{}|{}",
            log.source_id, log.stage, log.level, log.message
        );
        let mut should_drop = false;
        if self
            .last_key_by_task
            .get(task_id)
            .map(|previous| previous == &log_key)
            .unwrap_or(false)
        {
            let streak = self
                .duplicate_streak_by_task
                .entry(task_id.to_string())
                .or_insert(0);
            *streak += 1;
            if *streak >= MAX_CONSECUTIVE_DUPLICATE_LOGS {
                should_drop = true;
            }
        } else {
            self.last_key_by_task
                .insert(task_id.to_string(), log_key.to_string());
            self.duplicate_streak_by_task.insert(task_id.to_string(), 0);
        }

        let window = self
            .burst_window_by_task
            .entry(task_id.to_string())
            .or_default();
        if window.start_ms == 0 || now_ms.saturating_sub(window.start_ms) > LOG_BURST_WINDOW_MS {
            window.start_ms = now_ms;
            window.count = 0;
        }
        window.count += 1;

        if task_id != "unknown" && window.count > LOG_BURST_LIMIT {
            self.killed_tasks.insert(task_id.to_string());
            return LogDecision::Kill {
                reason: format!(
                    "Log burst detected: {} logs in {}ms. Task terminated as safeguard.",
                    window.count, LOG_BURST_WINDOW_MS
                ),
            };
        }

        if should_drop {
            return LogDecision::Drop;
        }
        LogDecision::Emit
    }

    fn cleanup_task(&mut self, task_id: &str) {
        self.last_key_by_task.remove(task_id);
        self.duplicate_streak_by_task.remove(task_id);
        self.burst_window_by_task.remove(task_id);
    }
}

fn push_error_log(state: &ScraperState, log: &ScraperLifecycleLog) {
    if log.level != "error" {
        return;
    }

    let mut store = state.error_logs_by_source.lock().unwrap();
    let queue = store.entry(log.source_id.clone()).or_default();
    queue.push_back(log.clone());
    while queue.len() > MAX_ERROR_LOGS_PER_SOURCE {
        queue.pop_front();
    }
}

fn emit_kill_log_and_result(app: &AppHandle, source_id: String, task_id: String, reason: String) {
    let state = app.state::<ScraperState>();
    let active = get_active_task_record(app);
    let active_task_id = active
        .as_ref()
        .map(|task| task.task_id.clone())
        .unwrap_or_else(|| "unknown".to_string());
    if active_task_id != task_id {
        return;
    }

    let kill_log = ScraperLifecycleLog::new(
        source_id.clone(),
        task_id.clone(),
        "task_killed_log_burst",
        "error",
        reason.clone(),
    );
    push_error_log(&state, &kill_log);
    println!(
        "[Scraper Lifecycle][{}][{}] {} - {}: {}",
        kill_log.source_id, kill_log.task_id, kill_log.stage, kill_log.level, kill_log.message
    );
    let _ = app.emit("scraper_lifecycle_log", kill_log);

    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.close();
    }

    if let Some(active_task) = active.as_ref() {
        if active_task.backend_managed {
            let _ = fail_scraper_task(
                app,
                &source_id,
                &task_id,
                active_task.attempt,
                &reason,
            );
        }
    }
    clear_active_task(app);

    #[cfg(target_os = "macos")]
    {
        let mut guard = state.app_nap_guard.lock().unwrap();
        *guard = None;
    }

    let _ = app.emit(
        "scraper_result",
        serde_json::json!({
            "sourceId": source_id,
            "taskId": task_id,
            "secretKey": "",
            "data": serde_json::Value::Null,
            "error": reason
        }),
    );
}

/// Helper to emit lifecycle logs
fn emit_lifecycle_log(app: &AppHandle, log: ScraperLifecycleLog) {
    let state = app.state::<ScraperState>();
    let decision = {
        let mut control = state.log_control.lock().unwrap();
        control.evaluate(&log, now_ms())
    };

    match decision {
        LogDecision::Drop => return,
        LogDecision::Kill { reason } => {
            emit_kill_log_and_result(app, log.source_id.clone(), log.task_id.clone(), reason);
            return;
        }
        LogDecision::Emit => {}
    }

    push_error_log(&state, &log);
    println!(
        "[Scraper Lifecycle][{}][{}] {} - {}: {}",
        log.source_id, log.task_id, log.stage, log.level, log.message
    );
    let _ = app.emit("scraper_lifecycle_log", log);
}

#[cfg(target_os = "macos")]
use cocoa_foundation::base::{id, nil};
#[cfg(target_os = "macos")]
use cocoa_foundation::foundation::{NSProcessInfo, NSString};
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

/// RAII guard to disable App Nap on macOS during background scraping
#[cfg(target_os = "macos")]
struct AppNapGuard {
    activity: id,
}

#[cfg(target_os = "macos")]
unsafe impl Send for AppNapGuard {}
#[cfg(target_os = "macos")]
unsafe impl Sync for AppNapGuard {}

#[cfg(target_os = "macos")]
impl AppNapGuard {
    fn new(reason: &str) -> Self {
        unsafe {
            let NSActivityIdleSystemSleepDisabled = 1u64 << 20;
            let NSActivitySuddenTerminationDisabled = 1u64 << 14;
            let NSActivityAutomaticTerminationDisabled = 1u64 << 15;
            let NSActivityUserInitiated = 0x00FFFFFFu64 | NSActivityIdleSystemSleepDisabled;

            let options = NSActivityIdleSystemSleepDisabled
                | NSActivitySuddenTerminationDisabled
                | NSActivityAutomaticTerminationDisabled
                | NSActivityUserInitiated;

            let pinfo = NSProcessInfo::processInfo(nil);
            let reason_str = NSString::alloc(nil).init_str(reason);
            let activity: id = msg_send![pinfo, beginActivityWithOptions:options reason:reason_str];

            AppNapGuard { activity }
        }
    }
}

#[cfg(target_os = "macos")]
impl Drop for AppNapGuard {
    fn drop(&mut self) {
        unsafe {
            let pinfo = NSProcessInfo::processInfo(nil);
            let _: () = msg_send![pinfo, endActivity:self.activity];
        }
    }
}

/// Global state to deduplicate scraper results.
/// Fetch + XHR interceptors can both fire for the same request,
/// so we only process the first result per task_id.
#[derive(Clone)]
pub struct ActiveScraperTask {
    pub source_id: String,
    pub task_id: String,
    pub attempt: Option<u32>,
    pub backend_managed: bool,
    pub url: String,
    pub inject_script: String,
    pub intercept_api: String,
    pub secret_key: String,
}

pub struct ScraperState {
    pub handled_results: Mutex<HashSet<String>>,
    pub active_task: Mutex<Option<ActiveScraperTask>>,
    pub daemon_worker_id: String,
    log_control: Mutex<LogControlState>,
    error_logs_by_source: Mutex<HashMap<String, VecDeque<ScraperLifecycleLog>>>,
    #[cfg(target_os = "macos")]
    pub app_nap_guard: Mutex<Option<AppNapGuard>>,
}

impl Default for ScraperState {
    fn default() -> Self {
        ScraperState {
            handled_results: Mutex::new(HashSet::new()),
            active_task: Mutex::new(None),
            daemon_worker_id: format!("glanceus-daemon-{}", std::process::id()),
            log_control: Mutex::new(LogControlState::default()),
            error_logs_by_source: Mutex::new(HashMap::new()),
            #[cfg(target_os = "macos")]
            app_nap_guard: Mutex::new(None),
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
struct InternalClaimedTask {
    task_id: String,
    source_id: String,
    url: String,
    script: Option<String>,
    intercept_api: Option<String>,
    secret_key: Option<String>,
    attempt: u32,
}

#[derive(Debug, Deserialize)]
struct InternalClaimResponse {
    task: Option<InternalClaimedTask>,
}

#[derive(Debug, Serialize)]
struct InternalClaimRequest<'a> {
    worker_id: &'a str,
    lease_seconds: u64,
}

#[derive(Debug, Serialize)]
struct InternalHeartbeatRequest<'a> {
    worker_id: &'a str,
    source_id: &'a str,
    task_id: &'a str,
    attempt: Option<u32>,
    lease_seconds: u64,
}

#[derive(Debug, Serialize)]
struct InternalCompleteRequest<'a> {
    worker_id: &'a str,
    source_id: &'a str,
    task_id: &'a str,
    attempt: Option<u32>,
    data: &'a serde_json::Value,
}

#[derive(Debug, Serialize)]
struct InternalFailRequest<'a> {
    worker_id: &'a str,
    source_id: &'a str,
    task_id: &'a str,
    attempt: Option<u32>,
    error: &'a str,
}

#[derive(Debug, Deserialize)]
struct InternalBooleanResponse {
    accepted: Option<bool>,
    ok: Option<bool>,
    reason: Option<String>,
}

#[derive(Debug, Serialize)]
struct InternalClearRequest<'a> {
    source_id: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
struct InternalClearResponse {
    cleared_count: Option<usize>,
}

#[derive(Debug, Serialize, Default)]
struct InternalListRequest {}

#[derive(Debug, Deserialize)]
struct InternalListedTask {
    source_id: String,
}

#[derive(Debug, Deserialize)]
struct InternalListResponse {
    tasks: Option<Vec<InternalListedTask>>,
}

#[derive(Debug, Serialize)]
pub struct ScraperQueueSnapshot {
    active_source_id: Option<String>,
    queue_source_ids: Vec<String>,
}

fn backend_post_json<TReq: Serialize, TResp: DeserializeOwned>(
    app: &AppHandle,
    path: &str,
    payload: &TReq,
) -> Result<TResp, String> {
    let port = crate::get_api_target_port(app);
    let body = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|e| format!("failed to connect backend api {port}: {e}"))?;
    let mut request = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    if let Some(internal_auth_token) = crate::get_internal_auth_token(app) {
        request.push_str("X-Glanceus-Internal-Token: ");
        request.push_str(&internal_auth_token);
        request.push_str("\r\n");
    }
    request.push_str("\r\n");
    request.push_str(&body);
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("failed to write backend request: {e}"))?;
    stream
        .flush()
        .map_err(|e| format!("failed to flush backend request: {e}"))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|e| format!("failed to read backend response: {e}"))?;
    let split_at = response
        .find("\r\n\r\n")
        .ok_or_else(|| "invalid backend response framing".to_string())?;
    let (head, body) = response.split_at(split_at);
    let body = &body[4..];
    let status_line = head.lines().next().unwrap_or_default();
    let status_code = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|raw| raw.parse::<u16>().ok())
        .unwrap_or(500);
    if !(200..300).contains(&status_code) {
        return Err(format!(
            "backend request {} failed with status {}: {}",
            path, status_code, body
        ));
    }
    serde_json::from_str(body)
        .map_err(|e| format!("failed to parse backend response {}: {}", path, e))
}

fn claim_scraper_task(app: &AppHandle) -> Result<Option<InternalClaimedTask>, String> {
    let state = app.state::<ScraperState>();
    let response: InternalClaimResponse = backend_post_json(
        app,
        "/api/internal/scraper/claim",
        &InternalClaimRequest {
            worker_id: &state.daemon_worker_id,
            lease_seconds: SCRAPER_DAEMON_LEASE_SECONDS,
        },
    )?;
    Ok(response.task)
}

fn heartbeat_scraper_task(app: &AppHandle, active: &ActiveScraperTask) -> Result<(), String> {
    let state = app.state::<ScraperState>();
    let response: InternalBooleanResponse = backend_post_json(
        app,
        "/api/internal/scraper/heartbeat",
        &InternalHeartbeatRequest {
            worker_id: &state.daemon_worker_id,
            source_id: &active.source_id,
            task_id: &active.task_id,
            attempt: active.attempt,
            lease_seconds: SCRAPER_DAEMON_LEASE_SECONDS,
        },
    )?;
    if response.ok == Some(false) {
        return Err(response.reason.unwrap_or_else(|| "heartbeat rejected".to_string()));
    }
    Ok(())
}

fn complete_scraper_task(
    app: &AppHandle,
    source_id: &str,
    task_id: &str,
    attempt: Option<u32>,
    data: &serde_json::Value,
) -> Result<(), String> {
    let state = app.state::<ScraperState>();
    let response: InternalBooleanResponse = backend_post_json(
        app,
        "/api/internal/scraper/complete",
        &InternalCompleteRequest {
            worker_id: &state.daemon_worker_id,
            source_id,
            task_id,
            attempt,
            data,
        },
    )?;
    if response.accepted == Some(false) {
        return Err(response.reason.unwrap_or_else(|| "complete rejected".to_string()));
    }
    Ok(())
}

fn fail_scraper_task(
    app: &AppHandle,
    source_id: &str,
    task_id: &str,
    attempt: Option<u32>,
    error: &str,
) -> Result<(), String> {
    let state = app.state::<ScraperState>();
    let response: InternalBooleanResponse = backend_post_json(
        app,
        "/api/internal/scraper/fail",
        &InternalFailRequest {
            worker_id: &state.daemon_worker_id,
            source_id,
            task_id,
            attempt,
            error,
        },
    )?;
    if response.accepted == Some(false) {
        return Err(response.reason.unwrap_or_else(|| "fail rejected".to_string()));
    }
    Ok(())
}

fn clear_scraper_tasks(
    app: &AppHandle,
    source_id: Option<&str>,
) -> Result<usize, String> {
    let response: InternalClearResponse = backend_post_json(
        app,
        "/api/internal/scraper/clear",
        &InternalClearRequest { source_id },
    )?;
    Ok(response.cleared_count.unwrap_or(0))
}

fn list_active_scraper_tasks(app: &AppHandle) -> Result<Vec<InternalListedTask>, String> {
    let response: InternalListResponse = backend_post_json(
        app,
        "/api/internal/scraper/list",
        &InternalListRequest::default(),
    )?;
    Ok(response.tasks.unwrap_or_default())
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis()
}

fn make_task_id(source_id: &str) -> String {
    format!("{}-{}", source_id, now_ms())
}

fn set_active_task(
    app: &AppHandle,
    source_id: String,
    task_id: String,
    attempt: Option<u32>,
    backend_managed: bool,
    url: String,
    inject_script: String,
    intercept_api: String,
    secret_key: String,
) {
    let state = app.state::<ScraperState>();
    let mut active = state.active_task.lock().unwrap();
    let previous_task_id = active.as_ref().map(|task| task.task_id.clone());
    *active = Some(ActiveScraperTask {
        source_id,
        task_id,
        attempt,
        backend_managed,
        url,
        inject_script,
        intercept_api,
        secret_key,
    });
    drop(active);
    if let Some(task_id) = previous_task_id {
        let mut control = state.log_control.lock().unwrap();
        control.cleanup_task(&task_id);
    }
}

fn clear_active_task(app: &AppHandle) {
    let state = app.state::<ScraperState>();
    let mut active = state.active_task.lock().unwrap();
    let previous_task_id = active.as_ref().map(|task| task.task_id.clone());
    *active = None;
    drop(active);
    if let Some(task_id) = previous_task_id {
        let mut control = state.log_control.lock().unwrap();
        control.cleanup_task(&task_id);
    }
}

fn get_active_task(app: &AppHandle) -> (String, String) {
    let state = app.state::<ScraperState>();
    let active = state.active_task.lock().unwrap();
    if let Some(task) = active.as_ref() {
        return (task.source_id.clone(), task.task_id.clone());
    }
    ("unknown".to_string(), "unknown".to_string())
}

fn get_active_task_record(app: &AppHandle) -> Option<ActiveScraperTask> {
    let state = app.state::<ScraperState>();
    let active = state.active_task.lock().unwrap();
    active.clone()
}

async fn close_existing_scraper_window(
    app: &AppHandle,
    _source_id: &str,
    _task_id: &str,
    window_label: &str,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(window_label) {
        let _ = win.close();
    } else {
        return Ok(());
    }

    for _ in 0..20 {
        if app.get_webview_window(window_label).is_none() {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }

    Err("Timed out waiting for existing scraper window to close".to_string())
}

#[tauri::command]
pub async fn scraper_log(window: Window, app: AppHandle, message: String) -> Result<(), String> {
    ensure_invoker_window(
        &window,
        &[WINDOW_SCRAPER_WORKER, WINDOW_SCRAPER_FOREGROUND],
        "scraper_log",
    )?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let normalized = trimmed.to_ascii_lowercase();
    let level = if normalized.starts_with("[error]") {
        "error"
    } else if normalized.starts_with("[warn]") {
        "warn"
    } else {
        return Ok(());
    };
    let (source_id, task_id) = get_active_task(&app);
    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(source_id, task_id, "js_signal", level, trimmed.to_string()),
    );
    Ok(())
}

#[tauri::command]
pub async fn get_scraper_error_logs(
    window: Window,
    app: AppHandle,
    source_id: Option<String>,
) -> Result<Vec<ScraperLifecycleLog>, String> {
    ensure_invoker_window(&window, &[WINDOW_MAIN], "get_scraper_error_logs")?;
    let state = app.state::<ScraperState>();
    let store = state.error_logs_by_source.lock().unwrap();

    let mut logs = if let Some(source) = source_id {
        store
            .get(&source)
            .map(|entries| entries.iter().cloned().collect::<Vec<_>>())
            .unwrap_or_default()
    } else {
        store
            .values()
            .flat_map(|entries| entries.iter().cloned())
            .collect::<Vec<_>>()
    };

    logs.sort_by_key(|entry| entry.timestamp);
    if logs.len() > MAX_ERROR_LOG_QUERY {
        logs = logs.split_off(logs.len() - MAX_ERROR_LOG_QUERY);
    }
    Ok(logs)
}

#[tauri::command]
pub async fn push_scraper_task(
    window: Window,
    app: AppHandle,
    source_id: String,
    url: String,
    inject_script: String,
    intercept_api: String,
    secret_key: String,
    foreground: Option<bool>,
) -> Result<(), String> {
    ensure_invoker_window(&window, &[WINDOW_MAIN], "push_scraper_task")?;
    let foreground = foreground.unwrap_or(false);
    let task_id = make_task_id(&source_id);
    let window_label = if foreground {
        WINDOW_SCRAPER_FOREGROUND
    } else {
        WINDOW_SCRAPER_WORKER
    };
    if !foreground {
        set_active_task(
            &app,
            source_id.clone(),
            task_id.clone(),
            None,
            false,
            url.clone(),
            inject_script.clone(),
            intercept_api.clone(),
            secret_key.clone(),
        );
    }

    // Log: task_start
    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            task_id.clone(),
            "task_start",
            "info",
            format!("Starting scraper task (foreground={})", foreground),
        )
        .with_details(serde_json::json!({
            "task_id": task_id,
            "url": url,
            "foreground": foreground,
            "has_script": !inject_script.is_empty(),
            "has_intercept": !intercept_api.is_empty()
        })),
    );

    // Clear any previous dedup record for this task so the new task's result is processed
    {
        let state = app.state::<ScraperState>();
        let mut handled = state.handled_results.lock().unwrap();
        handled.remove(&task_id);
    }

    let enhanced_scraping_enabled = resolve_enhanced_scraping_enabled(&app);
    let enhanced_patches = enhanced_scrape_patches_script(enhanced_scraping_enabled);
    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            task_id.clone(),
            "enhanced_scraping_status",
            "info",
            format!(
                "Enhanced scraping enabled={} script_len={}",
                enhanced_scraping_enabled,
                enhanced_patches.len()
            ),
        ),
    );

    let final_script = format!(
        r#"
        (function() {{
            // Safe property override helper
            // Tries Object.defineProperty first, then direct assignment, then gives up
            function safeOverride(obj, prop, value) {{
                try {{
                    Object.defineProperty(obj, prop, {{
                        value: value,
                        writable: true,
                        configurable: true
                    }});
                    return true;
                }} catch(e1) {{
                    try {{
                        obj[prop] = value;
                        return obj[prop] === value;
                    }} catch(e2) {{
                        console.warn('[Scraper] Cannot override ' + prop + ':', e2.message);
                        return false;
                    }}
                }}
            }}

            const interceptPattern = '{}';
            const shouldIntercept = (reqUrl) =>
                interceptPattern.length > 0 && reqUrl.includes(interceptPattern);

            const originalFetch = window.fetch;
            const patchedFetch = async function(...args) {{
                const reqUrl = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';

                // Intercept Target API
                if (shouldIntercept(reqUrl)) {{
                    try {{
                        const response = await originalFetch.apply(this, args);
                        if (response.status === 401 || response.status === 403) {{
                            window.__TAURI_INTERNALS__.invoke('handle_scraper_auth', {{ sourceId: '{}', taskId: '{}', targetUrl: reqUrl }});
                        }} else {{
                            const cloneRes = response.clone();
                            cloneRes.json().then(data => {{
                                window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{
                                    sourceId: '{}',
                                    taskId: '{}',
                                    secretKey: '{}',
                                    data: data
                                }});
                            }}).catch(e => {{
                                console.error('Failed to capture JSON:', e);
                            }});
                        }}
                        return response;
                    }} catch(e) {{
                        throw e;
                    }}
                }}
                
                return originalFetch.apply(this, args);
            }};
            safeOverride(window, 'fetch', patchedFetch);
            
            // XHR overrides (Optional, if target uses XHR instead of Fetch)
            const originalXhrOpen = XMLHttpRequest.prototype.open;
            const patchedXhrOpen = function(method, xUrl, ...rest) {{
                this._url = xUrl;
                return originalXhrOpen.call(this, method, xUrl, ...rest);
            }};
            safeOverride(XMLHttpRequest.prototype, 'open', patchedXhrOpen);

            const originalXhrSend = XMLHttpRequest.prototype.send;
            const patchedXhrSend = function(body) {{
                this.addEventListener('load', function() {{
                    if (this._url && shouldIntercept(this._url)) {{
                         if (this.status === 401 || this.status === 403) {{
                             window.__TAURI_INTERNALS__.invoke('handle_scraper_auth', {{ sourceId: '{}', taskId: '{}', targetUrl: this._url }});
                         }} else {{
                             try {{
                                 const data = JSON.parse(this.responseText);
                                 window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{
                                     sourceId: '{}',
                                     taskId: '{}',
                                     secretKey: '{}',
                                     data: data
                                 }});
                             }} catch(e) {{}}
                         }}
                    }}
                }});
                this.addEventListener('error', function() {{}});
                return originalXhrSend.call(this, body);
            }};
            safeOverride(XMLHttpRequest.prototype, 'send', patchedXhrSend);

            const navigatePopupInPlace = (popupUrl) => {{
                const nextUrl = typeof popupUrl === 'string' ? popupUrl : popupUrl?.toString?.() || '';
                if (!nextUrl || nextUrl.startsWith('javascript:')) {{
                    return window;
                }}
                try {{
                    window.location.assign(nextUrl);
                }} catch (err) {{
                    window.location.href = nextUrl;
                }}
                return window;
            }};
            safeOverride(window, 'open', function(popupUrl) {{
                return navigatePopupInPlace(popupUrl);
            }});
            document.addEventListener('click', (event) => {{
                const target = event.target;
                const anchor = target && target.closest ? target.closest('a[target="_blank"]') : null;
                if (!anchor) {{
                    return;
                }}
                const href = anchor.getAttribute('href');
                if (!href || href.startsWith('javascript:')) {{
                    return;
                }}
                event.preventDefault();
                navigatePopupInPlace(href);
            }}, true);
            const rewriteBlankFormTarget = (form) => {{
                if (!form || typeof form.getAttribute !== 'function') {{
                    return;
                }}
                const targetAttr = (form.getAttribute('target') || '').trim().toLowerCase();
                if (targetAttr !== '_blank') {{
                    return;
                }}
                form.setAttribute('target', '_self');
            }};
            document.addEventListener('submit', (event) => {{
                rewriteBlankFormTarget(event.target);
            }}, true);
            if (window.HTMLFormElement && window.HTMLFormElement.prototype) {{
                const originalFormSubmit = HTMLFormElement.prototype.submit;
                const patchedFormSubmit = function(...args) {{
                    rewriteBlankFormTarget(this);
                    return originalFormSubmit.apply(this, args);
                }};
                safeOverride(HTMLFormElement.prototype, 'submit', patchedFormSubmit);
            }}

            // Expose a helper so injected script can emit DOM-scraped payload directly.
            const emitScrapedData = (data) => {{
                try {{
                    window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{
                        sourceId: '{}',
                        taskId: '{}',
                        secretKey: '{}',
                        data: data
                    }});
                }} catch (err) {{
                    console.error('Failed to emit scraped DOM data:', err);
                }}
            }};
            safeOverride(window, '__GLANCEUS_EMIT_SCRAPED_DATA', emitScrapedData);

            {}

            // User Injected Script
            try {{
                {}
            }} catch(e) {{
                console.error('Inject script error:', e);
            }}
        }})();
        "#,
        intercept_api,
        source_id.as_str(),
        task_id.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        secret_key.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        secret_key.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        secret_key.as_str(),
        enhanced_patches,
        inject_script
    );

    // If a scraper window already exists, close it and wait until it is removed.
    close_existing_scraper_window(&app, &source_id, &task_id, window_label)
        .await
        .map_err(|e| {
            if !foreground {
                clear_active_task(&app);
            }
            emit_lifecycle_log(
                &app,
                ScraperLifecycleLog::new(
                    source_id.clone(),
                    task_id.clone(),
                    "window_error",
                    "error",
                    e.clone(),
                ),
            );
            e
        })?;

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        window_label,
        tauri::WebviewUrl::External(url.parse().unwrap()),
    )
    .title(if foreground {
        "Manual Scraper"
    } else {
        "Background Worker"
    })
    .initialization_script(&final_script);
    builder = apply_webview_proxy(&app, builder, &source_id, &task_id);

    if foreground {
        builder = builder
            .visible(true)
            .decorations(true)
            .inner_size(960.0, 720.0)
            .resizable(true);
    } else {
        // Background mode: disable App Nap on macOS to prevent WKWebView suspension
        #[cfg(target_os = "macos")]
        {
            let state = app.state::<ScraperState>();
            let mut guard = state.app_nap_guard.lock().unwrap();
            *guard = Some(AppNapGuard::new("Background webview scraper running"));
        }

        #[cfg(target_os = "macos")]
        {
            // WKWebView on macOS may suspend JS for fully hidden/off-screen windows.
            // Keep a minimal visible window in the active Space to preserve execution.
            builder = builder
                .visible(true)
                .decorations(false)
                .inner_size(1.0, 1.0)
                .position(0.0, 0.0)
                .skip_taskbar(true)
                .visible_on_all_workspaces(true);
        }
        #[cfg(not(target_os = "macos"))]
        {
            // On Windows/Linux, keep the background worker truly hidden to avoid focus stealing.
            builder = builder
                .visible(false)
                .focused(false)
                .decorations(false)
                .skip_taskbar(true);
        }
    }

    let _webview = builder.build().map_err(|e| {
        if !foreground {
            clear_active_task(&app);
        }
        emit_lifecycle_log(
            &app,
            ScraperLifecycleLog::new(
                source_id.clone(),
                task_id.clone(),
                "window_error",
                "error",
                format!("Failed to create window: {}", e),
            ),
        );
        e.to_string()
    })?;

    if foreground {
        let _ = _webview.center();
        let _ = _webview.show();
        let _ = _webview.set_focus();
        emit_lifecycle_log(
            &app,
            ScraperLifecycleLog::new(
                source_id.clone(),
                task_id.clone(),
                "window_ready",
                "info",
                "Window shown and focused".to_string(),
            ),
        );
    } else {
        emit_lifecycle_log(
            &app,
            ScraperLifecycleLog::new(
                source_id.clone(),
                task_id.clone(),
                "window_ready",
                "info",
                "Background window ready".to_string(),
            ),
        );
    }

    Ok(())
}

async fn start_claimed_scraper_task(
    app: &AppHandle,
    claimed: &InternalClaimedTask,
) -> Result<(), String> {
    let source_id = claimed.source_id.clone();
    let task_id = claimed.task_id.clone();
    let url = claimed.url.clone();
    let inject_script = claimed.script.clone().unwrap_or_default();
    let intercept_api = claimed.intercept_api.clone().unwrap_or_default();
    let secret_key = claimed
        .secret_key
        .clone()
        .unwrap_or_else(|| "webview_data".to_string());

    set_active_task(
        app,
        source_id.clone(),
        task_id.clone(),
        Some(claimed.attempt),
        true,
        url.clone(),
        inject_script.clone(),
        intercept_api.clone(),
        secret_key.clone(),
    );

    emit_lifecycle_log(
        app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            task_id.clone(),
            "task_claimed",
            "info",
            "Claimed backend scraper task".to_string(),
        )
        .with_details(serde_json::json!({
            "task_id": task_id,
            "url": url,
            "attempt": claimed.attempt,
            "has_script": !inject_script.is_empty(),
            "has_intercept": !intercept_api.is_empty()
        })),
    );

    {
        let state = app.state::<ScraperState>();
        let mut handled = state.handled_results.lock().unwrap();
        handled.remove(&task_id);
    }

    let enhanced_scraping_enabled = resolve_enhanced_scraping_enabled(app);
    let enhanced_patches = enhanced_scrape_patches_script(enhanced_scraping_enabled);
    emit_lifecycle_log(
        app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            task_id.clone(),
            "enhanced_scraping_status",
            "info",
            format!(
                "Enhanced scraping enabled={} script_len={}",
                enhanced_scraping_enabled,
                enhanced_patches.len()
            ),
        ),
    );

    let final_script = format!(
        r#"
        (function() {{
            function safeOverride(obj, prop, value) {{
                try {{
                    Object.defineProperty(obj, prop, {{
                        value: value,
                        writable: true,
                        configurable: true
                    }});
                    return true;
                }} catch(e1) {{
                    try {{
                        obj[prop] = value;
                        return obj[prop] === value;
                    }} catch(e2) {{
                        console.warn('[Scraper] Cannot override ' + prop + ':', e2.message);
                        return false;
                    }}
                }}
            }}

            const interceptPattern = '{}';
            const shouldIntercept = (reqUrl) =>
                interceptPattern.length > 0 && reqUrl.includes(interceptPattern);

            const originalFetch = window.fetch;
            const patchedFetch = async function(...args) {{
                const reqUrl = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';
                if (shouldIntercept(reqUrl)) {{
                    try {{
                        const response = await originalFetch.apply(this, args);
                        if (response.status === 401 || response.status === 403) {{
                            window.__TAURI_INTERNALS__.invoke('handle_scraper_auth', {{ sourceId: '{}', taskId: '{}', targetUrl: reqUrl }});
                        }} else {{
                            const cloneRes = response.clone();
                            cloneRes.json().then(data => {{
                                window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{
                                    sourceId: '{}',
                                    taskId: '{}',
                                    secretKey: '{}',
                                    data: data
                                }});
                            }}).catch(e => {{
                                console.error('Failed to capture JSON:', e);
                            }});
                        }}
                        return response;
                    }} catch(e) {{
                        throw e;
                    }}
                }}
                return originalFetch.apply(this, args);
            }};
            safeOverride(window, 'fetch', patchedFetch);

            const originalXhrOpen = XMLHttpRequest.prototype.open;
            const patchedXhrOpen = function(method, xUrl, ...rest) {{
                this._url = xUrl;
                return originalXhrOpen.call(this, method, xUrl, ...rest);
            }};
            safeOverride(XMLHttpRequest.prototype, 'open', patchedXhrOpen);

            const originalXhrSend = XMLHttpRequest.prototype.send;
            const patchedXhrSend = function(body) {{
                this.addEventListener('load', function() {{
                    if (this._url && shouldIntercept(this._url)) {{
                         if (this.status === 401 || this.status === 403) {{
                             window.__TAURI_INTERNALS__.invoke('handle_scraper_auth', {{ sourceId: '{}', taskId: '{}', targetUrl: this._url }});
                         }} else {{
                             try {{
                                 const data = JSON.parse(this.responseText);
                                 window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{
                                     sourceId: '{}',
                                     taskId: '{}',
                                     secretKey: '{}',
                                     data: data
                                 }});
                             }} catch(e) {{}}
                         }}
                    }}
                }});
                this.addEventListener('error', function() {{}});
                return originalXhrSend.call(this, body);
            }};
            safeOverride(XMLHttpRequest.prototype, 'send', patchedXhrSend);

            const navigatePopupInPlace = (popupUrl) => {{
                const nextUrl = typeof popupUrl === 'string' ? popupUrl : popupUrl?.toString?.() || '';
                if (!nextUrl || nextUrl.startsWith('javascript:')) {{
                    return window;
                }}
                try {{
                    window.location.assign(nextUrl);
                }} catch (err) {{
                    window.location.href = nextUrl;
                }}
                return window;
            }};
            safeOverride(window, 'open', function(popupUrl) {{
                return navigatePopupInPlace(popupUrl);
            }});
            document.addEventListener('click', (event) => {{
                const target = event.target;
                const anchor = target && target.closest ? target.closest('a[target="_blank"]') : null;
                if (!anchor) {{
                    return;
                }}
                const href = anchor.getAttribute('href');
                if (!href || href.startsWith('javascript:')) {{
                    return;
                }}
                event.preventDefault();
                navigatePopupInPlace(href);
            }}, true);
            const rewriteBlankFormTarget = (form) => {{
                if (!form || typeof form.getAttribute !== 'function') {{
                    return;
                }}
                const targetAttr = (form.getAttribute('target') || '').trim().toLowerCase();
                if (targetAttr !== '_blank') {{
                    return;
                }}
                form.setAttribute('target', '_self');
            }};
            document.addEventListener('submit', (event) => {{
                rewriteBlankFormTarget(event.target);
            }}, true);
            if (window.HTMLFormElement && window.HTMLFormElement.prototype) {{
                const originalFormSubmit = HTMLFormElement.prototype.submit;
                const patchedFormSubmit = function(...args) {{
                    rewriteBlankFormTarget(this);
                    return originalFormSubmit.apply(this, args);
                }};
                safeOverride(HTMLFormElement.prototype, 'submit', patchedFormSubmit);
            }}

            const emitScrapedData = (data) => {{
                try {{
                    window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{
                        sourceId: '{}',
                        taskId: '{}',
                        secretKey: '{}',
                        data: data
                    }});
                }} catch (err) {{
                    console.error('Failed to emit scraped DOM data:', err);
                }}
            }};
            safeOverride(window, '__GLANCEUS_EMIT_SCRAPED_DATA', emitScrapedData);

            {}

            try {{
                {}
            }} catch(e) {{
                console.error('Inject script error:', e);
            }}
        }})();
        "#,
        intercept_api,
        source_id.as_str(),
        task_id.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        secret_key.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        secret_key.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        secret_key.as_str(),
        enhanced_patches,
        inject_script
    );

    close_existing_scraper_window(app, &source_id, &task_id, WINDOW_SCRAPER_WORKER)
        .await
        .map_err(|e| {
            clear_active_task(app);
            let _ = fail_scraper_task(app, &source_id, &task_id, Some(claimed.attempt), &e);
            e
        })?;

    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        "scraper_worker",
        tauri::WebviewUrl::External(url.parse::<tauri::Url>().map_err(|e| e.to_string())?),
    )
    .title("Background Worker")
    .initialization_script(&final_script);
    #[cfg(target_os = "macos")]
    {
        // Keep daemon worker attached to active Space during fullscreen transitions.
        // WKWebView execution depends on staying visible in view hierarchy on macOS.
        builder = builder
            .visible(true)
            .decorations(false)
            .inner_size(1.0, 1.0)
            .position(0.0, 0.0)
            .skip_taskbar(true)
            .visible_on_all_workspaces(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        // On Windows/Linux, keep daemon worker hidden to prevent UI flicker/focus steal.
        builder = builder
            .visible(false)
            .focused(false)
            .decorations(false)
            .skip_taskbar(true);
    }
    builder = apply_webview_proxy(app, builder, &source_id, &task_id);

    #[cfg(target_os = "macos")]
    {
        let state = app.state::<ScraperState>();
        let mut guard = state.app_nap_guard.lock().unwrap();
        *guard = Some(AppNapGuard::new("Background webview scraper running"));
    }

    let _webview = builder.build().map_err(|e| {
        clear_active_task(app);
        let message = format!("Failed to create window: {}", e);
        let _ = fail_scraper_task(app, &source_id, &task_id, Some(claimed.attempt), &message);
        message
    })?;

    emit_lifecycle_log(
        app,
        ScraperLifecycleLog::new(
            source_id,
            task_id,
            "window_ready",
            "info",
            "Daemon background window ready".to_string(),
        ),
    );
    Ok(())
}

pub fn start_scraper_daemon(app: &AppHandle) {
    let app_handle = app.clone();
    thread::spawn(move || loop {
        if let Some(active) = get_active_task_record(&app_handle) {
            if active.backend_managed {
                if let Err(err) = heartbeat_scraper_task(&app_handle, &active) {
                    emit_lifecycle_log(
                        &app_handle,
                        ScraperLifecycleLog::new(
                            active.source_id.clone(),
                            active.task_id.clone(),
                            "heartbeat_error",
                            "warn",
                            format!("Heartbeat failed: {}", err),
                        ),
                    );
                }
            }
            thread::sleep(SCRAPER_DAEMON_INTERVAL);
            continue;
        }

        match claim_scraper_task(&app_handle) {
            Ok(Some(task)) => {
                let app_for_task = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(err) = start_claimed_scraper_task(&app_for_task, &task).await {
                        let _ = fail_scraper_task(
                            &app_for_task,
                            &task.source_id,
                            &task.task_id,
                            Some(task.attempt),
                            &err,
                        );
                    }
                });
            }
            Ok(None) => {}
            Err(err) => {
                log::debug!("scraper daemon claim skipped: {}", err);
            }
        }
        thread::sleep(SCRAPER_DAEMON_INTERVAL);
    });
}

#[tauri::command]
pub async fn handle_scraped_data(
    window: Window,
    app: AppHandle,
    source_id: String,
    task_id: Option<String>,
    secret_key: String,
    data: serde_json::Value,
) -> Result<(), String> {
    ensure_invoker_window(
        &window,
        &[WINDOW_SCRAPER_WORKER, WINDOW_SCRAPER_FOREGROUND],
        "handle_scraped_data",
    )?;
    let resolved_task_id = task_id.unwrap_or_else(|| {
        let (_, active_task_id) = get_active_task(&app);
        if active_task_id == "unknown" {
            format!("task-{}", source_id)
        } else {
            active_task_id
        }
    });
    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            resolved_task_id.clone(),
            "data_received",
            "info",
            "API data intercepted".to_string(),
        )
        .with_details(serde_json::json!({
            "data_size": data.to_string().len()
        })),
    );

    // Deduplicate: only emit the first result for each task_id.
    // Fetch and XHR interceptors may both fire, causing duplicate invocations.
    {
        let state = app.state::<ScraperState>();
        let mut handled = state.handled_results.lock().unwrap();
        if handled.contains(&resolved_task_id) {
            return Ok(());
        }
        handled.insert(resolved_task_id.clone());
    }

    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            resolved_task_id.clone(),
            "task_complete",
            "info",
            "Scraper task completed successfully".to_string(),
        ),
    );

    let mut release_backend_guard = false;
    if let Some(active) = get_active_task_record(&app) {
        if active.task_id == resolved_task_id && active.source_id == source_id {
            if active.backend_managed {
                release_backend_guard = true;
                if let Err(err) = complete_scraper_task(
                    &app,
                    &source_id,
                    &resolved_task_id,
                    active.attempt,
                    &data,
                ) {
                    emit_lifecycle_log(
                        &app,
                        ScraperLifecycleLog::new(
                            source_id.clone(),
                            resolved_task_id.clone(),
                            "backend_complete_error",
                            "error",
                            format!("Failed to callback complete endpoint: {}", err),
                        ),
                    );
                }
            }
            clear_active_task(&app);
        }
    }

    app.emit(
        "scraper_result",
        serde_json::json!({
            "sourceId": source_id,
            "taskId": resolved_task_id,
            "secretKey": secret_key,
            "data": data
        }),
    )
    .map_err(|e| e.to_string())?;

    // Close the invoking scraper window since task is done.
    let _ = window.close();

    // Re-enable App Nap on macOS only when a backend-managed task completed.
    #[cfg(target_os = "macos")]
    if release_backend_guard {
        let state = app.state::<ScraperState>();
        let mut guard = state.app_nap_guard.lock().unwrap();
        *guard = None;
    }

    Ok(())
}

#[tauri::command]
pub async fn handle_scraper_auth(
    window: Window,
    app: AppHandle,
    source_id: String,
    task_id: Option<String>,
    target_url: String,
) -> Result<(), String> {
    ensure_invoker_window(
        &window,
        &[WINDOW_SCRAPER_WORKER, WINDOW_SCRAPER_FOREGROUND],
        "handle_scraper_auth",
    )?;
    let resolved_task_id = task_id.unwrap_or_else(|| {
        let (_, active_task_id) = get_active_task(&app);
        active_task_id
    });
    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            resolved_task_id.clone(),
            "auth_required",
            "warn",
            "Authentication required (401/403)".to_string(),
        )
        .with_details(serde_json::json!({
            "target_url": target_url
        })),
    );

    if let Some(active) = get_active_task_record(&app) {
        if active.task_id == resolved_task_id && active.source_id == source_id && active.backend_managed {
            if let Err(err) = fail_scraper_task(
                &app,
                &source_id,
                &resolved_task_id,
                active.attempt,
                "Authentication required while scraping",
            ) {
                emit_lifecycle_log(
                    &app,
                    ScraperLifecycleLog::new(
                        source_id.clone(),
                        resolved_task_id.clone(),
                        "backend_fail_error",
                        "error",
                        format!("Failed to callback fail endpoint: {}", err),
                    ),
                );
            }

            emit_lifecycle_log(
                &app,
                ScraperLifecycleLog::new(
                    source_id.clone(),
                    resolved_task_id.clone(),
                    "task_handoff_auth_required",
                    "info",
                    "Backend task handed off to manual auth recovery".to_string(),
                ),
            );

            if let Some(win) = app.get_webview_window(WINDOW_SCRAPER_WORKER) {
                let _ = win.close();
            }
            clear_active_task(&app);

            #[cfg(target_os = "macos")]
            {
                let state = app.state::<ScraperState>();
                let mut guard = state.app_nap_guard.lock().unwrap();
                *guard = None;
            }
        }
    }

    app.emit(
        "scraper_auth_required",
        serde_json::json!({
            "sourceId": source_id,
            "taskId": resolved_task_id,
            "targetUrl": target_url
        }),
    )
    .map_err(|e| e.to_string())?;

    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            resolved_task_id.clone(),
            "manual_action_required",
            "warn",
            "Authentication required; waiting for explicit user action to open the foreground window"
                .to_string(),
        ),
    );
    Ok(())
}

#[tauri::command]
pub async fn show_scraper_window(window: Window, app: AppHandle) -> Result<(), String> {
    ensure_invoker_window(&window, &[WINDOW_MAIN], "show_scraper_window")?;
    let (source_id, task_id) = get_active_task(&app);
    if let Some(win) = app
        .get_webview_window(WINDOW_SCRAPER_WORKER)
        .or_else(|| app.get_webview_window(WINDOW_SCRAPER_FOREGROUND))
    {
        emit_lifecycle_log(
            &app,
            ScraperLifecycleLog::new(
                source_id,
                task_id,
                "window_shown",
                "info",
                "Manual window show requested".to_string(),
            ),
        );
        let _ = win.set_decorations(true);
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(800.0, 600.0)));
        let _ = win.center();
        let _ = win.show();
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn promote_active_scraper_to_foreground(
    window: Window,
    app: AppHandle,
    source_id: Option<String>,
) -> Result<bool, String> {
    ensure_invoker_window(
        &window,
        &[WINDOW_MAIN],
        "promote_active_scraper_to_foreground",
    )?;

    let Some(active) = get_active_task_record(&app) else {
        return Ok(false);
    };
    if !active.backend_managed {
        return Ok(false);
    }
    if let Some(expected_source_id) = source_id.as_ref() {
        if active.source_id != *expected_source_id {
            return Ok(false);
        }
    }

    let source_id = active.source_id.clone();
    let task_id = active.task_id.clone();
    let attempt = active.attempt;
    let url = active.url.clone();
    let inject_script = active.inject_script.clone();
    let intercept_api = active.intercept_api.clone();
    let secret_key = active.secret_key.clone();

    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            task_id.clone(),
            "promote_to_foreground",
            "info",
            "Promoting active queue task to foreground manual mode".to_string(),
        ),
    );

    if let Err(err) = fail_scraper_task(
        &app,
        &source_id,
        &task_id,
        attempt,
        "Moved to manual foreground mode by user",
    ) {
        emit_lifecycle_log(
            &app,
            ScraperLifecycleLog::new(
                source_id.clone(),
                task_id.clone(),
                "promote_fail_callback_error",
                "warn",
                format!("Failed to mark backend task as failed: {err}"),
            ),
        );
        let _ = clear_scraper_tasks(&app, Some(&source_id));
    }

    if let Some(win) = app.get_webview_window(WINDOW_SCRAPER_WORKER) {
        let _ = win.close();
    }
    clear_active_task(&app);

    #[cfg(target_os = "macos")]
    {
        let state = app.state::<ScraperState>();
        let mut guard = state.app_nap_guard.lock().unwrap();
        *guard = None;
    }

    push_scraper_task(
        window,
        app,
        source_id,
        url,
        inject_script,
        intercept_api,
        secret_key,
        Some(true),
    )
    .await?;

    Ok(true)
}

#[tauri::command]
pub async fn cancel_scraper_task(window: Window, app: AppHandle) -> Result<(), String> {
    ensure_invoker_window(&window, &[WINDOW_MAIN], "cancel_scraper_task")?;
    let (source_id, task_id) = get_active_task(&app);
    let active = get_active_task_record(&app);

    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            task_id.clone(),
            "task_cancelled",
            "warn",
            "Scraper task cancelled by user".to_string(),
        ),
    );

    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.close();
    }
    if let Some(active_task) = active {
        if active_task.backend_managed
            && active_task.task_id == task_id
            && active_task.source_id == source_id
        {
            let _ = fail_scraper_task(
                &app,
                &source_id,
                &task_id,
                active_task.attempt,
                "Scraper task cancelled by user",
            );
        }
    }
    clear_active_task(&app);

    // Re-enable App Nap on macOS when scraper is cancelled
    #[cfg(target_os = "macos")]
    {
        let state = app.state::<ScraperState>();
        let mut guard = state.app_nap_guard.lock().unwrap();
        *guard = None; // Drop the guard, which calls endActivity
    }

    Ok(())
}

#[tauri::command]
pub async fn clear_scraper_queue(
    window: Window,
    app: AppHandle,
    source_id: Option<String>,
) -> Result<usize, String> {
    ensure_invoker_window(&window, &[WINDOW_MAIN], "clear_scraper_queue")?;
    clear_scraper_tasks(&app, source_id.as_deref())
}

#[tauri::command]
pub async fn get_scraper_queue_snapshot(
    window: Window,
    app: AppHandle,
) -> Result<ScraperQueueSnapshot, String> {
    ensure_invoker_window(&window, &[WINDOW_MAIN], "get_scraper_queue_snapshot")?;
    let listed_tasks = list_active_scraper_tasks(&app)?;
    let mut queue_source_ids: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for task in listed_tasks {
        let source_id = task.source_id;
        if source_id.is_empty() || seen.contains(&source_id) {
            continue;
        }
        seen.insert(source_id.clone());
        queue_source_ids.push(source_id);
    }

    let active_source_id = get_active_task_record(&app).and_then(|active| {
        if active.backend_managed {
            Some(active.source_id)
        } else {
            None
        }
    });

    Ok(ScraperQueueSnapshot {
        active_source_id,
        queue_source_ids,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn extract_function_body(source: &str, fn_name: &str) -> String {
        let fn_marker = source
            .find(fn_name)
            .unwrap_or_else(|| panic!("Function marker not found: {}", fn_name));
        let body_start = source[fn_marker..]
            .find('{')
            .map(|idx| fn_marker + idx)
            .unwrap_or_else(|| panic!("Function body start not found: {}", fn_name));

        let mut depth = 0usize;
        let mut end = None;
        for (idx, ch) in source[body_start..].char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(body_start + idx);
                        break;
                    }
                }
                _ => {}
            }
        }
        let body_end = end.unwrap_or_else(|| panic!("Function body end not found: {}", fn_name));
        source[body_start..=body_end].to_string()
    }

    fn make_log(task_id: &str, stage: &str, message: &str) -> ScraperLifecycleLog {
        ScraperLifecycleLog::new(
            "source-1".to_string(),
            task_id.to_string(),
            stage,
            "debug",
            message.to_string(),
        )
    }

    #[test]
    fn drops_excessive_consecutive_duplicates() {
        let mut state = LogControlState::default();
        let now = 1_000_u128;
        for idx in 0..MAX_CONSECUTIVE_DUPLICATE_LOGS {
            let decision = state.evaluate(&make_log("task-1", "loop", "same"), now + idx as u128);
            assert!(matches!(decision, LogDecision::Emit));
        }
        let drop_decision = state.evaluate(
            &make_log("task-1", "loop", "same"),
            now + MAX_CONSECUTIVE_DUPLICATE_LOGS as u128 + 1,
        );
        assert!(matches!(drop_decision, LogDecision::Drop));
    }

    #[test]
    fn kills_task_when_log_burst_threshold_hit() {
        let mut state = LogControlState::default();
        let now = 10_000_u128;
        for idx in 0..LOG_BURST_LIMIT {
            let decision = state.evaluate(
                &make_log("task-burst", "spam", &format!("log-{}", idx)),
                now + 1,
            );
            assert!(matches!(decision, LogDecision::Emit));
        }
        let kill_decision =
            state.evaluate(&make_log("task-burst", "spam", "log-overflow"), now + 1);
        assert!(matches!(kill_decision, LogDecision::Kill { .. }));
    }

    #[test]
    fn auth_required_handler_emits_callback_without_auto_focus_contract() {
        let source = include_str!("scraper.rs");
        let body = extract_function_body(source, "pub async fn handle_scraper_auth");

        assert!(
            body.contains("fail_scraper_task("),
            "Auth-required fallback should keep backend fail callback"
        );
        assert!(
            body.contains("\"scraper_auth_required\""),
            "Auth-required fallback should emit scraper_auth_required event"
        );
        assert!(
            !body.contains("window.show("),
            "Auth-required fallback must not auto-show the scraper window"
        );
        assert!(
            !body.contains("window.set_focus("),
            "Auth-required fallback must not auto-focus the scraper window"
        );
    }

    #[test]
    fn auth_required_handler_ends_active_task_lifecycle_contract() {
        let source = include_str!("scraper.rs");
        let body = extract_function_body(source, "pub async fn handle_scraper_auth");

        assert!(
            body.contains("task_handoff_auth_required"),
            "Auth-required fallback should emit an explicit lifecycle handoff stage"
        );
        assert!(
            body.contains("clear_active_task(&app);"),
            "Auth-required fallback should terminate active task tracking"
        );
    }

    #[test]
    fn explicit_manual_foreground_paths_still_focus_window_contract() {
        let source = include_str!("scraper.rs");
        let show_window_body = extract_function_body(source, "pub async fn show_scraper_window");
        let push_task_body = extract_function_body(source, "pub async fn push_scraper_task");

        assert!(
            show_window_body.contains("win.show("),
            "Manual show_scraper_window path should still show the window"
        );
        assert!(
            show_window_body.contains("win.set_focus("),
            "Manual show_scraper_window path should still focus the window"
        );
        assert!(
            push_task_body.contains("_webview.show("),
            "Explicit foreground task start should still show the window"
        );
        assert!(
            push_task_body.contains("_webview.set_focus("),
            "Explicit foreground task start should still focus the window"
        );
    }

    #[test]
    fn scraper_injection_keeps_images_and_bridges_popups_contract() {
        let source = include_str!("scraper.rs");
        let push_task_body = extract_function_body(source, "pub async fn push_scraper_task");
        let daemon_body = extract_function_body(source, "async fn start_claimed_scraper_task");

        for body in [&push_task_body, &daemon_body] {
            assert!(
                !body.contains("const blockExtensions"),
                "Scraper injection must not hard-block image/font resources"
            );
            assert!(
                !body.contains("data:image/gif;base64"),
                "Scraper injection must not rewrite <img> into placeholder data URLs"
            );
            assert!(
                body.contains("safeOverride(window, 'open'"),
                "Scraper injection should patch window.open for popup fallback"
            );
            assert!(
                body.contains("a[target=\"_blank\"]"),
                "Scraper injection should handle target=_blank links"
            );
            assert!(
                body.contains("rewriteBlankFormTarget"),
                "Scraper injection should handle target=_blank forms"
            );
        }
    }

    #[test]
    fn webview_builder_applies_app_proxy_without_fallback_noise_contract() {
        let source = include_str!("scraper.rs");
        let body = extract_function_body(source, "fn apply_webview_proxy");

        assert!(
            body.contains("resolve_webview_proxy_url(app)"),
            "WebView scraper should resolve proxy from app settings"
        );
        assert!(
            body.contains("if let Some(proxy_url)"),
            "WebView scraper should only apply proxy when app proxy is configured"
        );
        assert!(
            body.contains("builder.proxy_url(proxy_url)"),
            "WebView scraper should apply app-level proxy when configured"
        );
        assert!(
            !body.contains("proxy_fallback_system"),
            "WebView scraper should avoid non-critical fallback lifecycle logs"
        );
    }

    #[test]
    fn macos_background_webview_keeps_all_spaces_visibility_contract() {
        let source = include_str!("scraper.rs");
        let push_task_body = extract_function_body(source, "pub async fn push_scraper_task");
        let daemon_body = extract_function_body(source, "async fn start_claimed_scraper_task");

        for body in [&push_task_body, &daemon_body] {
            assert!(
                body.contains("visible_on_all_workspaces(true)"),
                "macOS background scraper windows should stay visible across all Spaces"
            );
        }
    }

    #[test]
    fn enhanced_scraping_switch_injects_visibility_hooks_contract() {
        let source = include_str!("scraper.rs");
        let push_task_body = extract_function_body(source, "pub async fn push_scraper_task");
        let daemon_body = extract_function_body(source, "async fn start_claimed_scraper_task");
        let helper_body = extract_function_body(source, "fn enhanced_scrape_patches_script");

        assert!(
            helper_body.contains("visibilityState"),
            "Enhanced scraping helper should patch document.visibilityState"
        );
        assert!(
            helper_body.contains("IntersectionObserver"),
            "Enhanced scraping helper should patch IntersectionObserver"
        );
        assert!(
            helper_body.contains("requestAnimationFrame"),
            "Enhanced scraping helper should patch requestAnimationFrame"
        );
        assert!(
            helper_body.contains("cancelAnimationFrame"),
            "Enhanced scraping helper should patch cancelAnimationFrame"
        );
        assert!(
            helper_body.contains("visibilitychange"),
            "Enhanced scraping helper should block visibilitychange listeners"
        );

        for body in [&push_task_body, &daemon_body] {
            assert!(
                body.contains("resolve_enhanced_scraping_enabled"),
                "Scraper task path should read enhanced scraping switch from settings"
            );
            assert!(
                body.contains("enhanced_scrape_patches_script"),
                "Scraper task path should compose enhanced scraping patches"
            );
            assert!(
                body.contains("enhanced_scraping_status"),
                "Scraper task path should emit lifecycle status for enhanced scraping switch"
            );
        }
    }
}
