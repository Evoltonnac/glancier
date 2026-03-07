use tauri::{AppHandle, Manager};
use tauri::Emitter;
use std::collections::HashSet;
use std::sync::Mutex;

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
/// so we only process the first result per source_id.
pub struct ScraperState {
    pub handled_results: Mutex<HashSet<String>>,
    #[cfg(target_os = "macos")]
    pub app_nap_guard: Mutex<Option<AppNapGuard>>,
}

impl Default for ScraperState {
    fn default() -> Self {
        ScraperState {
            handled_results: Mutex::new(HashSet::new()),
            #[cfg(target_os = "macos")]
            app_nap_guard: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn scraper_log(message: String) -> Result<(), String> {
    println!("[Scraper JS Debug] {}", message);
    Ok(())
}

#[tauri::command]
pub async fn push_scraper_task(
    app: AppHandle,
    source_id: String,
    url: String,
    inject_script: String,
    intercept_api: String,
    secret_key: String,
    foreground: Option<bool>,
) -> Result<(), String> {
    let foreground = foreground.unwrap_or(false);

    // Clear any previous dedup record for this source so the new task's result is processed
    {
        let state = app.state::<ScraperState>();
        let mut handled = state.handled_results.lock().unwrap();
        handled.remove(&source_id);
    }
    
    let final_script = format!(
        r#"
        (function() {{
            // Resource blocker
            const blockExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf'];
            
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {{
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
                            window.__TAURI_INTERNALS__.invoke('handle_scraper_auth', {{ sourceId: '{}', targetUrl: reqUrl }});
                        }} else {{
                            const cloneRes = response.clone();
                            cloneRes.json().then(data => {{
                                window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{
                                    sourceId: '{}',
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
            
            // XHR overrides (Optional, if target uses XHR instead of Fetch)
            const originalXhrOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, xUrl, ...rest) {{
                this._url = xUrl;
                return originalXhrOpen.call(this, method, xUrl, ...rest);
            }};

            const originalXhrSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function(body) {{
                this.addEventListener('load', function() {{
                    if (this._url && this._url.includes('{}')) {{
                         if (this.status === 401 || this.status === 403) {{
                             window.__TAURI_INTERNALS__.invoke('handle_scraper_auth', {{ sourceId: '{}', targetUrl: this._url }});
                         }} else {{
                             try {{
                                 const data = JSON.parse(this.responseText);
                                 window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{
                                     sourceId: '{}',
                                     secretKey: '{}',
                                     data: data
                                 }});
                             }} catch(e) {{}}
                         }}
                    }}
                }});
                this.addEventListener('error', function() {{}});
                }});
                return originalXhrSend.call(this, body);
            }};

            // DOM Blocker for Images
            const observer = new MutationObserver(mutations => {{
                for (const mutation of mutations) {{
                    for (const node of mutation.addedNodes) {{
                        if (node.tagName === 'IMG') {{
                            node.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // 1x1 transparent
                        }} else if (node.querySelectorAll) {{
                            const imgs = node.querySelectorAll('img');
                            imgs.forEach(img => img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=');
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
        intercept_api, source_id, source_id, secret_key, 
        intercept_api, source_id, source_id, secret_key,
        inject_script
    );

    // If a scraper window already exists, close it to avoid state pollution and cleanly re-inject
    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.close();
    }

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "scraper_worker",
        tauri::WebviewUrl::External(url.parse().unwrap())
    )
        .title(if foreground { "Manual Scraper" } else { "Background Worker" })
        .initialization_script(&final_script);

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

    let _webview = builder.build().map_err(|e| e.to_string())?;

    if foreground {
        let _ = _webview.center();
        let _ = _webview.show();
        let _ = _webview.set_focus();
    }

    Ok(())
}

#[tauri::command]
pub async fn handle_scraped_data(
    app: AppHandle,
    source_id: String,
    secret_key: String,
    data: serde_json::Value,
) -> Result<(), String> {
    println!("[Scraper Debug] handle_scraped_data called for source_id: {}", source_id);
    
    // Deduplicate: only emit the first result for each source_id.
    // Fetch and XHR interceptors may both fire, causing duplicate invocations.
    {
        let state = app.state::<ScraperState>();
        let mut handled = state.handled_results.lock().unwrap();
        if handled.contains(&source_id) {
            println!("[Scraper Debug] Duplicate handle_scraped_data for {}, ignoring.", source_id);
            return Ok(());
        }
        handled.insert(source_id.clone());
    }
    
    app.emit("scraper_result", serde_json::json!({
        "sourceId": source_id,
        "secretKey": secret_key,
        "data": data
    })).map_err(|e| e.to_string())?;

    // Close the scraper window since task is done
    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.close();
    }

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
    app: AppHandle,
    source_id: String,
    target_url: String,
) -> Result<(), String> {
    println!("[Scraper Debug] handle_scraper_auth called for source_id: {}, target_url: {}", source_id, target_url);

    app.emit("scraper_auth_required", serde_json::json!({
        "sourceId": source_id,
        "targetUrl": target_url
    })).map_err(|e| e.to_string())?;
    
    // Show the window to allow user to log in
    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.set_decorations(true);
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(800.0, 600.0)));
        let _ = win.center();
        let _ = win.show();
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn show_scraper_window(
    app: AppHandle,
) -> Result<(), String> {
    println!("[Scraper Debug] show_scraper_window called");
    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.set_decorations(true);
        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize::new(800.0, 600.0)));
        let _ = win.center();
        let _ = win.show();
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_scraper_task(
    app: AppHandle,
) -> Result<(), String> {
    println!("[Scraper Debug] cancel_scraper_task called");
    if let Some(win) = app.get_webview_window("scraper_worker") {
        let _ = win.close();
    }

    // Re-enable App Nap on macOS when scraper is cancelled
    #[cfg(target_os = "macos")]
    {
        let state = app.state::<ScraperState>();
        let mut guard = state.app_nap_guard.lock().unwrap();
        *guard = None; // Drop the guard, which calls endActivity
    }

    Ok(())
}
