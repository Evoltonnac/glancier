import { useCallback, useEffect, useRef, useState } from "react";
import type { SourceSummary } from "../../types/config";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AlertCircle, ExternalLink, Wrench, Monitor, Download } from "lucide-react";
import { api } from "../../api/client";
import { isTauri, openExternalLink } from "../../lib/utils";
import { DeviceFlowModal, type DeviceFlowData } from "./DeviceFlowModal";

interface FlowHandlerProps {
    source: SourceSummary | null;
    isOpen: boolean;
    onClose: () => void;
    onInteractSuccess?: () => void;
    onPushToQueue?: (
        source: SourceSummary,
        options?: { foreground?: boolean },
    ) => boolean; // returns false if already in queue
}

const OAUTH_PENDING_SOURCE_ID_KEY = "oauth_pending_source_id";
const AUTH_STATUS_POLL_INTERVAL_MS = 2000;

export function FlowHandler({
    source,
    isOpen,
    onClose,
    onInteractSuccess,
    onPushToQueue,
}: FlowHandlerProps) {
    const inTauri = isTauri();
    const sourceId = source?.id ?? null;
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deviceFlowData, setDeviceFlowData] = useState<DeviceFlowData | null>(
        null,
    );
    const [deviceStatus, setDeviceStatus] = useState<
        "idle" | "pending" | "authorized" | "expired" | "error"
    >("idle");
    const [verifying, setVerifying] = useState(false);
    const authStatusPollInFlightRef = useRef(false);

    // Refs to track initial source ID and step ID for state change detection
    const initialSourceIdRef = useRef<string | null>(null);
    const initialStepIdRef = useRef<string | null>(null);

    const interaction = source?.interaction ?? null;
    const isErrorState = source?.status === "error";
    const isSuspendedState = source?.status === "suspended";

    const handleInputChange = (key: string, value: string) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    const resetFlowState = useCallback(() => {
        setError(null);
        setLoading(false);
        setDeviceFlowData(null);
        setDeviceStatus("idle");
        setVerifying(false);
    }, []);

    const handleClose = useCallback(() => {
        resetFlowState();
        onClose();
    }, [onClose, resetFlowState]);

    useEffect(() => {
        setFormData({});
        resetFlowState();
    }, [sourceId, resetFlowState]);

    // Track initial source ID and step ID when source changes
    useEffect(() => {
        if (sourceId) {
            initialSourceIdRef.current = sourceId;
            initialStepIdRef.current = interaction?.step_id ?? null;
        }
    }, [sourceId, interaction?.step_id]);

    // Poll for source state changes and close modal if step_id changed or no interaction
    useEffect(() => {
        if (!isOpen || !initialSourceIdRef.current) return;

        const checkSourceState = async () => {
            try {
                const sources = await api.getSources();
                const currentSource = sources.find((s) => s.id === initialSourceIdRef.current);
                if (!currentSource) {
                    // Source no longer exists, close modal
                    handleClose();
                    return;
                }

                const currentInteraction = currentSource.interaction;
                const currentStepId = currentInteraction?.step_id ?? null;

                // Close modal if: no interaction, or step_id changed
                if (!currentInteraction || currentStepId !== initialStepIdRef.current) {
                    console.log(
                        "[FlowHandler] Source state changed, closing modal:",
                        currentSource.id,
                    );
                    handleClose();
                }
            } catch (err) {
                console.debug("[FlowHandler] Failed to check source state:", err);
            }
        };

        const intervalId = setInterval(checkSourceState, 2000);
        return () => clearInterval(intervalId);
    }, [isOpen, handleClose]);

    // Poll auth status while waiting for OAuth code flow callback.
    useEffect(() => {
        if (!isOpen || !sourceId || interaction?.type !== "oauth_start" || !loading) {
            return;
        }

        let active = true;

        const pollAuthStatus = async () => {
            if (!active || authStatusPollInFlightRef.current) return;
            authStatusPollInFlightRef.current = true;
            try {
                const authStatus = await api.getAuthStatus(sourceId);
                if (!active) return;

                if (authStatus.status === "ok") {
                    console.log(
                        "[FlowHandler] OAuth verified via auth-status polling:",
                        sourceId,
                    );
                    onInteractSuccess?.();
                    handleClose();
                    return;
                }

                if (authStatus.status === "error" && authStatus.message) {
                    setError(authStatus.message);
                }
            } catch (err) {
                console.debug("[FlowHandler] Auth status polling failed:", err);
            } finally {
                authStatusPollInFlightRef.current = false;
            }
        };

        void pollAuthStatus();
        const intervalId = window.setInterval(() => {
            void pollAuthStatus();
        }, AUTH_STATUS_POLL_INTERVAL_MS);

        return () => {
            active = false;
            window.clearInterval(intervalId);
            authStatusPollInFlightRef.current = false;
        };
    }, [
        handleClose,
        interaction?.type,
        isOpen,
        loading,
        onInteractSuccess,
        sourceId,
    ]);

    // Check for existing device flow status when modal opens.
    // NOTE: Removed automatic polling - user must manually click "Verify" button.
    useEffect(() => {
        if (!isOpen || !sourceId) return;
        const flowHint =
            interaction?.data?.oauth_flow ||
            interaction?.data?.oauth_args?.oauth_flow ||
            interaction?.data?.oauth_args?.flow_type ||
            interaction?.data?.oauth_args?.grant_type;
        const normalizedFlowHint =
            typeof flowHint === "string" ? flowHint.trim().toLowerCase() : "";
        const shouldCheckDeviceFlowStatus =
            interaction?.type === "oauth_device_flow" ||
            (interaction?.type === "oauth_start" &&
                (normalizedFlowHint === "device" ||
                    normalizedFlowHint === "device_code"));
        if (!shouldCheckDeviceFlowStatus) return;

        const checkExistingFlow = async () => {
            try {
                console.log("[FlowHandler] Checking existing device flow for:", sourceId);
                const status = await api.getDeviceFlowStatus(sourceId);
                console.log("[FlowHandler] Existing flow status:", status);
                if (status.status === "pending") {
                    if (status.device) {
                        // Restore existing device flow
                        setDeviceFlowData(status.device);
                    }
                    setDeviceStatus("pending");
                    // Don't set cooldown - user manually clicks Verify
                } else if (status.status === "authorized") {
                    setDeviceStatus("authorized");
                    onInteractSuccess?.();
                    handleClose();
                } else if (status.status === "expired") {
                    setDeviceStatus("expired");
                    setError("Device code expired. Please restart authorization.");
                } else if (status.status === "denied") {
                    setDeviceStatus("error");
                    setError("Authorization was denied.");
                } else if (status.status === "error") {
                    setDeviceStatus("error");
                    setError(status.error_description || "Device flow error");
                }
            } catch (err) {
                // Ignore errors - no existing flow
                console.debug("No existing device flow:", err);
            }
        };

        void checkExistingFlow();
    }, [handleClose, interaction?.type, isOpen, onInteractSuccess, sourceId]);

    const handleSubmit = async () => {
        if (!source) return;
        setLoading(true);
        setError(null);
        try {
            await api.interact(source.id, formData);
            onInteractSuccess?.();
            handleClose();
        } catch (err: any) {
            setError(err.message || "Interaction failed");
        } finally {
            setLoading(false);
        }
    };

    const pollDeviceToken = useCallback(async () => {
        if (!sourceId) return;
        if (verifying) return;
        setVerifying(true);
        try {
            console.log("[FlowHandler] Polling device token for:", sourceId);
            const pollResult = await api.pollDeviceToken(sourceId);
            console.log("[FlowHandler] Poll result:", pollResult);
            if (pollResult.status === "authorized") {
                console.log("[FlowHandler] Authorization successful! Closing modal...");
                setDeviceStatus("authorized");
                onInteractSuccess?.();
                handleClose();
                return;
            }
            if (pollResult.status === "pending") {
                setDeviceStatus("pending");
                // User can click Verify again manually - no auto cooldown
                return;
            }
            if (pollResult.status === "expired") {
                setDeviceStatus("expired");
                setError("Device code expired. Please restart authorization.");
                return;
            }
            if (pollResult.status === "denied") {
                setDeviceStatus("error");
                setError("Authorization was denied.");
                return;
            }
            setDeviceStatus("error");
            setError(
                pollResult.error_description ||
                    pollResult.error ||
                    "Device flow polling failed",
            );
        } catch (err: any) {
            setDeviceStatus("error");
            setError(err.message || "Failed to poll device token");
        } finally {
            setVerifying(false);
        }
    }, [handleClose, onInteractSuccess, sourceId, verifying]);

    const handleOAuthStart = useCallback(async () => {
        if (!source || !sourceId) return;
        setLoading(true);
        setError(null);

        // 1. Setup Listener
        const channel = new BroadcastChannel("oauth_channel");
        channel.onmessage = (event) => {
            if (
                event.data.type === "success" &&
                event.data.sourceId === source.id
            ) {
                onInteractSuccess?.();
                handleClose();
                channel.close();
            }
        };

        try {
            // 2. If user entered client_id/client_secret, save them first
            // This ensures the credentials are stored before getting the authorize URL
            const hasCredentials = formData.client_id || formData.client_secret;
            if (hasCredentials) {
                await api.interact(source.id, formData);
            }

            // 3. Get Authorize URL
            // Source ID will be passed via state parameter by the backend
            const redirectUri = window.location.origin + "/oauth/callback";
            const res = await api.getAuthorizeUrl(source.id, redirectUri);

            if (res.flow === "device") {
                setLoading(false);
                setDeviceFlowData(res.device);
                setDeviceStatus("pending");
                // Don't set cooldown - user manually clicks Verify
                channel.close();
                return;
            }

            if (res.flow === "client_credentials") {
                setLoading(false);
                onInteractSuccess?.();
                handleClose();
                channel.close();
                return;
            }

            try {
                window.localStorage.setItem(OAUTH_PENDING_SOURCE_ID_KEY, source.id);
            } catch (_e) {
                // Ignore localStorage errors and rely on provider state.
            }

            // 3. Open Popup or System Browser
            if (inTauri) {
                await openExternalLink(res.authorize_url);
            } else {
                const width = 600;
                const height = 700;
                const left = window.screen.width / 2 - width / 2;
                const top = window.screen.height / 2 - height / 2;

                window.open(
                    res.authorize_url,
                    "oauth_window",
                    `width=${width},height=${height},top=${top},left=${left},resizable,scrollbars,status`,
                );
            }
        } catch (err: any) {
            setError(err.message || "Failed to start OAuth flow");
            setLoading(false);
            channel.close();
        }
    }, [formData, handleClose, inTauri, onInteractSuccess, source, sourceId]);

    const renderContent = () => {
        if (!source || !interaction) {
            return null;
        }

        // Get doc_url from interaction data if available
        const docUrl = interaction.data?.doc_url;

        switch (interaction.type) {
            case "input_text":
                return (
                    <div className="space-y-4 py-4">
                        {interaction.fields.map((field) => (
                            <div key={field.key} className="grid gap-2">
                                <label
                                    htmlFor={field.key}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    {field.label}
                                </label>
                                <Input
                                    id={field.key}
                                    type={field.type || "text"}
                                    placeholder={field.description}
                                    value={formData[field.key] || ""}
                                    onChange={(e) =>
                                        handleInputChange(
                                            field.key,
                                            e.target.value,
                                        )
                                    }
                                    disabled={loading}
                                    className="bg-surface focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 transition-all hover:border-brand/50"
                                />
                            </div>
                        ))}
                    </div>
                );

            case "oauth_start":
                return (
                    <div className="py-6 flex flex-col items-center gap-3">
                        {/* Render client_id/client_secret input fields if present */}
                        {interaction.fields.length > 0 && (
                            <div className="w-full space-y-4">
                                {interaction.fields.map((field) => (
                                    <div
                                        key={field.key}
                                        className="grid gap-2"
                                    >
                                        <label
                                            htmlFor={field.key}
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            {field.label}
                                        </label>
                                        <Input
                                            id={field.key}
                                            type={field.type || "text"}
                                            placeholder={field.description}
                                            value={
                                                formData[field.key] || ""
                                            }
                                            onChange={(e) =>
                                                handleInputChange(
                                                    field.key,
                                                    e.target.value,
                                                )
                                            }
                                            disabled={loading}
                                            className="bg-surface focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 transition-all hover:border-brand/50"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Render doc_url link if available */}
                        {docUrl && (
                            <div className="w-full text-sm text-muted-foreground text-center">
                                <a
                                    href={docUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 hover:underline inline-flex items-center gap-1"
                                >
                                    How to create OAuth client?
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        )}

                        <Button
                            onClick={handleOAuthStart}
                            disabled={loading}
                            className="w-full relative"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Waiting for authorization...
                                </>
                            ) : (
                                <>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    Connect {source.name}
                                </>
                            )}
                        </Button>
                        <div className="text-xs text-muted-foreground text-center">
                            A new window will open to authorize access.
                            <br />
                            Do not close this dialog until completed.
                        </div>
                    </div>
                );

            case "oauth_device_flow":
                return (
                    <DeviceFlowModal
                        flowData={deviceFlowData}
                        loading={loading || verifying}
                        status={deviceStatus}
                        onStart={handleOAuthStart}
                        onVerifyNow={pollDeviceToken}
                    />
                );

            case "confirm":
                return (
                    <div className="py-4 text-sm text-center">
                        Please confirm to proceed with {source.name}.
                    </div>
                );

            case "webview_scrape":
                return (
                    <div className="py-6 flex flex-col items-center justify-center space-y-4">
                        {inTauri ? (
                            <>
                                <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center">
                                    <Wrench className="w-6 h-6 text-brand" />
                                </div>
                                <div className="text-sm text-muted-foreground text-center">
                                    <p className="font-semibold text-foreground mb-1">
                                        需要手动介入
                                    </p>
                                    <p>点击下方按钮将浏览器窗口启动在前台。</p>
                                    <p className="mt-1">
                                        你可以在窗口中登录或通过验证码，完成后数据将自动采集并继续。
                                    </p>
                                </div>
                                <Button
                                    onClick={() => {
                                        if (!source || !onPushToQueue) return;
                                        const added = onPushToQueue(source, {
                                            foreground: true,
                                        });
                                        if (added) {
                                            handleClose();
                                        }
                                    }}
                                    className="w-full"
                                >
                                    在前台打开浏览器
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center">
                                    <Monitor className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <div className="text-sm text-muted-foreground text-center space-y-2">
                                    <p className="font-semibold text-foreground">
                                        此功能仅在桌面客户端可用
                                    </p>
                                    <p>
                                        由于浏览器安全限制，网页抓取任务（如自动登录、后台采集）无法在
                                        Web 端直接运行。
                                    </p>
                                    <p className="text-xs bg-muted/50 p-2 rounded-md border border-border/50">
                                        请下载并使用 Glancier
                                        桌面客户端，它内置了安全的自动化引擎，能完美支持此类操作。
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full gap-2 border-brand/20 hover:bg-brand/5 hover:border-brand/40 text-brand"
                                    onClick={() =>
                                        openExternalLink(
                                            "https://github.com/xingminghua/glancier/releases",
                                        )
                                    }
                                >
                                    <Download className="h-4 w-4" />
                                    下载桌面客户端
                                </Button>
                            </>
                        )}
                    </div>
                );

            default:
                return (
                    <div className="py-4 text-red-500">
                        Unknown interaction type: {interaction.type}
                    </div>
                );
        }
    };

    if (!source || !interaction) {
        return null;
    }

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) {
                    handleClose();
                }
            }}
        >
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {interaction.message ||
                            `Action Required: ${source.name}`}
                    </DialogTitle>
                    <DialogDescription>
                        {interaction.type === "oauth_start"
                            ? "Authentication"
                            : interaction.type === "oauth_device_flow"
                            ? "Authentication"
                            : isErrorState
                              ? "凭证无效，请更新后重试。"
                              : isSuspendedState
                                ? "等待补充信息后继续执行。"
                                : "Please provide the requested information."}
                    </DialogDescription>
                </DialogHeader>

                {isErrorState && (
                    <div className="bg-error/15 text-error text-sm p-3 rounded-md flex items-start gap-2 mt-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>当前状态为 ERROR：凭证已提供但无效，请修正后重新提交。</div>
                    </div>
                )}

                {interaction.warning_message && (
                    <div className="bg-orange-500/15 text-orange-600 dark:text-orange-400 text-sm p-3 rounded-md flex items-start gap-2 mt-4 mx-4">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>{interaction.warning_message}</div>
                    </div>
                )}

                {error && (
                    <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                    </div>
                )}

                {renderContent()}

                <DialogFooter>
                    {interaction.type !== "oauth_start" &&
                        interaction.type !== "oauth_device_flow" &&
                        interaction.type !== "webview_scrape" && (
                            <Button onClick={handleSubmit} disabled={loading}>
                                {loading ? "Submitting..." : "Submit"}
                            </Button>
                        )}
                    {(interaction.type === "oauth_start" ||
                        interaction.type === "oauth_device_flow" ||
                        interaction.type === "webview_scrape") && (
                        <Button variant="outline" onClick={handleClose}>
                            关闭
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
