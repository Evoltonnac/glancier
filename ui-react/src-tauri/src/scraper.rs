use tauri::{AppHandle, Manager};
use tauri::Emitter;
use std::collections::HashSet;
use std::sync::Mutex;

/// Global state to deduplicate scraper results.
/// Fetch + XHR interceptors can both fire for the same request,
/// so we only process the first result per source_id.
pub struct ScraperState {
    pub handled_results: Mutex<HashSet<String>>,
}

impl Default for ScraperState {
    fn default() -> Self {
        ScraperState {
            handled_results: Mutex::new(HashSet::new()),
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
    println!(
        "[Scraper Debug] push_scraper_task called for source_id: {}, url: {}, foreground: {}",
        source_id, url, foreground
    );
    
    // Clear any previous dedup record for this source so the new task's result is processed
    {
        let state = app.state::<ScraperState>();
        let mut handled = state.handled_results.lock().unwrap();
        handled.remove(&source_id);
    }
    
    let final_script = format!(
        r#"
        (function() {{
            function logDebug(msg) {{
                try {{
                    window.__TAURI_INTERNALS__.invoke('scraper_log', {{ message: msg }});
                }} catch(e) {{}}
            }}
            logDebug('Scraper initialization started');
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
                    logDebug('Matched intercept API: ' + reqUrl);
                    const response = await originalFetch.apply(this, args);
                    logDebug('Response received with status: ' + response.status);
                    if (response.status === 401 || response.status === 403) {{
                        logDebug('Auth required triggered');
                        window.__TAURI_INTERNALS__.invoke('handle_scraper_auth', {{ sourceId: '{}', targetUrl: reqUrl }});
                    }} else {{
                        const cloneRes = response.clone();
                        cloneRes.json().then(data => {{
                            logDebug('JSON parse successful, sending scraped data');
                            window.__TAURI_INTERNALS__.invoke('handle_scraped_data', {{ 
                                sourceId: '{}', 
                                secretKey: '{}',
                                data: data 
                            }});
                        }}).catch(e => {{
                            logDebug('Failed to capture JSON: ' + e);
                            console.error('Failed to capture JSON:', e);
                        }});
                    }}
                    return response;
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
                logDebug('Executing user inject script');
                {}
                logDebug('User inject script executed cleanly');
            }} catch(e) {{ 
                logDebug('Inject script error: ' + String(e));
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
        println!("[Scraper Debug] closing existing scraper_worker");
        let _ = win.close();
    }

    println!("[Scraper Debug] building new WebviewWindow for url: {}", url);
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
        // 关键：macOS App Nap 会挂起 visible(false) 的 WKWebView 执行
        // 我们将其设为 visible(true)，但非常小、透明，且位置在屏幕之外
        builder = builder
            .visible(true)
            .decorations(false)
            .inner_size(10.0, 10.0)
            .position(-10000.0, -10000.0);
    }

    let _webview = builder.build().map_err(|e| {
        println!("[Scraper Debug] failed to build webview: {}", e);
        e.to_string()
    })?;

    if foreground {
        let _ = _webview.center();
        let _ = _webview.show();
        let _ = _webview.set_focus();
    }
    
    println!("[Scraper Debug] WebviewWindow built successfully");

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
    Ok(())
}
