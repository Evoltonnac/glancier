import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStore } from "../store";
import { api } from "../api/client";
import type { SourceSummary } from "../types/config";

export function useScraper() {
    const sources = useStore((state) => state.sources);
    const setSources = useStore((state) => state.setSources);
    const setDataMap = useStore((state) => state.setDataMap);
    const activeScraper = useStore((state) => state.activeScraper);
    const setActiveScraper = useStore((state) => state.setActiveScraper);
    const skippedScrapers = useStore((state) => state.skippedScrapers);
    const addSkippedScraper = useStore((state) => state.addSkippedScraper);
    const setSkippedScrapers = useStore((state) => state.setSkippedScrapers);
    const [queueNonce, setQueueNonce] = useState(0);

    const activeScraperRef = useRef<string | null>(null);
    const manualQueuedRef = useRef<Set<string>>(new Set());
    const foregroundOverridesRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        activeScraperRef.current = activeScraper;
    }, [activeScraper]);

    const bumpQueueNonce = useCallback(() => {
        setQueueNonce((prev) => prev + 1);
    }, []);

    // Compute the current queue of webview scrapers
    const webviewQueue = sources.filter(
        (source) => {
            const isWebviewInteraction =
                source.status === "suspended" &&
                source.interaction?.type === "webview_scrape";
            if (!isWebviewInteraction || skippedScrapers.has(source.id)) {
                return false;
            }

            const manualOnly = Boolean(source.interaction?.data?.manual_only);
            if (!manualOnly) {
                return true;
            }
            return manualQueuedRef.current.has(source.id);
        },
    );

    // Actions
    const handleSkipScraper = useCallback(async () => {
        if (!activeScraper) return;

        try {
            await invoke("cancel_scraper_task");
        } catch (error) {
            console.error("Failed to cancel scraper task:", error);
        }

        manualQueuedRef.current.delete(activeScraper);
        foregroundOverridesRef.current.delete(activeScraper);
        addSkippedScraper(activeScraper);
        setActiveScraper(null);
        bumpQueueNonce();
    }, [activeScraper, addSkippedScraper, setActiveScraper, bumpQueueNonce]);

    const handleClearScraperQueue = useCallback(async () => {
        if (activeScraper) {
            try {
                await invoke("cancel_scraper_task");
            } catch (error) {
                console.error("Failed to cancel active scraper task:", error);
            }
        }

        const newSkipped = new Set(skippedScrapers);
        if (activeScraper) newSkipped.add(activeScraper);
        webviewQueue.forEach((s) => newSkipped.add(s.id));
        setSkippedScrapers(newSkipped);
        setActiveScraper(null);
        manualQueuedRef.current.clear();
        foregroundOverridesRef.current.clear();
        bumpQueueNonce();
    }, [activeScraper, skippedScrapers, webviewQueue, setSkippedScrapers, setActiveScraper, bumpQueueNonce]);

    const handlePushToQueue = useCallback((
        source: SourceSummary,
        options?: { foreground?: boolean },
    ): boolean => {
        const forceForeground =
            Boolean(options?.foreground) ||
            Boolean(source.interaction?.data?.force_foreground);

        if (forceForeground) {
            foregroundOverridesRef.current.add(source.id);
        }
        if (source.interaction?.data?.manual_only) {
            manualQueuedRef.current.add(source.id);
        }

        if (activeScraper === source.id) {
            if (forceForeground) {
                void invoke("show_scraper_window").catch((error) =>
                    console.error("Failed to show scraper window:", error),
                );
                return true;
            }
            alert(`"${source.name}" 的抓取任务已在运行中。`);
            return false;
        }
        const alreadyInQueue = webviewQueue.some((s) => s.id === source.id);
        if (alreadyInQueue) {
            if (forceForeground) {
                void invoke("show_scraper_window").catch((error) =>
                    console.error("Failed to show scraper window:", error),
                );
            }
            alert(`"${source.name}" 已在抓取队列中，请勿重复添加。`);
            return false;
        }
        
        const next = new Set(skippedScrapers);
        next.delete(source.id);
        setSkippedScrapers(next);
        
        console.log(`手动将 ${source.name} (${source.id}) 加入抓取队列`);
        bumpQueueNonce();
        return true;
    }, [activeScraper, webviewQueue, skippedScrapers, setSkippedScrapers, bumpQueueNonce]);

    const handleShowScraperWindow = useCallback(async () => {
        try {
            await invoke("show_scraper_window");
        } catch (error) {
            console.error("Failed to show scraper window:", error);
        }
    }, []);

    // 1. Dynamic Polling for refreshing sources
    useEffect(() => {
        const refreshingSources = sources.filter(
            (s) => s.status === "refreshing",
        );
        if (refreshingSources.length === 0) return;

        const interval = setInterval(async () => {
            try {
                const updatedSources = await api.getSources();
                const finishedIds = refreshingSources
                    .filter((oldS) => {
                        const newS = updatedSources.find(
                            (s) => s.id === oldS.id,
                        );
                        return newS && newS.status !== "refreshing";
                    })
                    .map((s) => s.id);

                if (finishedIds.length > 0) {
                    setSources(updatedSources);
                    const dataPromises = finishedIds.map(async (id) => {
                        const data = await api.getSourceData(id);
                        setDataMap((prev) => ({ ...prev, [id]: data }));
                    });
                    await Promise.all(dataPromises);
                } else {
                    setSources(updatedSources);
                }
            } catch (error) {
                console.error("Polling failed:", error);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [sources, setSources, setDataMap]);

    // 2. Cleanup zombie active scraper
    useEffect(() => {
        if (activeScraper) {
            const activeSource = sources.find((s) => s.id === activeScraper);
            if (!activeSource || activeSource.status !== "suspended") {
                console.log("Cleaning up zombie active scraper:", activeScraper);
                setActiveScraper(null);
                invoke("cancel_scraper_task").catch(console.error);
            }
        }
    }, [sources, activeScraper, setActiveScraper]);

    // 3. Monitor for background scraper tasks
    useEffect(() => {
        if (activeScraper) return;

        const nextSource = webviewQueue.length > 0 ? webviewQueue[0] : null;

        if (nextSource) {
            const { url, script, intercept_api, secret_key } =
                nextSource.interaction?.data || {};
            const forceForeground =
                foregroundOverridesRef.current.has(nextSource.id) ||
                Boolean(nextSource.interaction?.data?.force_foreground);

            console.log(`Starting scraper for ${nextSource.name} (${nextSource.id})`);
            setActiveScraper(nextSource.id);
            manualQueuedRef.current.delete(nextSource.id);

            invoke("push_scraper_task", {
                sourceId: nextSource.id,
                url: url,
                injectScript: script,
                interceptApi: intercept_api,
                secretKey: secret_key,
                foreground: forceForeground,
            }).catch((err) => {
                console.error("Failed to push scraper task to Tauri:", err);
                setActiveScraper(null);
            });
        }
    }, [webviewQueue, activeScraper, setActiveScraper, queueNonce]);

    // 4. Global listeners from Tauri
    useEffect(() => {
        let unlistenScraperResult: (() => void) | undefined;
        let unlistenAuthRequired: (() => void) | undefined;

        const setupListeners = async () => {
            unlistenScraperResult = await listen<{
                sourceId: string;
                data: any;
                error?: string;
                secretKey: string;
            }>("scraper_result", async (event) => {
                const { sourceId, data, error, secretKey } = event.payload;

                if (activeScraperRef.current !== sourceId) {
                    console.warn(`[Scraper] Discarding stale result for ${sourceId}`);
                    return;
                }

                // Add to skipped list and clear active
                useStore.getState().addSkippedScraper(sourceId);
                useStore.getState().setActiveScraper(null);
                manualQueuedRef.current.delete(sourceId);
                foregroundOverridesRef.current.delete(sourceId);
                bumpQueueNonce();

                if (error) {
                    console.error(`Scraper error for ${sourceId}:`, error);
                    return;
                }
                try {
                    await api.interact(sourceId, { [secretKey]: data });
                    // Optimistically mark as refreshing
                    const currentSources = useStore.getState().sources;
                    useStore.getState().setSources(
                        currentSources.map(s => s.id === sourceId ? { ...s, status: "refreshing" } : s)
                    );
                } catch (err) {
                    console.error(`Failed to post scraped data for ${sourceId}:`, err);
                }
            });

            unlistenAuthRequired = await listen<{ sourceId: string; targetUrl: string }>(
                "scraper_auth_required",
                (event) => {
                    console.log(`Manual auth required for source ${event.payload.sourceId}`);
                    const sourceId = event.payload.sourceId;
                    useStore.getState().addSkippedScraper(sourceId);
                    useStore.getState().setActiveScraper(null);
                    foregroundOverridesRef.current.add(sourceId);
                    manualQueuedRef.current.delete(sourceId);
                    bumpQueueNonce();

                    const currentSources = useStore.getState().sources;
                    useStore.getState().setSources(
                        currentSources.map((source) => {
                            if (source.id !== sourceId) {
                                return source;
                            }
                            return {
                                ...source,
                                status: "suspended",
                                message: "Web scraper blocked by login wall/captcha. Resume in foreground mode.",
                                interaction: {
                                    type: "webview_scrape",
                                    step_id: source.interaction?.step_id || "webview",
                                    message: "Web scraper blocked. Resume in foreground mode.",
                                    fields: source.interaction?.fields || [],
                                    warning_message: source.interaction?.warning_message,
                                    data: {
                                        ...(source.interaction?.data || {}),
                                        force_foreground: true,
                                        manual_only: true,
                                        blocked_target_url: event.payload.targetUrl,
                                    },
                                },
                            };
                        }),
                    );
                },
            );
        };

        setupListeners();

        return () => {
            if (unlistenScraperResult) unlistenScraperResult();
            if (unlistenAuthRequired) unlistenAuthRequired();
        };
    }, [bumpQueueNonce]); // Empty dependencies in logic, only stable callback dependency

    return {
        activeScraper,
        webviewQueue,
        handleSkipScraper,
        handleClearScraperQueue,
        handlePushToQueue,
        handleShowScraperWindow,
    };
}
