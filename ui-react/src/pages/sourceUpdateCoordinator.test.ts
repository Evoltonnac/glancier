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
            fetchSources: vi
                .fn()
                .mockResolvedValue([makeSource("source-1", 100)]),
            fetchSourceData,
            getSnapshot: () => snapshot,
            updateSnapshot: (updater) => {
                snapshot = updater(snapshot);
            },
        });

        coordinator.start();
        coordinator.submitSources(["source-1"], "polling", { force: true });
        await new Promise((resolve) => setTimeout(resolve, 0));

        coordinator.handleWebSocketEvent({
            source_id: "source-1",
            updated_at: 200,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        if (detailResolver) {
            detailResolver(makeDetail("source-1", 150));
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        await coordinator.pollNow({ trigger: "polling", forceAll: false });
        coordinator.stop();

        expect(snapshot.dataMap["source-1"]).toBeUndefined();
        expect(snapshot.sources[0]?.updated_at).toBe(100);
    });
});
