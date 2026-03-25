import { describe, expect, it, vi } from "vitest";

import type { DataResponse, SourceSummary } from "../types/config";
import { SourceUpdateCoordinator } from "./sourceUpdateCoordinator";

function makeSource(
    id: string,
    updatedAt: number,
    status: SourceSummary["status"] = "active",
): SourceSummary {
    return {
        id,
        name: id,
        integration_id: "demo",
        description: "",
        enabled: true,
        auth_type: "none",
        has_data: false,
        updated_at: updatedAt,
        status,
    };
}

function makeDetail(
    sourceId: string,
    updatedAt: number,
    status: SourceSummary["status"] = "active",
): DataResponse {
    return {
        source_id: sourceId,
        data: { ok: true },
        updated_at: updatedAt,
        status,
    };
}

describe("SourceUpdateCoordinator", () => {
    it("prioritizes active dashboard sources before others", async () => {
        const fetchOrder: string[] = [];

        let snapshot = {
            sources: [] as SourceSummary[],
            dataMap: {} as Record<string, DataResponse>,
        };

        const coordinator = new SourceUpdateCoordinator({
            maxConcurrency: 1,
            pollIntervalMs: 60_000,
            fetchSources: vi.fn().mockResolvedValue([]),
            fetchSourceData: vi.fn(async (sourceId: string) => {
                fetchOrder.push(sourceId);
                await Promise.resolve();
                return makeDetail(sourceId, 100);
            }),
            getSnapshot: () => snapshot,
            updateSnapshot: (updater) => {
                snapshot = updater(snapshot);
            },
        });

        coordinator.start();
        coordinator.setPriorityContext({
            activeDashboardSourceIds: ["active-1"],
            otherDashboardSourceIds: ["other-1"],
        });
        coordinator.submitSources(["other-1", "active-1"], "polling", {
            force: true,
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        coordinator.stop();

        expect(fetchOrder[0]).toBe("active-1");
        expect(fetchOrder[1]).toBe("other-1");
    });

    it("drops stale detail result when summary already newer", async () => {
        let detailResolver:
            | ((value: DataResponse | null) => void)
            | undefined;
        let sourceUpdatedAt = 100;
        const fetchSourceData = vi.fn(
            () =>
                new Promise<DataResponse | null>((resolve) => {
                    detailResolver = resolve;
                }),
        );

        let snapshot = {
            sources: [makeSource("source-1", 100)],
            dataMap: {} as Record<string, DataResponse>,
        };

        const coordinator = new SourceUpdateCoordinator({
            maxConcurrency: 1,
            pollIntervalMs: 60_000,
            fetchSources: vi.fn().mockImplementation(async () => {
                return [makeSource("source-1", sourceUpdatedAt)];
            }),
            fetchSourceData,
            getSnapshot: () => snapshot,
            updateSnapshot: (updater) => {
                snapshot = updater(snapshot);
            },
        });

        coordinator.start();
        coordinator.submitSources(["source-1"], "polling", { force: true });
        await new Promise((resolve) => setTimeout(resolve, 0));

        sourceUpdatedAt = 200;
        await coordinator.pollNow({ trigger: "polling", forceAll: false });
        await new Promise((resolve) => setTimeout(resolve, 0));

        if (detailResolver) {
            detailResolver(makeDetail("source-1", 150));
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        coordinator.stop();

        expect(snapshot.dataMap["source-1"]).toBeUndefined();
        expect(snapshot.sources[0]?.updated_at).toBe(200);
    });

    it("does not spin detail refetch loop on websocket timestamp hints", async () => {
        const sourceId = "source-1";
        const fetchSourceData = vi
            .fn()
            .mockResolvedValue(makeDetail(sourceId, 150, "active"));

        let snapshot = {
            sources: [makeSource(sourceId, 100)],
            dataMap: {
                [sourceId]: {
                    source_id: sourceId,
                    data: { ok: true },
                    updated_at: 100,
                    status: "active",
                } as DataResponse,
            } as Record<string, DataResponse>,
        };

        const coordinator = new SourceUpdateCoordinator({
            maxConcurrency: 1,
            pollIntervalMs: 60_000,
            detailThrottleMs: 0,
            fetchSources: vi.fn().mockResolvedValue([makeSource(sourceId, 100)]),
            fetchSourceData,
            getSnapshot: () => snapshot,
            updateSnapshot: (updater) => {
                snapshot = updater(snapshot);
            },
        });

        coordinator.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        fetchSourceData.mockClear();
        coordinator.handleWebSocketEvent({
            source_id: sourceId,
            updated_at: 999999,
            status: "active",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        coordinator.stop();

        expect(fetchSourceData).toHaveBeenCalledTimes(1);
        expect(snapshot.sources[0]?.updated_at).toBe(150);
    });

    it("applies leading and trailing throttle for burst websocket updates", async () => {
        const sourceId = "source-1";
        let detailUpdatedAt = 100;
        const fetchSourceData = vi.fn().mockImplementation(async () => {
            detailUpdatedAt += 1;
            return makeDetail(sourceId, detailUpdatedAt, "active");
        });

        let snapshot = {
            sources: [makeSource(sourceId, 100)],
            dataMap: {
                [sourceId]: {
                    source_id: sourceId,
                    data: { ok: true },
                    updated_at: 100,
                    status: "active",
                } as DataResponse,
            } as Record<string, DataResponse>,
        };

        const coordinator = new SourceUpdateCoordinator({
            maxConcurrency: 1,
            pollIntervalMs: 60_000,
            detailThrottleMs: 40,
            fetchSources: vi.fn().mockResolvedValue([makeSource(sourceId, 100)]),
            fetchSourceData,
            getSnapshot: () => snapshot,
            updateSnapshot: (updater) => {
                snapshot = updater(snapshot);
            },
        });

        coordinator.start();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        fetchSourceData.mockClear();
        await new Promise((resolve) => setTimeout(resolve, 50));

        coordinator.handleWebSocketEvent({ source_id: sourceId, status: "active" });
        coordinator.handleWebSocketEvent({ source_id: sourceId, status: "active" });
        coordinator.handleWebSocketEvent({ source_id: sourceId, status: "active" });

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(fetchSourceData).toHaveBeenCalledTimes(1);

        await new Promise((resolve) => setTimeout(resolve, 80));
        coordinator.stop();

        expect(fetchSourceData).toHaveBeenCalledTimes(2);
    });

    it("clears stale summary fields and maps last_success_at from detail payload", async () => {
        const sourceId = "source-1";
        const staleInteraction = {
            type: "input_text",
            fields: [],
        } as SourceSummary["interaction"];

        let snapshot = {
            sources: [
                {
                    ...makeSource(sourceId, 100, "error"),
                    has_data: true,
                    message: "stale-message",
                    error: "stale-error",
                    error_code: "runtime.fetch_failed",
                    error_details: "stale-details",
                    interaction: staleInteraction,
                    last_success_at: 100,
                },
            ] as SourceSummary[],
            dataMap: {
                [sourceId]: {
                    source_id: sourceId,
                    data: null,
                    updated_at: 100,
                    status: "error",
                    error: "stale-error",
                    error_code: "runtime.fetch_failed",
                } as DataResponse,
            } as Record<string, DataResponse>,
        };

        const detail = {
            source_id: sourceId,
            data: { ok: true },
            updated_at: 200,
            status: "active",
            message: null,
            error: null,
            interaction: null,
            last_success_at: 190,
        } as unknown as DataResponse;

        const coordinator = new SourceUpdateCoordinator({
            maxConcurrency: 1,
            pollIntervalMs: 60_000,
            fetchSources: vi.fn().mockRejectedValue(new Error("skip bootstrap poll")),
            fetchSourceData: vi.fn().mockResolvedValue(detail),
            getSnapshot: () => snapshot,
            updateSnapshot: (updater) => {
                snapshot = updater(snapshot);
            },
            onError: () => {
                // no-op in test
            },
        });

        coordinator.start();
        coordinator.submitSources([sourceId], "manual", { force: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        coordinator.stop();

        const next = snapshot.sources[0];
        expect(next?.status).toBe("active");
        expect(next?.message).toBeUndefined();
        expect(next?.error).toBeUndefined();
        expect(next?.error_code).toBeUndefined();
        expect(next?.error_details).toBeUndefined();
        expect(next?.interaction).toBeUndefined();
        expect(next?.has_data).toBe(true);
        expect(next?.last_success_at).toBe(190);
    });
});
