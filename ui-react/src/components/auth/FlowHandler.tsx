import { useCallback, useEffect, useRef, useState } from "react";
import type { InteractionField, InteractionFieldOption, SourceSummary } from "../../types/config";
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
import { Switch } from "../ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select";
import { AlertCircle, ExternalLink, Wrench, Monitor, Download } from "lucide-react";
import { api } from "../../api/client";
import { useI18n } from "../../i18n";
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

interface RuntimePortInfo {
    web_mode_port?: number | null;
}

type TrustScope = "source" | "global";
type InteractionValue = string | boolean | string[];

interface NetworkTrustInteractionData {
    confirm_kind: "network_trust";
    target_key?: string;
    target_value?: string;
    target_type?: string;
    target_class?: string;
    available_scopes?: TrustScope[];
}

export function FlowHandler({
    source,
    isOpen,
    onClose,
    onInteractSuccess,
    onPushToQueue,
}: FlowHandlerProps) {
    const inTauri = isTauri();
    const { t, getErrorCopyByCode } = useI18n();
    const sourceId = source?.id ?? null;
    const [formData, setFormData] = useState<Record<string, InteractionValue>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [deviceFlowData, setDeviceFlowData] = useState<DeviceFlowData | null>(
        null,
    );
    const [deviceStatus, setDeviceStatus] = useState<
        "idle" | "pending" | "authorized" | "expired" | "error"
    >("idle");
    const [trustScope, setTrustScope] = useState<TrustScope>("source");
    const [verifying, setVerifying] = useState(false);
    const authStatusPollInFlightRef = useRef(false);

    // Refs to track initial source ID and step ID for state change detection
    const initialSourceIdRef = useRef<string | null>(null);
    const initialStepIdRef = useRef<string | null>(null);

    const interaction = source?.interaction ?? null;
    const isErrorState = source?.status === "error";
    const isSuspendedState = source?.status === "suspended";
    const sourceErrorCopy = getErrorCopyByCode(source?.error_code);
    const networkTrustData: NetworkTrustInteractionData | null =
        interaction?.type === "confirm" &&
        interaction.data?.confirm_kind === "network_trust"
            ? (interaction.data as NetworkTrustInteractionData)
            : null;
    const availableTrustScopes = Array.isArray(networkTrustData?.available_scopes)
        ? networkTrustData.available_scopes
        : ["source", "global"];
    const supportsGlobalTrustScope = availableTrustScopes.includes("global");

    const getFieldOptions = useCallback((field: InteractionField): InteractionFieldOption[] => {
        if (!Array.isArray(field.options)) {
            return [];
        }
        return field.options.filter(
            (option): option is InteractionFieldOption =>
                typeof option?.label === "string" && typeof option?.value === "string",
        );
    }, []);

    const getFieldInitialValue = useCallback(
        (field: InteractionField): InteractionValue => {
            if (field.multiple || field.type === "multiselect") {
                return Array.isArray(field.default)
                    ? field.default.filter((item): item is string => typeof item === "string")
                    : [];
            }
            if (
                field.type === "switch" ||
                field.type === "boolean" ||
                field.value_type === "boolean"
            ) {
                return Boolean(field.default);
            }
            if (typeof field.default === "string") {
                return field.default;
            }
            return "";
        },
        [],
    );

    const getFieldValue = useCallback(
        (field: InteractionField): InteractionValue => {
            const currentValue = formData[field.key];
            if (currentValue !== undefined) {
                return currentValue;
            }
            return getFieldInitialValue(field);
        },
        [formData, getFieldInitialValue],
    );

    const handleInputChange = (key: string, value: InteractionValue) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    const hasEffectiveValue = useCallback((value: unknown): boolean => {
        if (value === null || value === undefined) {
            return false;
        }
        if (typeof value === "string") {
            return value.trim().length > 0;
        }
        return true;
    }, []);

    const getMissingRequiredFieldLabels = useCallback(
        (fields: Array<{ key: string; label: string; required: boolean; default?: unknown }>) =>
            fields
                .filter((field) => {
                    if (!field.required) {
                        return false;
                    }
                    if (hasEffectiveValue(formData[field.key])) {
                        return false;
                    }
                    return !hasEffectiveValue(field.default);
                })
                .map((field) => field.label || field.key),
        [formData, hasEffectiveValue],
    );

    const buildInteractionPayload = useCallback(
        (fields: Array<InteractionField>) => {
            const payload: Record<string, InteractionValue> = {};
            fields.forEach((field) => {
                const raw = getFieldValue(field);
                if (Array.isArray(raw)) {
                    if (raw.length > 0) {
                        payload[field.key] = raw;
                    }
                    return;
                }
                if (typeof raw === "boolean") {
                    payload[field.key] = raw;
                    return;
                }
                if (typeof raw !== "string") {
                    return;
                }
                const normalized = raw.trim();
                if (!normalized) {
                    return;
                }
                payload[field.key] = normalized;
            });
            return payload;
        },
        [getFieldValue],
    );
    const missingRequiredFieldLabels = interaction
        ? getMissingRequiredFieldLabels(interaction.fields)
        : [];
    const hasMissingRequiredFields = missingRequiredFieldLabels.length > 0;

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

    const resolveOAuthRedirectUri = useCallback(async (): Promise<string> => {
        const fallback = `${window.location.origin}/oauth/callback`;
        if (!inTauri) {
            return fallback;
        }

        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const info = await invoke<RuntimePortInfo>("get_runtime_port_info");
            const webModePort = Number(info?.web_mode_port);
            if (Number.isFinite(webModePort) && webModePort > 0) {
                return `http://localhost:${webModePort}/oauth/callback`;
            }
        } catch (error) {
            console.debug("[FlowHandler] Failed to resolve Tauri web mode port:", error);
        }

        return fallback;
    }, [inTauri]);

    useEffect(() => {
        setFormData({});
        resetFlowState();
        setTrustScope("source");
    }, [sourceId, interaction?.step_id, resetFlowState]);

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
                    setError(t("flow.device.expired"));
                } else if (status.status === "denied") {
                    setDeviceStatus("error");
                    setError(t("flow.device.denied"));
                } else if (status.status === "error") {
                    setDeviceStatus("error");
                    setError(status.error_description || t("flow.device.error"));
                }
            } catch (err) {
                // Ignore errors - no existing flow
                console.debug("No existing device flow:", err);
            }
        };

        void checkExistingFlow();
    }, [handleClose, interaction?.type, isOpen, onInteractSuccess, sourceId, t]);

    const handleSubmit = async () => {
        if (!source || !interaction) return;
        const missingRequiredLabels = getMissingRequiredFieldLabels(
            interaction.fields,
        );
        if (missingRequiredLabels.length > 0) {
            setError(
                t("flow.error.missing_fields", {
                    fields: missingRequiredLabels.join(", "),
                }),
            );
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const payload = buildInteractionPayload(interaction.fields);
            await api.interact(source.id, payload);
            onInteractSuccess?.();
            handleClose();
        } catch (err: any) {
            setError(err.message || t("flow.error.interaction_failed"));
        } finally {
            setLoading(false);
        }
    };

    const submitTrustDecision = useCallback(
        async (decision: "allow_once" | "allow_always" | "deny") => {
            if (!source || !interaction || !networkTrustData) return;

            const targetKey =
                networkTrustData.target_key || networkTrustData.target_value;
            if (!targetKey) {
                setError(t("flow.error.interaction_failed"));
                return;
            }

            setLoading(true);
            setError(null);
            try {
                await api.interact(source.id, {
                    type: "confirm",
                    decision,
                    scope: supportsGlobalTrustScope ? trustScope : "source",
                    target_key: targetKey,
                });
                onInteractSuccess?.();
                handleClose();
            } catch (err: any) {
                setError(err.message || t("flow.error.interaction_failed"));
            } finally {
                setLoading(false);
            }
        },
        [
            handleClose,
            interaction,
            networkTrustData,
            onInteractSuccess,
            source,
            supportsGlobalTrustScope,
            t,
            trustScope,
        ],
    );

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
                setError(t("flow.device.expired"));
                return;
            }
            if (pollResult.status === "denied") {
                setDeviceStatus("error");
                setError(t("flow.device.denied"));
                return;
            }
            setDeviceStatus("error");
            setError(
                pollResult.error_description ||
                    pollResult.error ||
                    t("flow.device.poll_failed"),
            );
        } catch (err: any) {
            setDeviceStatus("error");
            setError(err.message || t("flow.device.poll_exception"));
        } finally {
            setVerifying(false);
        }
    }, [handleClose, onInteractSuccess, sourceId, t, verifying]);

    const handleOAuthStart = useCallback(async () => {
        if (!source || !sourceId || !interaction) return;
        const missingRequiredLabels = getMissingRequiredFieldLabels(
            interaction.fields,
        );
        if (missingRequiredLabels.length > 0) {
            setError(
                t("flow.error.missing_fields", {
                    fields: missingRequiredLabels.join(", "),
                }),
            );
            return;
        }

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
            const credentialPayload = buildInteractionPayload(interaction.fields);
            // 2. If user entered client_id/client_secret, save them first
            // This ensures the credentials are stored before getting the authorize URL
            const hasCredentials = Object.keys(credentialPayload).length > 0;
            if (hasCredentials) {
                await api.interact(source.id, credentialPayload);
            }

            // 3. Get Authorize URL
            // Source ID will be passed via state parameter by the backend
            const redirectUri = await resolveOAuthRedirectUri();
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
            setError(err.message || t("flow.oauth.start_failed"));
            setLoading(false);
            channel.close();
        }
    }, [
        buildInteractionPayload,
        getMissingRequiredFieldLabels,
        handleClose,
        inTauri,
        interaction,
        onInteractSuccess,
        resolveOAuthRedirectUri,
        source,
        sourceId,
        t,
    ]);

    const renderInputField = useCallback(
        (field: InteractionField) => {
            const fieldValue = getFieldValue(field);
            const options = getFieldOptions(field);
            const label = `${field.label}${field.required ? " *" : ""}`;

            if (
                field.type === "switch" ||
                field.type === "boolean" ||
                field.value_type === "boolean"
            ) {
                return (
                    <div key={field.key} className="grid gap-2">
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
                            <label
                                htmlFor={field.key}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                {label}
                            </label>
                            <Switch
                                id={field.key}
                                aria-label={field.label}
                                checked={Boolean(fieldValue)}
                                onCheckedChange={(checked) =>
                                    handleInputChange(field.key, checked)
                                }
                                disabled={loading}
                            />
                        </div>
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                    </div>
                );
            }

            if (field.type === "radio") {
                return (
                    <fieldset key={field.key} className="grid gap-2">
                        <legend className="text-sm font-medium leading-none">{label}</legend>
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                        <div className="grid gap-2">
                            {options.map((option) => (
                                <label
                                    key={`${field.key}-${option.value}`}
                                    className="flex items-center gap-2 text-sm"
                                >
                                    <input
                                        type="radio"
                                        name={field.key}
                                        value={option.value}
                                        checked={fieldValue === option.value}
                                        onChange={() =>
                                            handleInputChange(field.key, option.value)
                                        }
                                        disabled={loading}
                                    />
                                    <span>{option.label}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                );
            }

            if (field.multiple || field.type === "multiselect") {
                const selectedValues = Array.isArray(fieldValue) ? fieldValue : [];
                return (
                    <fieldset key={field.key} className="grid gap-2">
                        <legend className="text-sm font-medium leading-none">{label}</legend>
                        {field.description && (
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                        <div className="grid gap-2">
                            {options.map((option) => {
                                const checked = selectedValues.includes(option.value);
                                return (
                                    <label
                                        key={`${field.key}-${option.value}`}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        <input
                                            type="checkbox"
                                            name={`${field.key}-${option.value}`}
                                            checked={checked}
                                            onChange={() => {
                                                const nextValues = checked
                                                    ? selectedValues.filter(
                                                          (value) => value !== option.value,
                                                      )
                                                    : [...selectedValues, option.value];
                                                handleInputChange(field.key, nextValues);
                                            }}
                                            disabled={loading}
                                        />
                                        <span>{option.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>
                );
            }

            if (field.type === "select") {
                const selectValue = typeof fieldValue === "string" ? fieldValue : "";
                return (
                    <div key={field.key} className="grid gap-2">
                        <label
                            htmlFor={field.key}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            {label}
                        </label>
                        <Select
                            value={selectValue || undefined}
                            onValueChange={(value) => handleInputChange(field.key, value)}
                            disabled={loading}
                        >
                            <SelectTrigger id={field.key} aria-label={field.label}>
                                <SelectValue placeholder={field.description || field.label} />
                            </SelectTrigger>
                            <SelectContent>
                                {options.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                );
            }

            return (
                <div key={field.key} className="grid gap-2">
                    <label
                        htmlFor={field.key}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        {label}
                    </label>
                    <Input
                        id={field.key}
                        type={field.type || "text"}
                        placeholder={field.description}
                        value={typeof fieldValue === "string" ? fieldValue : ""}
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        required={field.required}
                        disabled={loading}
                        className="bg-surface focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 transition-all hover:border-brand/50"
                    />
                </div>
            );
        },
        [getFieldOptions, getFieldValue, handleInputChange, loading],
    );

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
                        {interaction.fields.map((field) => renderInputField(field))}
                    </div>
                );

            case "input_form":
                return (
                    <div className="space-y-4 py-4">
                        {interaction.fields.map((field) => renderInputField(field))}
                    </div>
                );

            case "oauth_start":
                return (
                    <div className="py-6 flex flex-col items-center gap-3">
                        {/* Render client_id/client_secret input fields if present */}
                        {interaction.fields.length > 0 && (
                            <div className="w-full space-y-4">
                                {interaction.fields.map((field) => renderInputField(field))}
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
                                    {t("flow.oauth.help")}
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        )}

                        <Button
                            onClick={handleOAuthStart}
                            disabled={loading || hasMissingRequiredFields}
                            className="w-full relative"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    {t("flow.oauth.waiting")}
                                </>
                            ) : (
                                <>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    {t("flow.oauth.connect", { name: source.name })}
                                </>
                            )}
                        </Button>
                        <div className="text-xs text-muted-foreground text-center">
                            {t("flow.oauth.hint_1")}
                            <br />
                            {t("flow.oauth.hint_2")}
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
                if (networkTrustData?.confirm_kind === "network_trust") {
                    return (
                        <div className="py-4 space-y-4 text-sm">
                            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                                <div className="font-medium">
                                    {t("flow.network_trust.prompt")}
                                </div>
                                <div className="mt-1 text-muted-foreground">
                                    {t("flow.network_trust.target", {
                                        target:
                                            networkTrustData.target_key ||
                                            networkTrustData.target_value ||
                                            "",
                                    })}
                                </div>
                                {networkTrustData.target_class && (
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {t("flow.network_trust.classification", {
                                            classification:
                                                networkTrustData.target_class,
                                        })}
                                    </div>
                                )}
                            </div>

                            {supportsGlobalTrustScope && (
                                <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground">
                                        {t("flow.network_trust.scope.label")}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={
                                                trustScope === "source"
                                                    ? "default"
                                                    : "outline"
                                            }
                                            onClick={() => setTrustScope("source")}
                                            disabled={loading}
                                        >
                                            {t("flow.network_trust.scope.source")}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={
                                                trustScope === "global"
                                                    ? "default"
                                                    : "outline"
                                            }
                                            onClick={() => setTrustScope("global")}
                                            disabled={loading}
                                        >
                                            {t("flow.network_trust.scope.global")}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                }
                return (
                    <div className="py-4 text-sm text-center">
                        {t("flow.confirm.message", { name: source.name })}
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
                                        {t("flow.webview.manual.title")}
                                    </p>
                                    <p>{t("flow.webview.manual.description_1")}</p>
                                    <p className="mt-1">
                                        {t("flow.webview.manual.description_2")}
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
                                    {t("flow.webview.manual.button")}
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="w-12 h-12 rounded-full bg-muted/20 flex items-center justify-center">
                                    <Monitor className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <div className="text-sm text-muted-foreground text-center space-y-2">
                                    <p className="font-semibold text-foreground">
                                        {t("flow.webview.desktop_only.title")}
                                    </p>
                                    <p>
                                        {t("flow.webview.desktop_only.description")}
                                    </p>
                                    <p className="text-xs bg-muted/50 p-2 rounded-md border border-border/50">
                                        {t("flow.webview.desktop_only.tip")}
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full gap-2 border-brand/20 hover:bg-brand/5 hover:border-brand/40 text-brand"
                                    onClick={() =>
                                        openExternalLink(
                                            "https://github.com/xingminghua/glanceus/releases",
                                        )
                                    }
                                >
                                    <Download className="h-4 w-4" />
                                    {t("flow.webview.desktop_only.download")}
                                </Button>
                            </>
                        )}
                    </div>
                );

            default:
                return (
                    <div className="py-4 text-red-500">
                        {t("flow.unknown_interaction", {
                            type: interaction.type,
                        })}
                    </div>
                );
        }
    };

    if (!source || !interaction) {
        return null;
    }

    const dialogTitle =
        interaction.title ||
        sourceErrorCopy?.title ||
        t("flow.title.action_required_with_name", { name: source.name });
    const dialogDescription =
        interaction.description ||
        (isErrorState ? sourceErrorCopy?.description : null) ||
        interaction.message ||
        sourceErrorCopy?.description ||
        (interaction.type === "oauth_start" ||
        interaction.type === "oauth_device_flow"
            ? t("flow.description.oauth")
            : isErrorState
              ? t("flow.description.error_invalid")
              : isSuspendedState
                ? t("flow.description.suspended")
                : t("flow.description.default"));

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
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription>{dialogDescription}</DialogDescription>
                </DialogHeader>

                {isErrorState && (
                    <div className="bg-error/15 text-error text-sm p-3 rounded-md flex items-start gap-2 mt-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                            {sourceErrorCopy?.description ||
                                t("flow.banner.error_invalid")}
                        </div>
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
                    {interaction.type === "confirm" &&
                        networkTrustData?.confirm_kind === "network_trust" && (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void submitTrustDecision("deny")}
                                    disabled={loading}
                                >
                                    {t("flow.network_trust.action.deny")}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void submitTrustDecision("allow_once")}
                                    disabled={loading}
                                >
                                    {t("flow.network_trust.action.allow_once")}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => void submitTrustDecision("allow_always")}
                                    disabled={loading}
                                >
                                    {t("flow.network_trust.action.allow_always")}
                                </Button>
                            </>
                        )}
                    {!(interaction.type === "confirm" &&
                        networkTrustData?.confirm_kind === "network_trust") &&
                        interaction.type !== "oauth_start" &&
                        interaction.type !== "oauth_device_flow" &&
                        interaction.type !== "webview_scrape" && (
                            <Button
                                onClick={handleSubmit}
                                disabled={loading || hasMissingRequiredFields}
                            >
                                {loading
                                    ? t("flow.dialog.submitting")
                                    : t("flow.dialog.submit")}
                            </Button>
                        )}
                    {(interaction.type === "oauth_start" ||
                        interaction.type === "oauth_device_flow" ||
                        interaction.type === "webview_scrape") && (
                        <Button variant="outline" onClick={handleClose}>
                            {t("flow.dialog.close")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
