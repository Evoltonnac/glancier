import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ThemeProvider } from "./components/theme-provider.tsx";
import { I18nProvider } from "./i18n";
import { isTauri, openExternalLink } from "./lib/utils.ts";

// Global override for window.open in Tauri to ensure links open in system browser
if (isTauri()) {
    const originalOpen = window.open.bind(window);
    (window as any).__GLANCEUS_NATIVE_OPEN__ = originalOpen;
    window.open = (url?: string | URL, target?: string, features?: string) => {
        const urlStr = url?.toString();
        if (urlStr && (urlStr.startsWith("http://") || urlStr.startsWith("https://"))) {
            openExternalLink(urlStr).catch((err) => {
                console.error("Failed to open URL:", err);
                originalOpen(url, target, features);
            });
            return null;
        }
        return originalOpen(url, target, features);
    };

    // Global click interceptor for standard <a> tags with target="_blank"
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        
        if (anchor && anchor.href && (anchor.href.startsWith('http://') || anchor.href.startsWith('https://'))) {
            // If it's meant to open in a new tab or if it's an external domain
            if (anchor.target === '_blank' || new URL(anchor.href).origin !== window.location.origin) {
                e.preventDefault();
                openExternalLink(anchor.href).catch(console.error);
            }
        }
    }, true); // use capture phase to intercept before Monaco or other libraries
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ThemeProvider>
            <I18nProvider>
                <App />
            </I18nProvider>
        </ThemeProvider>
    </React.StrictMode>,
);
