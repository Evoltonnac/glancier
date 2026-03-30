import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({
    apiMock: {
        interact: vi.fn(),
        getAuthorizeUrl: vi.fn(),
        getSources: vi.fn(),
        getAuthStatus: vi.fn(),
        getDeviceFlowStatus: vi.fn(),
        pollDeviceToken: vi.fn(),
    },
}));

vi.mock("../../api/client", () => ({
    api: apiMock,
}));

import { render } from "../../test/render";
import { mockInvoke } from "../../test/mocks/tauri";
import type { SourceSummary } from "../../types/config";
import { FlowHandler } from "./FlowHandler";

class BroadcastChannelMock {
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public close = vi.fn();
    constructor(_name: string) {}
}

if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
}

function createLocalStorageMock() {
    const store = new Map<string, string>();
    return {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
    };
}

function buildSource(interaction: SourceSummary["interaction"]): SourceSummary {
    return {
        id: "source-1",
        name: "Test Source",
        description: "test source",
        enabled: true,
        auth_type: "oauth",
        has_data: false,
        status: "suspended",
        interaction,
    };
}

describe("FlowHandler", () => {
    beforeEach(() => {
        apiMock.interact.mockReset();
        apiMock.getAuthorizeUrl.mockReset();
        apiMock.getSources.mockReset();
        apiMock.getAuthStatus.mockReset();
        apiMock.getDeviceFlowStatus.mockReset();
        apiMock.pollDeviceToken.mockReset();

        apiMock.interact.mockResolvedValue(undefined);
        apiMock.getSources.mockResolvedValue([]);
        apiMock.getAuthStatus.mockResolvedValue({
            source_id: "source-1",
            auth_type: "oauth",
            status: "missing",
            message: "需要 OAuth 授权",
        });
        apiMock.getDeviceFlowStatus.mockResolvedValue({ status: "idle" });
        apiMock.getAuthorizeUrl.mockResolvedValue({
            flow: "code",
            authorize_url: "https://provider.example.com/authorize",
        });
        apiMock.pollDeviceToken.mockResolvedValue({
            status: "pending",
            retry_after: 5,
        });

        Object.defineProperty(window, "BroadcastChannel", {
            writable: true,
            value: BroadcastChannelMock,
        });
        Object.defineProperty(window, "localStorage", {
            writable: true,
            value: createLocalStorageMock(),
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        delete (globalThis as any).isTauri;
    });

    it("does not throw when source interaction appears after null render", () => {
        const onClose = vi.fn();
        const onInteractSuccess = vi.fn();

        const { rerender } = render(
            <FlowHandler
                source={null}
                isOpen={false}
                onClose={onClose}
                onInteractSuccess={onInteractSuccess}
            />,
        );

        expect(() =>
            rerender(
                <FlowHandler
                    source={buildSource({
                        type: "oauth_start",
                        message: "Auth required",
                        fields: [],
                    })}
                    isOpen={false}
                    onClose={onClose}
                    onInteractSuccess={onInteractSuccess}
                />,
            ),
        ).not.toThrow();

        expect(() =>
            rerender(
                <FlowHandler
                    source={null}
                    isOpen={false}
                    onClose={onClose}
                    onInteractSuccess={onInteractSuccess}
                />,
            ),
        ).not.toThrow();
    });

    it("checks device flow status only for device flow interactions", async () => {
        render(
            <FlowHandler
                source={buildSource({
                    type: "webview_scrape",
                    message: "Need webview",
                    fields: [],
                    data: {},
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(apiMock.getDeviceFlowStatus).not.toHaveBeenCalled();

        render(
            <FlowHandler
                source={buildSource({
                    type: "oauth_start",
                    message: "OAuth required",
                    fields: [],
                    data: {
                        oauth_flow: "code",
                    },
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(apiMock.getDeviceFlowStatus).not.toHaveBeenCalled();

        render(
            <FlowHandler
                source={buildSource({
                    type: "oauth_start",
                    message: "OAuth required",
                    fields: [],
                    data: {
                        oauth_args: {
                            oauth_flow: "device",
                        },
                    },
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(apiMock.getDeviceFlowStatus).toHaveBeenCalledWith("source-1");
    });

    it("uses interaction title and description for dialog copy", async () => {
        render(
            <FlowHandler
                source={buildSource({
                    type: "input_text",
                    title: "SQLite Connection (Chinook)",
                    description: "Provide a local path to Chinook_Sqlite.sqlite.",
                    message: "Input SQLite path and SQL guardrails for this test source.",
                    fields: [
                        {
                            key: "chinook_db_path",
                            label: "Chinook SQLite Path",
                            type: "text",
                            required: true,
                        },
                    ],
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        expect(screen.getByText("SQLite Connection (Chinook)")).toBeInTheDocument();
        expect(
            screen.getByText("Provide a local path to Chinook_Sqlite.sqlite."),
        ).toBeInTheDocument();
        expect(
            screen.queryByText("Input SQLite path and SQL guardrails for this test source."),
        ).not.toBeInTheDocument();
    });

    it("resets rendered fields when the interaction step changes", () => {
        const { rerender } = render(
            <FlowHandler
                source={buildSource({
                    type: "input_text",
                    step_id: "api_key",
                    title: "API Key",
                    message: "Provide API key",
                    fields: [
                        {
                            key: "api_key",
                            label: "API Key",
                            type: "password",
                            required: true,
                        },
                    ],
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        expect(screen.getByLabelText("API Key *")).toBeInTheDocument();
        expect(screen.queryByLabelText("SQL Timeout Seconds")).not.toBeInTheDocument();

        rerender(
            <FlowHandler
                source={buildSource({
                    type: "input_text",
                    step_id: "collect_sqlite_inputs",
                    title: "SQLite Connection (Chinook)",
                    description: "Provide a local path to Chinook_Sqlite.sqlite.",
                    message: "Input SQLite path and SQL guardrails for this test source.",
                    fields: [
                        {
                            key: "chinook_db_path",
                            label: "Chinook SQLite Path",
                            type: "text",
                            required: true,
                        },
                        {
                            key: "sql_timeout_seconds",
                            label: "SQL Timeout Seconds",
                            type: "text",
                            required: false,
                        },
                        {
                            key: "sql_max_rows",
                            label: "SQL Max Rows",
                            type: "text",
                            required: false,
                        },
                    ],
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        expect(screen.queryByLabelText("API Key *")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Chinook SQLite Path *")).toBeInTheDocument();
        expect(screen.getByLabelText("SQL Timeout Seconds")).toBeInTheDocument();
        expect(screen.getByLabelText("SQL Max Rows")).toBeInTheDocument();
        expect(screen.getByText("SQLite Connection (Chinook)")).toBeInTheDocument();
    });

    it("renders optional typed fields and submits normalized values", async () => {
        const onClose = vi.fn();
        const onInteractSuccess = vi.fn();

        render(
            <FlowHandler
                source={buildSource({
                    type: "input_text",
                    message: "Fill credentials",
                    fields: [
                        {
                            key: "nickname",
                            label: "Nickname",
                            type: "text",
                            required: false,
                        },
                        {
                            key: "enabled",
                            label: "Enabled",
                            type: "switch",
                            required: false,
                            default: false,
                            value_type: "boolean",
                        },
                        {
                            key: "region",
                            label: "Region",
                            type: "select",
                            required: false,
                            default: "eu",
                            options: [
                                { label: "US", value: "us" },
                                { label: "EU", value: "eu" },
                            ],
                        },
                        {
                            key: "plan",
                            label: "Plan",
                            type: "radio",
                            required: false,
                            options: [
                                { label: "Free", value: "free" },
                                { label: "Pro", value: "pro" },
                            ],
                        },
                        {
                            key: "scopes",
                            label: "Scopes",
                            type: "multiselect",
                            required: false,
                            multiple: true,
                            options: [
                                { label: "Read", value: "read" },
                                { label: "Write", value: "write" },
                                { label: "Admin", value: "admin" },
                            ],
                        },
                    ],
                })}
                isOpen={true}
                onClose={onClose}
                onInteractSuccess={onInteractSuccess}
            />,
        );

        expect(screen.getByLabelText("Nickname")).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Enabled" })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Region" })).toBeInTheDocument();
        expect(screen.getByRole("radio", { name: "Pro" })).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: "Read" })).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Nickname"), {
            target: { value: "  skywalker  " },
        });
        fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));
        fireEvent.click(screen.getByRole("radio", { name: "Pro" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Read" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Admin" }));
        fireEvent.click(screen.getByRole("combobox", { name: "Region" }));
        fireEvent.click(await screen.findByText("US"));

        fireEvent.click(screen.getByRole("button", { name: /Submit|提交/ }));
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.interact).toHaveBeenCalledWith("source-1", {
            nickname: "skywalker",
            enabled: true,
            region: "us",
            plan: "pro",
            scopes: ["read", "admin"],
        });
        expect(onInteractSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders every field in large input_text forms without truncation", () => {
        const fields = Array.from({ length: 35 }, (_, index) => ({
            key: `field_${index + 1}`,
            label: `Field ${index + 1}`,
            type: "text",
            required: false,
        }));

        render(
            <FlowHandler
                source={buildSource({
                    type: "input_text",
                    message: "Large form",
                    fields,
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        expect(screen.getAllByRole("textbox")).toHaveLength(35);
        expect(screen.getByLabelText("Field 35")).toBeInTheDocument();
    });

    it("allows submitting optional empty fields without blocking", async () => {
        render(
            <FlowHandler
                source={buildSource({
                    type: "input_text",
                    message: "Optional only",
                    fields: [
                        {
                            key: "note",
                            label: "Note",
                            type: "text",
                            required: false,
                        },
                    ],
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        const submitButton = screen.getByRole("button", { name: /Submit|提交/ });
        expect(submitButton).not.toBeDisabled();

        fireEvent.click(submitButton);
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.interact).toHaveBeenCalledWith("source-1", {});
    });

    it("renders input form fields and blocks submit until required values are present", async () => {
        const onClose = vi.fn();
        const onInteractSuccess = vi.fn();

        render(
            <FlowHandler
                source={buildSource({
                    type: "input_form",
                    message: "Fill credentials",
                    fields: [
                        {
                            key: "api_key",
                            label: "API Key",
                            type: "password",
                            required: true,
                        },
                        {
                            key: "region",
                            label: "Region",
                            type: "text",
                            required: true,
                            default: "us",
                        },
                    ],
                })}
                isOpen={true}
                onClose={onClose}
                onInteractSuccess={onInteractSuccess}
            />,
        );

        const submitButton = screen.getByRole("button", { name: /Submit|提交/ });
        expect(submitButton).toBeDisabled();

        fireEvent.change(screen.getByLabelText("API Key *"), {
            target: { value: "  sk-test-123  " },
        });
        expect(submitButton).not.toBeDisabled();

        fireEvent.click(submitButton);
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.interact).toHaveBeenCalledWith("source-1", {
            api_key: "sk-test-123",
            region: "us",
        });
        expect(onInteractSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("submits network trust allow_once decision with source scope by default", async () => {
        const onClose = vi.fn();
        const onInteractSuccess = vi.fn();

        render(
            <FlowHandler
                source={buildSource({
                    type: "confirm",
                    message: "Network trust required",
                    fields: [],
                    data: {
                        confirm_kind: "network_trust",
                        target_key: "127.0.0.1",
                        target_class: "loopback",
                        available_scopes: ["source", "global"],
                    },
                })}
                isOpen={true}
                onClose={onClose}
                onInteractSuccess={onInteractSuccess}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: /Allow Once|仅允许本次/,
            }),
        );
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.interact).toHaveBeenCalledWith("source-1", {
            type: "confirm",
            decision: "allow_once",
            scope: "source",
            target_key: "127.0.0.1",
        });
        expect(onInteractSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("submits network trust allow_always decision with global scope", async () => {
        render(
            <FlowHandler
                source={buildSource({
                    type: "confirm",
                    message: "Network trust required",
                    fields: [],
                    data: {
                        confirm_kind: "network_trust",
                        target_key: "127.0.0.1",
                        target_class: "loopback",
                        available_scopes: ["source", "global"],
                    },
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: /Global|全局/,
            }),
        );
        fireEvent.click(
            screen.getByRole("button", {
                name: /Allow Always|始终允许/,
            }),
        );
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.interact).toHaveBeenCalledWith("source-1", {
            type: "confirm",
            decision: "allow_always",
            scope: "global",
            target_key: "127.0.0.1",
        });
    });

    it("renders database operation risk copy and submits trust decisions with the same contract", async () => {
        render(
            <FlowHandler
                source={buildSource({
                    type: "confirm",
                    message: "Database risk confirmation required",
                    fields: [],
                    data: {
                        confirm_kind: "db_operation_risk",
                        target_key: "postgresql",
                        profile: "postgresql",
                        statement_types: ["delete"],
                        risk_reasons: ["non_select_statement"],
                        query_preview: "DELETE FROM metrics WHERE id = 1",
                        available_scopes: ["source", "global"],
                    },
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        expect(
            screen.getByText(/may write or mutate stored data|可能写入或修改已存储的数据/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Query preview: DELETE FROM metrics WHERE id = 1|查询预览：DELETE FROM metrics WHERE id = 1/),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: /Allow Once|仅允许本次/,
            }),
        );
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.interact).toHaveBeenCalledWith("source-1", {
            type: "confirm",
            decision: "allow_once",
            scope: "source",
            target_key: "postgresql",
        });
    });

    it("prefers error code copy over interaction message in dialog title/description", async () => {
        render(
            <FlowHandler
                source={{
                    ...buildSource({
                        type: "input_text",
                        message: "Raw backend message",
                        fields: [],
                    }),
                    status: "error",
                    error_code: "auth.invalid_credentials",
                }}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        expect(
            await screen.findByText(/Credentials invalid|凭证无效/),
        ).toBeInTheDocument();
        expect(
            screen.getAllByText(
                /Authorization is invalid|鉴权信息已失效/,
            ).length,
        ).toBeGreaterThan(0);
        expect(screen.queryByText("Raw backend message")).not.toBeInTheDocument();
    });

    it("shows sandbox interception copy with explicit error code", async () => {
        render(
            <FlowHandler
                source={{
                    ...buildSource({
                        type: "input_text",
                        message: "Raw sandbox blocked message",
                        fields: [],
                    }),
                    status: "error",
                    error_code: "script_sandbox_blocked",
                }}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        expect(
            await screen.findByText(/Script blocked by sandbox|脚本被沙箱拦截/),
        ).toBeInTheDocument();
        expect(
            screen.getAllByText(/script_sandbox_blocked/).length,
        ).toBeGreaterThan(0);
        expect(
            screen.queryByText("Raw sandbox blocked message"),
        ).not.toBeInTheDocument();
    });

    it("polls auth status while oauth window is open and closes when authorized", async () => {
        vi.useFakeTimers();
        apiMock.getSources.mockResolvedValue([
            buildSource({
                type: "oauth_start",
                message: "OAuth required",
                fields: [],
                data: {
                    oauth_flow: "code",
                },
            }),
        ]);
        apiMock.getAuthStatus
            .mockResolvedValueOnce({
                source_id: "source-1",
                auth_type: "oauth",
                status: "missing",
                message: "需要 OAuth 授权",
            })
            .mockResolvedValueOnce({
                source_id: "source-1",
                auth_type: "oauth",
                status: "ok",
            });

        const onClose = vi.fn();
        const onInteractSuccess = vi.fn();
        const openSpy = vi
            .spyOn(window, "open")
            .mockImplementation(() => null);

        render(
            <FlowHandler
                source={buildSource({
                    type: "oauth_start",
                    message: "OAuth required",
                    fields: [],
                    data: {
                        oauth_flow: "code",
                    },
                })}
                isOpen={true}
                onClose={onClose}
                onInteractSuccess={onInteractSuccess}
            />,
        );

        fireEvent.click(screen.getByText(/Connect Test Source|连接 Test Source/));
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.getAuthStatus).toHaveBeenCalledTimes(1);
        expect(onInteractSuccess).toHaveBeenCalledTimes(0);

        await act(async () => {
            vi.advanceTimersByTime(2100);
            await Promise.resolve();
        });

        expect(apiMock.getAuthStatus).toHaveBeenCalledTimes(2);
        expect(onInteractSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);

        openSpy.mockRestore();
    });

    it("polls device token only after manual verify action", async () => {
        vi.useFakeTimers();
        apiMock.getAuthorizeUrl.mockResolvedValue({
            flow: "device",
            device: {
                user_code: "ABCD-EFGH",
                verification_uri: "https://provider.example.com/activate",
                expires_in: 600,
                interval: 1,
            },
        });
        apiMock.pollDeviceToken.mockResolvedValue({ status: "authorized" });

        const onClose = vi.fn();
        const onInteractSuccess = vi.fn();
        render(
            <FlowHandler
                source={buildSource({
                    type: "oauth_device_flow",
                    message: "Auth required",
                    fields: [],
                })}
                isOpen={true}
                onClose={onClose}
                onInteractSuccess={onInteractSuccess}
            />,
        );

        fireEvent.click(screen.getByText("Start Device Authorization"));
        await act(async () => {
            await Promise.resolve();
        });
        expect(apiMock.getAuthorizeUrl).toHaveBeenCalledTimes(1);
        expect(apiMock.getAuthorizeUrl).toHaveBeenCalledWith(
            "source-1",
            `${window.location.origin}/oauth/callback`,
        );
        expect(apiMock.pollDeviceToken).toHaveBeenCalledTimes(0);

        await act(async () => {
            vi.advanceTimersByTime(1000);
            await Promise.resolve();
        });
        fireEvent.click(screen.getByText("Verify"));

        await act(async () => {
            await Promise.resolve();
        });
        expect(apiMock.pollDeviceToken).toHaveBeenCalledTimes(1);
        expect(onInteractSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("uses Tauri web mode port for OAuth redirect URI in production runtime", async () => {
        (globalThis as any).isTauri = true;
        mockInvoke.mockImplementation((command: string) => {
            if (command === "get_runtime_port_info") {
                return Promise.resolve({
                    api_target_port: 18640,
                    web_mode_port: 18641,
                });
            }
            return Promise.resolve(undefined);
        });

        render(
            <FlowHandler
                source={buildSource({
                    type: "oauth_start",
                    message: "OAuth required",
                    fields: [],
                    data: {
                        oauth_flow: "code",
                    },
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByText(/Connect Test Source|连接 Test Source/));
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.getAuthorizeUrl).toHaveBeenCalledWith(
            "source-1",
            "http://localhost:18641/oauth/callback",
        );
        delete (globalThis as any).isTauri;
    });

    it("throttles verify action to avoid repeated polling", async () => {
        vi.useFakeTimers();
        apiMock.getAuthorizeUrl.mockResolvedValue({
            flow: "device",
            device: {
                user_code: "ABCD-EFGH",
                verification_uri: "https://provider.example.com/activate",
                expires_in: 600,
                interval: 0,
            },
        });
        apiMock.pollDeviceToken.mockResolvedValue({
            status: "pending",
            retry_after: 3,
        });

        render(
            <FlowHandler
                source={buildSource({
                    type: "oauth_device_flow",
                    message: "Auth required",
                    fields: [],
                })}
                isOpen={true}
                onClose={vi.fn()}
                onInteractSuccess={vi.fn()}
            />,
        );

        fireEvent.click(screen.getByText("Start Device Authorization"));
        await act(async () => {
            await Promise.resolve();
        });

        fireEvent.click(screen.getByText("Verify"));
        fireEvent.click(screen.getByText(/Verify/));
        await act(async () => {
            await Promise.resolve();
        });

        expect(apiMock.pollDeviceToken).toHaveBeenCalledTimes(1);
    });
});
