import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { api } from "../api/client";
import { isTauri } from "../lib/utils";
import { useStore } from "../store";
import { useI18n } from "../i18n";
import type { SourceSummary } from "../types/config";

const SCRAPER_LOG_LIMIT = 300;
const DEFAULT_SCRAPER_TIMEOUT_SECONDS = 10;
const QUEUE_SNAPSHOT_SYNC_THROTTLE_MS = 500;
const ACTIVE_STAGES = new Set(["task_claimed"]);
const TERMINAL_STAGES = new Set([
    "task_complete",
    "task_cancelled",
    "task_killed_log_burst",
    "task_handoff_auth_required",
]);

export interface ScraperLifecycleLog {
    source_id: string;
    task_id: string;
    stage: string;
    level: "info" | "warn" | "error" | "debug";
    message: string;
    timestamp: number;
    details?: Record<string, any>;
}

interface ScraperQueueSnapshot {
    active_source_id?: string | null;
    queue_source_ids?: string[];
}

function scraperLogKey(log: ScraperLifecycleLog): string {
    return [
        log.source_id,
        log.task_id,
        log.stage,
        log.level,
        log.timestamp,
        log.message,
    ].join("|");
}

function mergeScraperLogs(
    current: ScraperLifecycleLog[],
    incoming: ScraperLifecycleLog[],
): ScraperLifecycleLog[] {
    if (incoming.length === 0) {
        return current.slice(-SCRAPER_LOG_LIMIT);
    }

    const merged = [...current, ...incoming];
    const seen = new Set<string>();
    const deduped: ScraperLifecycleLog[] = [];
    for (const log of merged) {
        const key = scraperLogKey(log);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(log);
    }

    deduped.sort((a, b) => a.timestamp - b.timestamp);
    return deduped.length > SCRAPER_LOG_LIMIT
        ? deduped.slice(-SCRAPER_LOG_LIMIT)
        : deduped;
}

export function useScraper() {
    const { t } = useI18n();
    const scraperEnabled = isTauri();
    const sources = useStore((state) => state.sources);
    const setSources = useStore((state) => state.setSources);
    const activeScraper = useStore((state) => state.activeScraper);
    const setActiveScraper = useStore((state) => state.setActiveScraper);
    const skippedScrapers = useStore((state) => state.skippedScrapers);
    const addSkippedScraper = useStore((state) => state.addSkippedScraper);
    const setSkippedScrapers = useStore((state) => state.setSkippedScrapers);
    const showToast = useStore((state) => state.showToast);
    const [scraperLogs, setScraperLogs] = useState<ScraperLifecycleLog[]>([]);
    const [activeTaskToken, setActiveTaskToken] = useState<string | null>(null);
    const [queueSourceIds, setQueueSourceIds] = useState<string[]>([]);
    const queueSyncLastRunAtRef = useRef(0);
    const queueSyncPendingRef = useRef(false);
    const queueSyncInFlightRef = useRef(false);
    const queueSyncTimerRef = useRef<number | null>(null);
    const runQueueSnapshotSyncRef = useRef<() => void>(() => {});

    const activeScraperRef = useRef<string | null>(null);
    const activeTaskIdRef = useRef<string | null>(null);
    const activeTaskSourceIdRef = useRef<string | null>(null);
    const taskTimeoutSecondsRef = useRef<number>(DEFAULT_SCRAPER_TIMEOUT_SECONDS);

    useEffect(() => {
        activeScraperRef.current = activeScraper;
    }, [activeScraper]);

    useEffect(() => {
        if (!scraperEnabled) {
            return;
        }
        let cancelled = false;
        void api
            .getSettings()
            .then((settings) => {
                if (cancelled) {
                    return;
                }
                const configured = Number(settings?.scraper_timeout_seconds);
                if (Number.isFinite(configured) && configured >= 1) {
                    taskTimeoutSecondsRef.current = Math.floor(configured);
                } else {
                    taskTimeoutSecondsRef.current = DEFAULT_SCRAPER_TIMEOUT_SECONDS;
                }
            })
            .catch((error) => {
                console.error("Failed to load scraper timeout settings:", error);
                taskTimeoutSecondsRef.current = DEFAULT_SCRAPER_TIMEOUT_SECONDS;
            });
        return () => {
            cancelled = true;
        };
    }, [scraperEnabled]);

    const syncErrorLogsFromMemory = useCallback(
        async (sourceId?: string | null) => {
            if (!scraperEnabled) {
                return;
            }

            try {
                const logs = await invoke<ScraperLifecycleLog[]>(
                    "get_scraper_error_logs",
                    { sourceId: sourceId ?? null },
                );
                if (!Array.isArray(logs) || logs.length === 0) {
                    return;
                }
                const errorLogs = logs.filter((log) => log.level === "error");
                if (errorLogs.length === 0) {
                    return;
                }
                setScraperLogs((prev) => mergeScraperLogs(prev, errorLogs));
            } catch (error) {
                console.error(
                    "Failed to sync scraper error logs from Rust memory:",
                    error,
                );
            }
        },
        [scraperEnabled],
    );

    const webviewQueue = queueSourceIds
        .map((sourceId) => sources.find((source) => source.id === sourceId))
        .filter((source): source is SourceSummary => Boolean(source));

    const syncQueueSnapshotFromRust = useCallback(async () => {
        if (!scraperEnabled) {
            return;
        }
        try {
            const snapshot = await invoke<ScraperQueueSnapshot>(
                "get_scraper_queue_snapshot",
            );
            if (
                !snapshot ||
                !Array.isArray(snapshot.queue_source_ids)
            ) {
                return;
            }
            const normalizedIds = snapshot.queue_source_ids
                .filter((value): value is string => typeof value === "string")
                .filter((value, index, arr) => arr.indexOf(value) === index);
            setQueueSourceIds(normalizedIds);

            const activeSource =
                typeof snapshot.active_source_id === "string" &&
                snapshot.active_source_id.trim()
                    ? snapshot.active_source_id
                    : null;
            useStore.getState().setActiveScraper(activeSource);
        } catch (error) {
            console.error("Failed to sync scraper queue snapshot:", error);
        }
    }, [scraperEnabled]);

    const clearQueueSnapshotSyncTimer = useCallback(() => {
        if (queueSyncTimerRef.current !== null) {
            window.clearTimeout(queueSyncTimerRef.current);
            queueSyncTimerRef.current = null;
        }
    }, []);

    const scheduleTrailingQueueSnapshotSync = useCallback(
        (delayMs: number) => {
            if (queueSyncTimerRef.current !== null) {
                return;
            }
            queueSyncTimerRef.current = window.setTimeout(() => {
                queueSyncTimerRef.current = null;
                if (!queueSyncPendingRef.current) {
                    return;
                }
                queueSyncPendingRef.current = false;
                runQueueSnapshotSyncRef.current();
            }, delayMs);
        },
        [],
    );

    const runQueueSnapshotSync = useCallback(async () => {
        if (!scraperEnabled) {
            return;
        }
        if (queueSyncInFlightRef.current) {
            queueSyncPendingRef.current = true;
            return;
        }

        queueSyncInFlightRef.current = true;
        queueSyncLastRunAtRef.current = Date.now();
        try {
            await syncQueueSnapshotFromRust();
        } finally {
            queueSyncInFlightRef.current = false;
            if (!queueSyncPendingRef.current) {
                return;
            }
            const elapsedMs = Date.now() - queueSyncLastRunAtRef.current;
            if (elapsedMs >= QUEUE_SNAPSHOT_SYNC_THROTTLE_MS) {
                queueSyncPendingRef.current = false;
                runQueueSnapshotSyncRef.current();
                return;
            }
            scheduleTrailingQueueSnapshotSync(
                Math.max(QUEUE_SNAPSHOT_SYNC_THROTTLE_MS - elapsedMs, 0),
            );
        }
    }, [scheduleTrailingQueueSnapshotSync, scraperEnabled, syncQueueSnapshotFromRust]);

    useEffect(() => {
        runQueueSnapshotSyncRef.current = () => {
            void runQueueSnapshotSync();
        };
    }, [runQueueSnapshotSync]);

    const requestQueueSnapshotSync = useCallback(() => {
        if (!scraperEnabled) {
            return;
        }
        const now = Date.now();
        const elapsedMs = now - queueSyncLastRunAtRef.current;
        if (
            queueSyncLastRunAtRef.current === 0 ||
            elapsedMs >= QUEUE_SNAPSHOT_SYNC_THROTTLE_MS
        ) {
            runQueueSnapshotSyncRef.current();
            return;
        }
        queueSyncPendingRef.current = true;
        scheduleTrailingQueueSnapshotSync(
            Math.max(QUEUE_SNAPSHOT_SYNC_THROTTLE_MS - elapsedMs, 0),
        );
    }, [scheduleTrailingQueueSnapshotSync, scraperEnabled]);

    useEffect(() => {
        if (scraperEnabled) {
            return;
        }
        queueSyncPendingRef.current = false;
        queueSyncInFlightRef.current = false;
        queueSyncLastRunAtRef.current = 0;
        clearQueueSnapshotSyncTimer();
    }, [clearQueueSnapshotSyncTimer, scraperEnabled]);

    useEffect(
        () => () => {
            clearQueueSnapshotSyncTimer();
        },
        [clearQueueSnapshotSyncTimer],
    );

    useEffect(() => {
        if (!scraperEnabled) {
            return;
        }
        requestQueueSnapshotSync();
        const interval = window.setInterval(() => {
            requestQueueSnapshotSync();
        }, 1500);
        return () => {
            window.clearInterval(interval);
        };
    }, [requestQueueSnapshotSync, scraperEnabled]);

    const handleSkipScraper = useCallback(async () => {
        if (!scraperEnabled || !activeScraper) {
            return;
        }

        try {
            await invoke("cancel_scraper_task");
            await syncErrorLogsFromMemory(activeScraper);
        } catch (error) {
            console.error("Failed to cancel scraper task:", error);
        }

        addSkippedScraper(activeScraper);
        activeTaskIdRef.current = null;
        activeTaskSourceIdRef.current = null;
        setActiveTaskToken(null);
        setActiveScraper(null);
    }, [
        activeScraper,
        addSkippedScraper,
        scraperEnabled,
        setActiveScraper,
        syncErrorLogsFromMemory,
    ]);

    const handleClearScraperQueue = useCallback(async () => {
        if (!scraperEnabled) {
            return;
        }

        if (activeScraper) {
            try {
                await invoke("cancel_scraper_task");
            } catch (error) {
                console.error("Failed to cancel active scraper task:", error);
            }
        }
        try {
            await invoke("clear_scraper_queue");
        } catch (error) {
            console.error("Failed to clear backend scraper queue:", error);
        }

        const newSkipped = new Set(skippedScrapers);
        if (activeScraper) {
            newSkipped.add(activeScraper);
        }
        queueSourceIds.forEach((sourceId) => newSkipped.add(sourceId));
        setSkippedScrapers(newSkipped);
        activeTaskIdRef.current = null;
        activeTaskSourceIdRef.current = null;
        setActiveTaskToken(null);
        setQueueSourceIds([]);
        setActiveScraper(null);

        // Keep recent error logs for troubleshooting; drop noisy non-error logs.
        setScraperLogs((prev) =>
            prev.filter((log) => log.level === "error").slice(-SCRAPER_LOG_LIMIT),
        );
    }, [
        activeScraper,
        scraperEnabled,
        setActiveScraper,
        setSkippedScrapers,
        skippedScrapers,
        queueSourceIds,
    ]);

    const handlePushToQueue = useCallback(
        (source: SourceSummary, options?: { foreground?: boolean }): boolean => {
            if (!scraperEnabled) {
                showToast(t("scraper.toast.unavailable"), "error");
                return false;
            }

            const nextSkipped = new Set(useStore.getState().skippedScrapers);
            nextSkipped.delete(source.id);
            setSkippedScrapers(nextSkipped);

            const forceForeground = Boolean(options?.foreground);

            if (forceForeground) {
                const data = source.interaction?.data ?? {};
                const url = typeof data.url === "string" ? data.url.trim() : "";
                if (!url) {
                    showToast(t("scraper.toast.retryFailed"), "error");
                    return false;
                }
                const injectScript =
                    typeof data.script === "string" ? data.script : "";
                const interceptApi =
                    typeof data.intercept_api === "string"
                        ? data.intercept_api
                        : "";
                const secretKey =
                    typeof data.secret_key === "string" && data.secret_key.trim()
                        ? data.secret_key.trim()
                        : "webview_data";

                void (async () => {
                    try {
                        const promoted = await invoke<boolean>(
                            "promote_active_scraper_to_foreground",
                            { sourceId: source.id },
                        );
                        if (promoted) {
                            useStore.getState().addSkippedScraper(source.id);
                            return;
                        }
                        useStore.getState().addSkippedScraper(source.id);
                        await invoke("clear_scraper_queue", {
                            sourceId: source.id,
                        });
                        await invoke("push_scraper_task", {
                            sourceId: source.id,
                            url,
                            injectScript,
                            interceptApi,
                            secretKey,
                            foreground: true,
                        });
                    } catch (error) {
                        console.error(
                            `Failed to start foreground scraper for ${source.id}:`,
                            error,
                        );
                        showToast(t("scraper.toast.retryFailed"), "error");
                    }
                })();
                return true;
            }

            void api.refreshSource(source.id).catch((error) => {
                console.error(`Failed to request scraper retry for ${source.id}:`, error);
                showToast(t("scraper.toast.retryFailed"), "error");
            });
            return true;
        },
        [scraperEnabled, setSkippedScrapers, showToast, t],
    );

    const handleShowScraperWindow = useCallback(async () => {
        if (!scraperEnabled) {
            return;
        }
        try {
            const promoted = await invoke<boolean>(
                "promote_active_scraper_to_foreground",
            );
            if (promoted) {
                const current = activeScraperRef.current;
                if (current) {
                    useStore.getState().addSkippedScraper(current);
                }
                activeTaskIdRef.current = null;
                activeTaskSourceIdRef.current = null;
                setActiveTaskToken(null);
                setActiveScraper(null);
                return;
            }
            await invoke("show_scraper_window");
        } catch (error) {
            console.error("Failed to show scraper window:", error);
        }
    }, [scraperEnabled, setActiveScraper]);

    // Frontend observer mode: keep status/log visibility,
    // while Rust daemon owns automatic claim + execution.
    useEffect(() => {
        if (!scraperEnabled) {
            return;
        }

        let unlistenScraperResult: (() => void) | undefined;
        let unlistenAuthRequired: (() => void) | undefined;
        let unlistenLifecycleLog: (() => void) | undefined;

        const setupListeners = async () => {
            unlistenLifecycleLog = await listen<ScraperLifecycleLog>(
                "scraper_lifecycle_log",
                (event) => {
                    const log = event.payload;
                    setScraperLogs((prev) => mergeScraperLogs(prev, [log]));

                    if (ACTIVE_STAGES.has(log.stage)) {
                        if (log.task_id) {
                            activeTaskIdRef.current = log.task_id;
                            activeTaskSourceIdRef.current = log.source_id;
                            setActiveTaskToken(`${log.source_id}:${log.task_id}`);
                        }
                        if (log.source_id && activeScraperRef.current !== log.source_id) {
                            useStore.getState().setActiveScraper(log.source_id);
                        }
                    }

                    if (TERMINAL_STAGES.has(log.stage)) {
                        const currentTaskId = activeTaskIdRef.current;
                        if (log.task_id && currentTaskId && log.task_id !== currentTaskId) {
                            return;
                        }
                        activeTaskIdRef.current = null;
                        activeTaskSourceIdRef.current = null;
                        setActiveTaskToken(null);
                        if (activeScraperRef.current) {
                            useStore.getState().setActiveScraper(null);
                        }
                    }

                    if (
                        log.stage === "task_cancelled" ||
                        log.stage === "task_killed_log_burst"
                    ) {
                        if (log.source_id) {
                            useStore.getState().addSkippedScraper(log.source_id);
                        }
                        void syncErrorLogsFromMemory(log.source_id);
                    }

                    if (
                        ACTIVE_STAGES.has(log.stage) ||
                        TERMINAL_STAGES.has(log.stage) ||
                        log.stage === "task_cancelled" ||
                        log.stage === "task_killed_log_burst"
                    ) {
                        requestQueueSnapshotSync();
                    }
                },
            );

            unlistenScraperResult = await listen<{
                sourceId: string;
                taskId?: string;
                data: any;
                error?: string;
                secretKey: string;
            }>("scraper_result", async (event) => {
                const { sourceId, taskId, data, error, secretKey } = event.payload;

                if (
                    taskId &&
                    activeTaskIdRef.current &&
                    activeTaskIdRef.current !== taskId
                ) {
                    console.warn(
                        `[Scraper] Discarding stale task result for ${sourceId}: ${taskId} != ${activeTaskIdRef.current}`,
                    );
                    return;
                }
                if (taskId) {
                    activeTaskIdRef.current = taskId;
                    activeTaskSourceIdRef.current = sourceId;
                }

                useStore.getState().setActiveScraper(null);
                activeTaskIdRef.current = null;
                activeTaskSourceIdRef.current = null;
                setActiveTaskToken(null);

                if (error) {
                    console.error(`Scraper error for ${sourceId}:`, error);
                    useStore.getState().addSkippedScraper(sourceId);
                    void syncErrorLogsFromMemory(sourceId);
                    return;
                }

                try {
                    const refreshedSources = await api.getSources();
                    setSources(refreshedSources);
                    const latest = refreshedSources.find((source) => source.id === sourceId);
                    if (latest && latest.status !== "suspended") {
                        return;
                    }
                    // Fallback for legacy/manual paths that haven't resumed from backend yet.
                    await api.interact(sourceId, { [secretKey]: data });
                    const fallbackSources = await api.getSources();
                    setSources(fallbackSources);
                } catch (err) {
                    console.error(`Failed to post scraped data for ${sourceId}:`, err);
                }
            });

            unlistenAuthRequired = await listen<{
                sourceId: string;
                taskId?: string;
                targetUrl: string;
            }>("scraper_auth_required", (event) => {
                console.log(
                    `Manual auth required for source ${event.payload.sourceId}`,
                );
                const { sourceId, taskId, targetUrl } = event.payload;
                if (
                    taskId &&
                    activeTaskIdRef.current &&
                    activeTaskIdRef.current !== taskId
                ) {
                    console.warn(
                        `[Scraper] Ignore stale auth-required event for ${sourceId}: ${taskId} != ${activeTaskIdRef.current}`,
                    );
                    return;
                }
                if (taskId) {
                    activeTaskIdRef.current = taskId;
                    activeTaskSourceIdRef.current = sourceId;
                }
                // Auth-required handoff ends backend-owned execution; stop timeout tracking.
                setActiveTaskToken(null);
                useStore.getState().setActiveScraper(null);

                const currentSources = useStore.getState().sources;
                useStore.getState().setSources(
                    currentSources.map((source) => {
                        if (source.id !== sourceId) {
                            return source;
                        }
                        return {
                            ...source,
                            status: "suspended",
                            message:
                                "Web scraper blocked by login wall/captcha. Manual action is required before retry.",
                            interaction: {
                                type: "webview_scrape",
                                step_id: source.interaction?.step_id || "webview",
                                message:
                                    "Web scraper blocked. Manual action is required before retry.",
                                fields: source.interaction?.fields || [],
                                warning_message: source.interaction?.warning_message,
                                data: {
                                    ...(source.interaction?.data || {}),
                                    manual_only: true,
                                    blocked_target_url: targetUrl,
                                },
                            },
                        };
                    }),
                );
            });
        };

        setupListeners();

        return () => {
            if (unlistenScraperResult) {
                unlistenScraperResult();
            }
            if (unlistenAuthRequired) {
                unlistenAuthRequired();
            }
            if (unlistenLifecycleLog) {
                unlistenLifecycleLog();
            }
        };
    }, [requestQueueSnapshotSync, scraperEnabled, setSources, syncErrorLogsFromMemory]);

    useEffect(() => {
        if (!scraperEnabled || !activeTaskToken) {
            return;
        }

        const sourceId = activeTaskSourceIdRef.current ?? activeScraperRef.current;
        const taskId = activeTaskIdRef.current;
        if (!sourceId || !taskId) {
            return;
        }

        const timeoutMs = Math.max(
            taskTimeoutSecondsRef.current,
            1,
        ) * 1000;
        const timer = window.setTimeout(() => {
            if (activeTaskIdRef.current !== taskId) {
                return;
            }
            void invoke("cancel_scraper_task")
                .then(() => syncErrorLogsFromMemory(sourceId))
                .catch((error) => {
                    console.error("Failed to cancel timed-out scraper task:", error);
                })
                .finally(() => {
                    if (activeTaskIdRef.current !== taskId) {
                        return;
                    }
                    useStore.getState().addSkippedScraper(sourceId);
                    activeTaskIdRef.current = null;
                    activeTaskSourceIdRef.current = null;
                    setActiveTaskToken(null);
                    useStore.getState().setActiveScraper(null);
                });
        }, timeoutMs);

        return () => {
            window.clearTimeout(timer);
        };
    }, [activeTaskToken, scraperEnabled, syncErrorLogsFromMemory]);

    return {
        activeScraper,
        queueLength: queueSourceIds.length,
        webviewQueue,
        scraperLogs,
        handleSkipScraper,
        handleClearScraperQueue,
        handlePushToQueue,
        handleShowScraperWindow,
    };
}
