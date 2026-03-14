import { describe, expect, it, vi, beforeEach } from "vitest";

describe("api client", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal("fetch", vi.fn());
    });

    it("returns null when source data endpoint responds 404", async () => {
        const { api } = await import("./client");
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn(),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: vi.fn(),
            } as unknown as Response);

        await expect(api.getSourceData("missing-source")).resolves.toBeNull();
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/data/missing-source",
            undefined,
        );
    });

    it("throws deterministic error on non-404 source data failure", async () => {
        const { api } = await import("./client");
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn(),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: vi.fn(),
            } as unknown as Response);

        await expect(api.getSourceData("broken-source")).rejects.toThrow(
            "Failed to fetch data for broken-source",
        );
    });

    it("encodes source id when refreshing and surfaces backend detail", async () => {
        const { api } = await import("./client");
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn(),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: false,
                status: 409,
                json: vi.fn().mockResolvedValue({
                    detail: "integration missing",
                }),
            } as unknown as Response);

        await expect(api.refreshSource("foo/bar")).rejects.toThrow(
            "integration missing",
        );
        expect(fetchMock).toHaveBeenCalledWith("/api/refresh/foo%2Fbar", {
            method: "POST",
        });
    });

    it("falls back to status code message when refresh error payload is not json", async () => {
        const { api } = await import("./client");
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn(),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: vi.fn().mockRejectedValue(new Error("not json")),
            } as unknown as Response);

        await expect(api.refreshAll()).rejects.toThrow(
            "Failed to refresh sources (HTTP 500)",
        );
    });

    it("disables cache when loading integration file content", async () => {
        const { api } = await import("./client");
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn(),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({
                    filename: "demo.yaml",
                    content: "name: demo",
                }),
            } as unknown as Response);

        await expect(api.getIntegrationFile("demo file.yaml")).resolves.toEqual(
            {
                filename: "demo.yaml",
                content: "name: demo",
            },
        );

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(
                /^\/api\/integrations\/files\/demo%20file\.yaml\?_ts=\d+$/,
            ),
            { cache: "no-store" },
        );
    });

    it("returns reload config change scope payload for integrations page decisions", async () => {
        const { api } = await import("./client");
        const fetchMock = vi.mocked(fetch);
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn(),
            } as unknown as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({
                    message: "Configuration reloaded",
                    affected_sources: ["source-a"],
                    auto_refreshed_sources: ["source-a"],
                    changed_files: [
                        {
                            filename: "demo.yaml",
                            integration_id: "demo",
                            change_scope: "logic",
                            changed_fields: ["flow"],
                            related_sources: ["source-a"],
                            auto_refreshed_sources: ["source-a"],
                        },
                    ],
                    total_sources: 1,
                }),
            } as unknown as Response);

        await expect(api.reloadConfig()).resolves.toMatchObject({
            affected_sources: ["source-a"],
            auto_refreshed_sources: ["source-a"],
            changed_files: [
                expect.objectContaining({
                    filename: "demo.yaml",
                    change_scope: "logic",
                }),
            ],
        });
    });
});
