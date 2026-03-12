use serde::Serialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Mutex;
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
    let (_, active_task_id) = get_active_task(app);
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

            println!("[Scraper Debug] App Nap disabled: {:?}", activity);

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
            println!("[Scraper Debug] App Nap re-enabled");
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
}

pub struct ScraperState {
    pub handled_results: Mutex<HashSet<String>>,
    pub active_task: Mutex<Option<ActiveScraperTask>>,
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
            log_control: Mutex::new(LogControlState::default()),
            error_logs_by_source: Mutex::new(HashMap::new()),
            #[cfg(target_os = "macos")]
            app_nap_guard: Mutex::new(None),
        }
    }
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

fn set_active_task(app: &AppHandle, source_id: String, task_id: String) {
    let state = app.state::<ScraperState>();
    let mut active = state.active_task.lock().unwrap();
    let previous_task_id = active.as_ref().map(|task| task.task_id.clone());
    *active = Some(ActiveScraperTask { source_id, task_id });
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

async fn close_existing_scraper_window(
    app: &AppHandle,
    source_id: &str,
    task_id: &str,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("scraper_worker") {
        emit_lifecycle_log(
            app,
            ScraperLifecycleLog::new(
                source_id.to_string(),
                task_id.to_string(),
                "window_cleanup",
                "debug",
                "Closing existing scraper window".to_string(),
            ),
        );
        let _ = win.close();
    } else {
        return Ok(());
    }

    for _ in 0..20 {
        if app.get_webview_window("scraper_worker").is_none() {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }

    Err("Timed out waiting for existing scraper window to close".to_string())
}

#[tauri::command]
pub async fn scraper_log(window: Window, app: AppHandle, message: String) -> Result<(), String> {
    ensure_invoker_window(&window, &[WINDOW_SCRAPER_WORKER], "scraper_log")?;
    let (source_id, task_id) = get_active_task(&app);
    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(source_id, task_id, "js_log", "debug", message),
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
    set_active_task(&app, source_id.clone(), task_id.clone());

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

            // Resource blocker
            const blockExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf'];
            
            const originalFetch = window.fetch;
            const patchedFetch = async function(...args) {{
                const reqUrl = (typeof args[0] === 'string' ? args[0] : args[0]?.url) || '';
                
                // Block static resources
                if (blockExtensions.some(ext => reqUrl.toLowerCase().includes(ext))) {{
                    return new Response('', {{ status: 200, statusText: 'Blocked' }});
                }}
                
                // Intercept Target API
                if (reqUrl.includes('{}')) {{
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
                    if (this._url && this._url.includes('{}')) {{
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

            // DOM Blocker for Images
            const observer = new MutationObserver(mutations => {{
                for (const mutation of mutations) {{
                    for (const node of mutation.addedNodes) {{
                        if (node.tagName === 'IMG') {{
                            try {{ node.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; }} catch(e) {{}}
                        }} else if (node.querySelectorAll) {{
                            const imgs = node.querySelectorAll('img');
                            imgs.forEach(img => {{ try {{ img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; }} catch(e) {{}} }});
                        }}
                    }}
                }}
            }});
            
            // Start observing as soon as possible
            if (document.documentElement) {{
                observer.observe(document.documentElement, {{ childList: true, subtree: true }});
            }} else {{
                document.addEventListener('DOMContentLoaded', () => {{
                    observer.observe(document.documentElement, {{ childList: true, subtree: true }});
                }});
            }}

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
        intercept_api,
        source_id.as_str(),
        task_id.as_str(),
        source_id.as_str(),
        task_id.as_str(),
        secret_key.as_str(),
        inject_script
    );

    // If a scraper window already exists, close it and wait until it is removed.
    close_existing_scraper_window(&app, &source_id, &task_id)
        .await
        .map_err(|e| {
            clear_active_task(&app);
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

    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            task_id.clone(),
            "window_creating",
            "info",
            "Creating webview window".to_string(),
        ),
    );

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "scraper_worker",
        tauri::WebviewUrl::External(url.parse().unwrap()),
    )
    .title(if foreground {
        "Manual Scraper"
    } else {
        "Background Worker"
    })
    .initialization_script(&final_script);

    if foreground {
        emit_lifecycle_log(
            &app,
            ScraperLifecycleLog::new(
                source_id.clone(),
                task_id.clone(),
                "window_mode",
                "info",
                "Foreground mode enabled".to_string(),
            ),
        );
        builder = builder
            .visible(true)
            .decorations(true)
            .inner_size(960.0, 720.0)
            .resizable(true);
    } else {
        emit_lifecycle_log(
            &app,
            ScraperLifecycleLog::new(
                source_id.clone(),
                task_id.clone(),
                "window_mode",
                "info",
                "Background mode enabled".to_string(),
            ),
        );
        // Background mode: disable App Nap on macOS to prevent WKWebView suspension
        #[cfg(target_os = "macos")]
        {
            let state = app.state::<ScraperState>();
            let mut guard = state.app_nap_guard.lock().unwrap();
            *guard = Some(AppNapGuard::new("Background webview scraper running"));
            emit_lifecycle_log(
                &app,
                ScraperLifecycleLog::new(
                    source_id.clone(),
                    task_id.clone(),
                    "app_nap_disabled",
                    "debug",
                    "macOS App Nap disabled".to_string(),
                ),
            );
        }

        // CRITICAL: WKWebView must be in the view hierarchy to execute JavaScript
        // Off-screen positioning (-10000, -10000) removes it from view hierarchy
        // Solution: Use minimal size at (0, 0) with visible(true) but effectively invisible
        // The window will be 1x1 pixel in top-left corner - invisible but in view hierarchy
        builder = builder
            .visible(true)
            .decorations(false)
            .inner_size(1.0, 1.0)
            .position(0.0, 0.0)
            .skip_taskbar(true);
    }

    let _webview = builder.build().map_err(|e| {
        clear_active_task(&app);
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

    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id.clone(),
            task_id.clone(),
            "window_created",
            "info",
            "Webview window created successfully".to_string(),
        ),
    );

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

#[tauri::command]
pub async fn handle_scraped_data(
    window: Window,
    app: AppHandle,
    source_id: String,
    task_id: Option<String>,
    secret_key: String,
    data: serde_json::Value,
) -> Result<(), String> {
    ensure_invoker_window(&window, &[WINDOW_SCRAPER_WORKER], "handle_scraped_data")?;
    let resolved_task_id = task_id.unwrap_or_else(|| {
        let (_, active_task_id) = get_active_task(&app);
        if active_task_id == "unknown" {
            format!("task-{}", source_id)
        } else {
            active_task_id
        }
    });
    println!(
        "[Scraper Debug] handle_scraped_data called for source_id: {}, task_id: {}",
        source_id, resolved_task_id
    );

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
            println!(
                "[Scraper Debug] Duplicate handle_scraped_data for task {}, ignoring.",
                resolved_task_id
            );
            emit_lifecycle_log(
                &app,
                ScraperLifecycleLog::new(
                    source_id.clone(),
                    resolved_task_id.clone(),
                    "data_duplicate",
                    "debug",
                    "Duplicate data ignored (deduplication)".to_string(),
                ),
            );
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

    // Close the scraper window since task is done
    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.close();
    }
    clear_active_task(&app);

    // Re-enable App Nap on macOS after scraping completes
    #[cfg(target_os = "macos")]
    {
        let state = app.state::<ScraperState>();
        let mut guard = state.app_nap_guard.lock().unwrap();
        *guard = None; // Drop the guard, which calls endActivity
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
    ensure_invoker_window(&window, &[WINDOW_SCRAPER_WORKER], "handle_scraper_auth")?;
    let resolved_task_id = task_id.unwrap_or_else(|| {
        let (_, active_task_id) = get_active_task(&app);
        active_task_id
    });
    println!(
        "[Scraper Debug] handle_scraper_auth called for source_id: {}, task_id: {}, target_url: {}",
        source_id, resolved_task_id, target_url
    );

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

    app.emit(
        "scraper_auth_required",
        serde_json::json!({
            "sourceId": source_id,
            "taskId": resolved_task_id,
            "targetUrl": target_url
        }),
    )
    .map_err(|e| e.to_string())?;

    // Show the window to allow user to log in
    if let Some(win) = app.get_webview_window("scraper_worker") {
        emit_lifecycle_log(
            &app,
            ScraperLifecycleLog::new(
                source_id.clone(),
                resolved_task_id.clone(),
                "window_shown",
                "info",
                "Showing window for manual authentication".to_string(),
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
pub async fn show_scraper_window(window: Window, app: AppHandle) -> Result<(), String> {
    ensure_invoker_window(&window, &[WINDOW_MAIN], "show_scraper_window")?;
    let (source_id, task_id) = get_active_task(&app);
    println!("[Scraper Debug] show_scraper_window called");
    if let Some(win) = app.get_webview_window("scraper_worker") {
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
pub async fn cancel_scraper_task(window: Window, app: AppHandle) -> Result<(), String> {
    ensure_invoker_window(&window, &[WINDOW_MAIN], "cancel_scraper_task")?;
    let (source_id, task_id) = get_active_task(&app);
    println!("[Scraper Debug] cancel_scraper_task called");

    emit_lifecycle_log(
        &app,
        ScraperLifecycleLog::new(
            source_id,
            task_id,
            "task_cancelled",
            "warn",
            "Scraper task cancelled by user".to_string(),
        ),
    );

    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.close();
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
