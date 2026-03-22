import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStore } from "../store";
import { mockInvoke, mockListen, mockUnlisten } from "../test/mocks/tauri";
import type { SourceSummary } from "../types/config";

const { apiMock } = vi.hoisted(() => ({
    apiMock: {
        getSources: vi.fn(),
        interact: vi.fn(),
        refreshSource: vi.fn(),
        getSettings: vi.fn(),
    },
}));

vi.mock("../api/client", () => ({
    api: apiMock,
}));

vi.mock("../lib/utils", () => ({
    isTauri: () => true,
}));

import { useScraper } from "./useScraper";

function buildWebviewSource(id: string, name: string): SourceSummary {
    return {
        id,
        name,
        description: `${name} source`,
        enabled: true,
        auth_type: "oauth",
        has_data: false,
        status: "suspended",
        interaction: {
            type: "webview_scrape",
            step_id: "webview",
            message: "Need webview scraping",
            fields: [],
            data: {
                url: "https://example.com/dashboard",
                script: "console.log('scrape')",
                intercept_api: "/api/dashboard",
                secret_key: "webview_data",
            },
        },
    };
}

describe("useScraper observer mode", () => {
    const initialState = useStore.getState();

    beforeEach(() => {
        useStore.setState(initialState, true);
        mockInvoke.mockReset();
        mockInvoke.mockImplementation((_command: string) => {
            return Promise.resolve(undefined);
        });
        mockListen.mockReset();
        mockUnlisten.mockReset();
        mockListen.mockResolvedValue(mockUnlisten);

        apiMock.getSources.mockReset();
        apiMock.interact.mockReset();
        apiMock.refreshSource.mockReset();
        apiMock.getSettings.mockReset();
        apiMock.getSources.mockResolvedValue([]);
        apiMock.interact.mockResolvedValue(undefined);
        apiMock.refreshSource.mockResolvedValue(undefined);
        apiMock.getSettings.mockResolvedValue({ scraper_timeout_seconds: 10 });
    });

    it("manual foreground action starts scraper immediately and skips backend refresh queueing", async () => {
        const source = buildWebviewSource("manual-fg", "Manual FG");
        useStore.setState({
            sources: [source],
            activeScraper: null,
            skippedScrapers: new Set(),
        });

        const { result } = renderHook(() => useScraper());
        let started = false;
        act(() => {
            started = result.current.handlePushToQueue(source, { foreground: true });
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(started).toBe(true);
        expect(apiMock.refreshSource).not.toHaveBeenCalled();
        expect(mockInvoke).toHaveBeenCalledWith(
            "promote_active_scraper_to_foreground",
            { sourceId: source.id },
        );
        expect(mockInvoke).toHaveBeenCalledWith("clear_scraper_queue", {
            sourceId: source.id,
        });
        expect(mockInvoke).toHaveBeenCalledWith("push_scraper_task", {
            sourceId: source.id,
            url: "https://example.com/dashboard",
            injectScript: "console.log('scrape')",
            interceptApi: "/api/dashboard",
            secretKey: "webview_data",
            foreground: true,
        });
        expect(useStore.getState().skippedScrapers.has(source.id)).toBe(true);
    });

    it("default queue action retries through backend refresh path", async () => {
        const source = buildWebviewSource("default-refresh", "Default Refresh");
        useStore.setState({
            sources: [source],
            activeScraper: null,
            skippedScrapers: new Set(),
        });

        const { result } = renderHook(() => useScraper());
        let started = false;
        act(() => {
            started = result.current.handlePushToQueue(source);
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(started).toBe(true);
        expect(apiMock.refreshSource).toHaveBeenCalledWith(source.id);
        expect(
            mockInvoke.mock.calls.some(
                ([cmd]) =>
                    cmd === "promote_active_scraper_to_foreground" ||
                    cmd === "push_scraper_task",
            ),
        ).toBe(false);
    });

    it("legacy force_foreground metadata does not trigger foreground mode automatically", async () => {
        const source = buildWebviewSource("legacy-force", "Legacy Force");
        const interaction = source.interaction!;
        source.interaction = {
            ...interaction,
            data: {
                ...interaction.data,
                force_foreground: true,
            },
        };
        useStore.setState({
            sources: [source],
            activeScraper: null,
            skippedScrapers: new Set(),
        });

        const { result } = renderHook(() => useScraper());
        let started = false;
        act(() => {
            started = result.current.handlePushToQueue(source);
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(started).toBe(true);
        expect(apiMock.refreshSource).toHaveBeenCalledWith(source.id);
        expect(
            mockInvoke.mock.calls.some(
                ([cmd]) =>
                    cmd === "promote_active_scraper_to_foreground" ||
                    cmd === "push_scraper_task",
            ),
        ).toBe(false);
    });

    it("manual foreground action promotes existing backend task for same source without re-pushing", async () => {
        const source = buildWebviewSource("manual-promote", "Manual Promote");
        useStore.setState({
            sources: [source],
            activeScraper: source.id,
            skippedScrapers: new Set(),
        });
        mockInvoke.mockImplementation((command: string, payload?: any) => {
            if (
                command === "promote_active_scraper_to_foreground" &&
                payload?.sourceId === source.id
            ) {
                return Promise.resolve(true);
            }
            return Promise.resolve(undefined);
        });

        const { result } = renderHook(() => useScraper());
        let started = false;
        act(() => {
            started = result.current.handlePushToQueue(source, { foreground: true });
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(started).toBe(true);
        expect(mockInvoke).toHaveBeenCalledWith(
            "promote_active_scraper_to_foreground",
            { sourceId: source.id },
        );
        expect(
            mockInvoke.mock.calls.some(([cmd]) => cmd === "clear_scraper_queue"),
        ).toBe(false);
        expect(
            mockInvoke.mock.calls.some(([cmd]) => cmd === "push_scraper_task"),
        ).toBe(false);
    });

    it("auth-required listener keeps manual_only metadata without force_foreground", async () => {
        const source = buildWebviewSource("auth-required", "Auth Required");
        useStore.setState({
            sources: [source],
            activeScraper: null,
            skippedScrapers: new Set(),
        });

        let authRequiredListener:
            | ((event: { payload: any }) => void | Promise<void>)
            | undefined;
        mockListen.mockImplementation((eventName: string, callback: any) => {
            if (eventName === "scraper_auth_required") {
                authRequiredListener = callback;
            }
            return Promise.resolve(mockUnlisten);
        });

        renderHook(() => useScraper());
        await act(async () => {
            await Promise.resolve();
        });
        expect(authRequiredListener).toBeDefined();

        act(() => {
            authRequiredListener?.({
                payload: {
                    sourceId: source.id,
                    taskId: "task-auth-1",
                    targetUrl: "https://example.com/login",
                },
            });
        });

        const updatedSource = useStore
            .getState()
            .sources.find((item) => item.id === source.id);
        expect(updatedSource?.interaction?.data?.manual_only).toBe(true);
        expect(updatedSource?.interaction?.data?.blocked_target_url).toBe(
            "https://example.com/login",
        );
        expect(updatedSource?.interaction?.data).not.toHaveProperty(
            "force_foreground",
        );
    });

    it("show window first tries promotion, then falls back to showing worker window", async () => {
        const source = buildWebviewSource("active-bg", "Active BG");
        useStore.setState({
            sources: [source],
            activeScraper: source.id,
            skippedScrapers: new Set(),
        });
        mockInvoke.mockImplementation((command: string) => {
            if (command === "promote_active_scraper_to_foreground") {
                return Promise.resolve(false);
            }
            return Promise.resolve(undefined);
        });

        const { result } = renderHook(() => useScraper());
        await act(async () => {
            await result.current.handleShowScraperWindow();
        });

        expect(mockInvoke).toHaveBeenCalledWith(
            "promote_active_scraper_to_foreground",
        );
        expect(mockInvoke).toHaveBeenCalledWith("show_scraper_window");
        expect(useStore.getState().activeScraper).toBe(source.id);
    });

    it("show window promotion success clears active state and does not call show_scraper_window", async () => {
        const source = buildWebviewSource("active-promote", "Active Promote");
        useStore.setState({
            sources: [source],
            activeScraper: source.id,
            skippedScrapers: new Set(),
        });
        mockInvoke.mockImplementation((command: string) => {
            if (command === "promote_active_scraper_to_foreground") {
                return Promise.resolve(true);
            }
            return Promise.resolve(undefined);
        });

        const { result } = renderHook(() => useScraper());
        await act(async () => {
            await result.current.handleShowScraperWindow();
        });

        expect(mockInvoke).toHaveBeenCalledWith(
            "promote_active_scraper_to_foreground",
        );
        expect(
            mockInvoke.mock.calls.some(([cmd]) => cmd === "show_scraper_window"),
        ).toBe(false);
        expect(useStore.getState().activeScraper).toBeNull();
        expect(useStore.getState().skippedScrapers.has(source.id)).toBe(true);
    });

    it("lifecycle logs drive active scraper status updates", async () => {
        const source = buildWebviewSource("source-1", "Source 1");
        useStore.setState({
            sources: [source],
            activeScraper: null,
            skippedScrapers: new Set(),
        });

        let lifecycleListener:
            | ((event: { payload: any }) => void | Promise<void>)
            | undefined;
        mockListen.mockImplementation((eventName: string, callback: any) => {
            if (eventName === "scraper_lifecycle_log") {
                lifecycleListener = callback;
            }
            return Promise.resolve(mockUnlisten);
        });

        renderHook(() => useScraper());
        await act(async () => {
            await Promise.resolve();
        });

        expect(lifecycleListener).toBeDefined();

        act(() => {
            lifecycleListener?.({
                payload: {
                    source_id: source.id,
                    task_id: "task-1",
                    stage: "task_claimed",
                    level: "info",
                    message: "Claimed backend scraper task",
                    timestamp: 1,
                },
            });
        });
        expect(useStore.getState().activeScraper).toBe(source.id);

        act(() => {
            lifecycleListener?.({
                payload: {
                    source_id: source.id,
                    task_id: "task-1",
                    stage: "task_complete",
                    level: "info",
                    message: "Scraper completed",
                    timestamp: 2,
                },
            });
        });
        expect(useStore.getState().activeScraper).toBeNull();
    });

    it("scraper_result error clears active state and marks source skipped", async () => {
        const source = buildWebviewSource("source-err", "Source Err");
        useStore.setState({
            sources: [source],
            activeScraper: source.id,
            skippedScrapers: new Set(),
        });

        let resultListener:
            | ((event: { payload: any }) => void | Promise<void>)
            | undefined;
        mockListen.mockImplementation((eventName: string, callback: any) => {
            if (eventName === "scraper_result") {
                resultListener = callback;
            }
            return Promise.resolve(mockUnlisten);
        });
        mockInvoke.mockImplementation((command: string) => {
            if (command === "get_scraper_error_logs") {
                return Promise.resolve([]);
            }
            return Promise.resolve(undefined);
        });

        renderHook(() => useScraper());
        await act(async () => {
            await Promise.resolve();
        });

        expect(resultListener).toBeDefined();

        await act(async () => {
            await resultListener?.({
                payload: {
                    sourceId: source.id,
                    taskId: "task-err-1",
                    data: null,
                    error: "boom",
                    secretKey: "webview_data",
                },
            });
        });

        expect(useStore.getState().activeScraper).toBeNull();
        expect(useStore.getState().skippedScrapers.has(source.id)).toBe(true);
        expect(mockInvoke).toHaveBeenCalledWith("get_scraper_error_logs", {
            sourceId: source.id,
        });
    });

    it("clear queue clears backend pending tasks in addition to cancelling active one", async () => {
        const source = buildWebviewSource("source-clear", "Source Clear");
        useStore.setState({
            sources: [source],
            activeScraper: source.id,
            skippedScrapers: new Set(),
        });
        mockInvoke.mockResolvedValue(undefined);

        const { result } = renderHook(() => useScraper());
        await act(async () => {
            await result.current.handleClearScraperQueue();
        });

        expect(mockInvoke).toHaveBeenCalledWith("cancel_scraper_task");
        expect(mockInvoke).toHaveBeenCalledWith("clear_scraper_queue");
    });

    it("auto-cancels active scraper task after configured timeout", async () => {
        vi.useFakeTimers();
        const source = buildWebviewSource("source-timeout", "Source Timeout");
        useStore.setState({
            sources: [source],
            activeScraper: null,
            skippedScrapers: new Set(),
        });

        let lifecycleListener:
            | ((event: { payload: any }) => void | Promise<void>)
            | undefined;
        mockListen.mockImplementation((eventName: string, callback: any) => {
            if (eventName === "scraper_lifecycle_log") {
                lifecycleListener = callback;
            }
            return Promise.resolve(mockUnlisten);
        });
        mockInvoke.mockResolvedValue(undefined);

        renderHook(() => useScraper());
        await act(async () => {
            await Promise.resolve();
        });
        expect(lifecycleListener).toBeDefined();

        act(() => {
            lifecycleListener?.({
                payload: {
                    source_id: source.id,
                    task_id: "task-timeout-1",
                    stage: "task_claimed",
                    level: "info",
                    message: "Claimed backend scraper task",
                    timestamp: 1,
                },
            });
        });

        await act(async () => {
            vi.advanceTimersByTime(10_000);
            await Promise.resolve();
        });

        expect(mockInvoke).toHaveBeenCalledWith("cancel_scraper_task");
        expect(useStore.getState().skippedScrapers.has(source.id)).toBe(true);
        vi.useRealTimers();
    });

    it("foreground task logs are skipped from timeout tracking", async () => {
        vi.useFakeTimers();
        const source = buildWebviewSource("source-foreground", "Source Foreground");
        useStore.setState({
            sources: [source],
            activeScraper: null,
            skippedScrapers: new Set(),
        });

        let lifecycleListener:
            | ((event: { payload: any }) => void | Promise<void>)
            | undefined;
        mockListen.mockImplementation((eventName: string, callback: any) => {
            if (eventName === "scraper_lifecycle_log") {
                lifecycleListener = callback;
            }
            return Promise.resolve(mockUnlisten);
        });
        mockInvoke.mockResolvedValue(undefined);

        renderHook(() => useScraper());
        await act(async () => {
            await Promise.resolve();
        });
        expect(lifecycleListener).toBeDefined();

        act(() => {
            lifecycleListener?.({
                payload: {
                    source_id: source.id,
                    task_id: "task-foreground-1",
                    stage: "task_start",
                    level: "info",
                    message: "Starting scraper task (foreground=true)",
                    timestamp: 1,
                    details: {
                        foreground: true,
                    },
                },
            });
        });

        await act(async () => {
            vi.advanceTimersByTime(30_000);
            await Promise.resolve();
        });

        expect(mockInvoke).not.toHaveBeenCalledWith("cancel_scraper_task");
        vi.useRealTimers();
    });

    it("timeout cancel uses lifecycle source id even if activeScraper store lags", async () => {
        vi.useFakeTimers();
        const source = buildWebviewSource("source-lag", "Source Lag");
        useStore.setState({
            sources: [source],
            activeScraper: null,
            skippedScrapers: new Set(),
        });

        let lifecycleListener:
            | ((event: { payload: any }) => void | Promise<void>)
            | undefined;
        mockListen.mockImplementation((eventName: string, callback: any) => {
            if (eventName === "scraper_lifecycle_log") {
                lifecycleListener = callback;
            }
            return Promise.resolve(mockUnlisten);
        });
        mockInvoke.mockResolvedValue(undefined);

        renderHook(() => useScraper());
        await act(async () => {
            await Promise.resolve();
        });

        act(() => {
            lifecycleListener?.({
                payload: {
                    source_id: source.id,
                    task_id: "task-lag-1",
                    stage: "task_claimed",
                    level: "info",
                    message: "Claimed backend scraper task",
                    timestamp: 1,
                },
            });
        });

        // Simulate store lag/reset that would make activeScraper unavailable.
        act(() => {
            useStore.getState().setActiveScraper(null);
        });

        await act(async () => {
            vi.advanceTimersByTime(10_000);
            await Promise.resolve();
        });

        expect(mockInvoke).toHaveBeenCalledWith("cancel_scraper_task");
        expect(useStore.getState().skippedScrapers.has(source.id)).toBe(true);
        vi.useRealTimers();
    });
});
