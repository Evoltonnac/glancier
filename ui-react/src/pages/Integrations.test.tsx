import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const { apiMock } = vi.hoisted(() => ({
    apiMock: {
        listIntegrationFiles: vi.fn(),
        listIntegrationFileMetadata: vi.fn(),
        listIntegrationPresets: vi.fn(),
        getIntegrationFile: vi.fn(),
        getIntegrationSources: vi.fn(),
        saveIntegrationFile: vi.fn(),
        createIntegrationFile: vi.fn(),
        deleteIntegrationFile: vi.fn(),
        createSourceFile: vi.fn(),
        deleteSourceFile: vi.fn(),
        reloadConfig: vi.fn(),
    },
}));

vi.mock("../api/client", () => ({
    api: apiMock,
}));

// Mock setup worker to avoid loading monaco worker/runtime paths in vitest.
vi.mock("../components/editor/YamlEditorWorkerSetup", () => ({
    setupYamlWorker: vi.fn().mockResolvedValue(undefined),
    markersToDiagnostics: vi.fn().mockReturnValue([]),
}));

vi.mock("@monaco-editor/react", () => ({
    default: ({
        value,
        onChange,
    }: {
        value?: string;
        onChange?: (value?: string) => void;
    }) => (
        <textarea
            data-testid="integration-editor"
            value={value ?? ""}
            onChange={(event) => onChange?.(event.target.value)}
        />
    ),
}));

import { render } from "../test/render";
import IntegrationsPage from "./Integrations";
import { useStore } from "../store";

function createReloadPayload(
    overrides: Partial<{
        affected_sources: string[];
        auto_refreshed_sources: string[];
        changed_files: Array<{
            filename: string;
            integration_id: string;
            change_scope: "view" | "logic";
            changed_fields: string[];
            related_sources: string[];
            auto_refreshed_sources: string[];
        }>;
    }> = {},
) {
    return {
        message: "ok",
        affected_sources: ["source-a"],
        auto_refreshed_sources: ["source-a"],
        changed_files: [
            {
                filename: "demo.yaml",
                integration_id: "demo",
                change_scope: "logic" as const,
                changed_fields: ["flow"],
                related_sources: ["source-a"],
                auto_refreshed_sources: ["source-a"],
            },
        ],
        total_sources: 1,
        ...overrides,
    };
}

describe("Integrations page", () => {
    const initialState = useStore.getState();

    beforeEach(() => {
        useStore.setState(initialState, true);

        apiMock.listIntegrationFiles.mockReset();
        apiMock.listIntegrationFileMetadata.mockReset();
        apiMock.listIntegrationPresets.mockReset();
        apiMock.getIntegrationFile.mockReset();
        apiMock.getIntegrationSources.mockReset();
        apiMock.saveIntegrationFile.mockReset();
        apiMock.createIntegrationFile.mockReset();
        apiMock.deleteIntegrationFile.mockReset();
        apiMock.createSourceFile.mockReset();
        apiMock.deleteSourceFile.mockReset();
        apiMock.reloadConfig.mockReset();

        apiMock.listIntegrationFiles.mockResolvedValue(["demo.yaml"]);
        apiMock.listIntegrationFileMetadata.mockResolvedValue([
            { filename: "demo.yaml", id: "demo", name: "演示集成" },
        ]);
        apiMock.listIntegrationPresets.mockResolvedValue([]);
        apiMock.getIntegrationFile.mockResolvedValue({
            filename: "demo.yaml",
            content: "name: demo",
            integration_ids: ["demo"],
            display_name: "演示集成",
        });
        apiMock.getIntegrationSources.mockResolvedValue([]);
        apiMock.reloadConfig.mockResolvedValue(createReloadPayload());
    });

    it("covers load, select, edit, and save success flow", async () => {
        apiMock.saveIntegrationFile.mockResolvedValue(undefined);
        render(<IntegrationsPage />);

        expect(await screen.findByText("演示集成")).toBeInTheDocument();
        const fileEntry = await screen.findByText("demo.yaml");
        fireEvent.click(fileEntry);

        await waitFor(() => {
            expect(apiMock.getIntegrationFile).toHaveBeenCalledWith("demo.yaml");
        });

        const editor = screen.getByTestId("integration-editor");
        fireEvent.change(editor, { target: { value: "name: changed" } });

        fireEvent.keyDown(window, { key: "s", ctrlKey: true });

        await waitFor(() => {
            expect(apiMock.saveIntegrationFile).toHaveBeenCalledWith(
                "demo.yaml",
                "name: changed",
            );
        });

        expect(useStore.getState().toast?.message).toContain("检测到逻辑改动");
        expect(useStore.getState().toast?.message).toContain("已自动刷新");
    });

    it("reloads config even when no file is selected", async () => {
        apiMock.reloadConfig.mockResolvedValue(
            createReloadPayload({
                affected_sources: [],
                auto_refreshed_sources: [],
                changed_files: [
                    {
                        filename: "demo.yaml",
                        integration_id: "demo",
                        change_scope: "view",
                        changed_fields: ["templates"],
                        related_sources: [],
                        auto_refreshed_sources: [],
                    },
                ],
            }),
        );

        render(<IntegrationsPage />);

        expect(await screen.findByText("演示集成")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "重载" }));

        await waitFor(() => {
            expect(apiMock.reloadConfig).toHaveBeenCalledTimes(1);
        });
        expect(useStore.getState().toast?.message).toContain("仅视图改动");
    });

    it("shows single-step delete warning and deletes source", async () => {
        apiMock.getIntegrationSources.mockResolvedValue([
            {
                id: "source-1",
                name: "Source One",
                integration_id: "demo",
                config: {},
                vars: {},
            },
        ]);
        apiMock.deleteSourceFile.mockResolvedValue({
            message: "Source source-1 deleted",
            source_id: "source-1",
            cleanup: {
                data_cleared: true,
                secrets_cleared: true,
                affected_view_ids: ["view-1"],
                affected_view_count: 1,
                warnings: [],
            },
        });

        render(<IntegrationsPage />);

        const fileEntry = await screen.findByText("demo.yaml");
        fireEvent.click(fileEntry);

        expect(await screen.findByText("Source One")).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: "Delete source source-1" }),
        );

        expect(await screen.findByText("确认删除数据源")).toBeInTheDocument();
        expect(
            await screen.findByText(/将同时清理该 source_id 下的数据、密钥/),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

        await waitFor(() => {
            expect(apiMock.deleteSourceFile).toHaveBeenCalledWith("source-1");
        });
    });
});
