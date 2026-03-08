import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const { apiMock } = vi.hoisted(() => ({
    apiMock: {
        listIntegrationFiles: vi.fn(),
        listIntegrationFileMetadata: vi.fn(),
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

describe("Integrations page", () => {
    const initialState = useStore.getState();

    beforeEach(() => {
        useStore.setState(initialState, true);

        apiMock.listIntegrationFiles.mockReset();
        apiMock.listIntegrationFileMetadata.mockReset();
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
        apiMock.getIntegrationFile.mockResolvedValue({
            filename: "demo.yaml",
            content: "name: demo",
            integration_ids: ["demo"],
            display_name: "演示集成",
        });
        apiMock.getIntegrationSources.mockResolvedValue([]);
        apiMock.reloadConfig.mockResolvedValue({
            message: "ok",
            affected_sources: ["source-a"],
        });
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

        expect(await screen.findByText(/Saved!/)).toBeInTheDocument();
    });

    it("shows save error message when save request fails", async () => {
        apiMock.saveIntegrationFile.mockRejectedValue(new Error("save failed"));
        render(<IntegrationsPage />);

        const fileEntry = await screen.findByText("demo.yaml");
        fireEvent.click(fileEntry);

        await waitFor(() => {
            expect(apiMock.getIntegrationFile).toHaveBeenCalledWith("demo.yaml");
        });

        const editor = screen.getByTestId("integration-editor");
        fireEvent.change(editor, { target: { value: "name: broken" } });

        fireEvent.keyDown(window, { key: "s", ctrlKey: true });

        expect(await screen.findByText("save failed")).toBeInTheDocument();
    });
});
