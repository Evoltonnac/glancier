import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import type {
    DownloadEvent,
    Update as UpdaterUpdate,
} from "@tauri-apps/plugin-updater";
import { api, getApiBaseUrl } from "../api/client";
import type { SystemSettings } from "../api/client";
import type { SystemSettingsUpdateRequest } from "../api/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
import { Progress } from "../components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";
import {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from "../components/ui/tabs";
import {
    Shield,
    MonitorPlay,
    Network,
    ChevronLeft,
    Info,
    Download,
    Sun,
    Moon,
    Monitor,
    Palette,
    Terminal,
    FolderOpen,
    Globe,
    RefreshCw,
} from "lucide-react";
import { TooltipProvider } from "../components/ui/tooltip";
import { useTheme } from "../components/theme-provider";
import { AppHeader } from "../components/AppHeader";
import { useI18n } from "../i18n";
import { isTauri, openExternalLink } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { useStore } from "../store";
import { useSettings } from "../hooks/useSWR";
import { LogoIcon } from "../components/TopNav";

const DEFAULT_SETTINGS: SystemSettings = {
    autostart: false,
    proxy: "",
    encryption_enabled: true,
    debug_logging_enabled: false,
    refresh_interval_minutes: 30,
    scraper_timeout_seconds: 10,
    script_sandbox_enabled: false,
    script_timeout_seconds: 10,
    encryption_available: true,
    theme: "system",
    density: "normal",
    language: "en",
};

const SCRAPER_TIMEOUT_MIN_SECONDS = 1;
const SCRAPER_TIMEOUT_MAX_SECONDS = 300;
const SCRIPT_TIMEOUT_MIN_SECONDS = 1;
const SCRIPT_TIMEOUT_MAX_SECONDS = 120;
const DEFAULT_REFRESH_INTERVAL_MINUTES = 30;
const MIN_REFRESH_INTERVAL_MINUTES = 1;
const MAX_REFRESH_INTERVAL_MINUTES = 7 * 24 * 60;
const BUG_REPORT_URL =
    "https://github.com/Evoltonnac/glanceus/issues/new/choose";

interface RuntimePortInfo {
    api_target_port: number;
    web_mode_port: number | null;
}

type UpdatePhase =
    | "idle"
    | "checking"
    | "downloading"
    | "installing"
    | "restarting"
    | "cancelled";

interface UpdateProgressState {
    phase: UpdatePhase;
    latestVersion: string | null;
    totalBytes: number | null;
    downloadedBytes: number;
    speedBytesPerSecond: number;
}

const INITIAL_UPDATE_PROGRESS: UpdateProgressState = {
    phase: "idle",
    latestVersion: null,
    totalBytes: null,
    downloadedBytes: 0,
    speedBytesPerSecond: 0,
};

function normalizeScraperTimeoutSeconds(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 10;
    }
    return Math.min(
        SCRAPER_TIMEOUT_MAX_SECONDS,
        Math.max(SCRAPER_TIMEOUT_MIN_SECONDS, Math.floor(value)),
    );
}

function normalizeRefreshIntervalMinutes(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return DEFAULT_REFRESH_INTERVAL_MINUTES;
    }
    const normalized = Math.floor(value);
    if (normalized === 0) {
        return 0;
    }
    if (
        normalized < MIN_REFRESH_INTERVAL_MINUTES ||
        normalized > MAX_REFRESH_INTERVAL_MINUTES
    ) {
        return DEFAULT_REFRESH_INTERVAL_MINUTES;
    }
    return normalized;
}

function normalizeScriptTimeoutSeconds(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 10;
    }
    return Math.min(
        SCRIPT_TIMEOUT_MAX_SECONDS,
        Math.max(SCRIPT_TIMEOUT_MIN_SECONDS, Math.floor(value)),
    );
}

function resolvePortFromUrl(rawUrl: string): string | null {
    try {
        const normalized = rawUrl.startsWith("/")
            ? `${window.location.origin}${rawUrl}`
            : rawUrl;
        const parsed = new URL(normalized);
        if (parsed.port) {
            return parsed.port;
        }
        if (parsed.protocol === "http:") return "80";
        if (parsed.protocol === "https:") return "443";
        return null;
    } catch {
        return null;
    }
}

function toUpdatePayload(
    settings: SystemSettings,
): SystemSettingsUpdateRequest {
    const { encryption_available, ...payload } = settings;
    void encryption_available;
    return payload;
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    const decimals = value >= 100 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

export default function SettingsPage() {
    const tauriRuntime = isTauri();
    const navigate = useNavigate();
    const showToast = useStore((state) => state.showToast);
    const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
    const [saving, setSaving] = useState(false);
    const [checkingUpdates, setCheckingUpdates] = useState(false);
    const [cancelUpdateRequested, setCancelUpdateRequested] = useState(false);
    const [updateProgress, setUpdateProgress] = useState<UpdateProgressState>(
        INITIAL_UPDATE_PROGRESS,
    );
    const [openingDevtools, setOpeningDevtools] = useState(false);
    const [openingLogFolder, setOpeningLogFolder] = useState(false);
    const [runtimePortInfo, setRuntimePortInfo] =
        useState<RuntimePortInfo | null>(null);
    const [appVersion, setAppVersion] = useState(
        import.meta.env.VITE_APP_VERSION,
    );
    const activeUpdateRef = useRef<UpdaterUpdate | null>(null);
    const cancelUpdateRequestedRef = useRef(false);
    const downloadStartedAtRef = useRef<number | null>(null);
    const { theme, setTheme } = useTheme();
    const { t, setLocale } = useI18n();
    const refreshIntervalOptions: Array<{ value: number; label: string }> = [
        { value: 0, label: t("settings.refresh.option.off") },
        { value: 5, label: t("settings.refresh.option.5m") },
        { value: 30, label: t("settings.refresh.option.30m") },
        { value: 60, label: t("settings.refresh.option.1h") },
        { value: 1440, label: t("settings.refresh.option.1d") },
    ];

    const loadRuntimePortInfo = async (): Promise<RuntimePortInfo | null> => {
        if (!tauriRuntime) return null;

        let lastInfo: RuntimePortInfo | null = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                const info = await invoke<RuntimePortInfo>(
                    "get_runtime_port_info",
                );
                lastInfo = info;
                if (info.web_mode_port != null || attempt === 4) {
                    return info;
                }
            } catch (error) {
                if (attempt === 4) {
                    console.warn("Failed to read runtime port info:", error);
                    return lastInfo;
                }
            }

            await new Promise((resolve) =>
                setTimeout(resolve, 200 * (attempt + 1)),
            );
        }

        return lastInfo;
    };

    // Use SWR to fetch settings - handles dedup and StrictMode automatically
    const {
        settings: swrSettings,
        isLoading: swrLoading,
        mutateSettings,
    } = useSettings();

    // Load autostart and port info from Tauri (not using SWR as these are Tauri commands)
    const [autostartEnabled, setAutostartEnabled] = useState(false);

    useEffect(() => {
        if (!tauriRuntime) return;

        Promise.all([
            invoke<boolean>("get_autostart").catch(() => false),
            loadRuntimePortInfo(),
        ])
            .then(([autostart, portInfo]) => {
                setAutostartEnabled(autostart);
                if (portInfo) {
                    setRuntimePortInfo(portInfo);
                }
            })
            .catch(console.error);
    }, [tauriRuntime]);

    useEffect(() => {
        if (!tauriRuntime) return;

        let active = true;
        (async () => {
            try {
                const { getVersion } = await import("@tauri-apps/api/app");
                const runtimeVersion = await getVersion();
                if (active && runtimeVersion) {
                    setAppVersion(runtimeVersion);
                }
            } catch (error) {
                console.warn("Failed to load runtime app version:", error);
            }
        })();

        return () => {
            active = false;
        };
    }, [tauriRuntime]);

    // Sync SWR data to state
    useEffect(() => {
        if (swrSettings) {
            setSettings({
                ...swrSettings,
                autostart: autostartEnabled,
                debug_logging_enabled: Boolean(swrSettings.debug_logging_enabled),
                refresh_interval_minutes:
                    typeof swrSettings.refresh_interval_minutes === "number"
                        ? normalizeRefreshIntervalMinutes(
                              swrSettings.refresh_interval_minutes,
                          )
                        : DEFAULT_REFRESH_INTERVAL_MINUTES,
                scraper_timeout_seconds: normalizeScraperTimeoutSeconds(
                    swrSettings.scraper_timeout_seconds,
                ),
                script_sandbox_enabled: Boolean(
                    swrSettings.script_sandbox_enabled,
                ),
                script_timeout_seconds: normalizeScriptTimeoutSeconds(
                    swrSettings.script_timeout_seconds,
                ),
            });
        }
    }, [swrSettings, autostartEnabled]);

    // Loading state combines SWR loading and Tauri loading
    const loading = swrLoading;
    const encryptionAvailable = settings.encryption_available !== false;
    const encryptionStatus = encryptionAvailable
        ? settings.encryption_enabled
            ? t("settings.encryption.key_status.enabled")
            : t("settings.encryption.key_status.disabled")
        : t("settings.encryption.key_status.unavailable");

    const handleSave = async () => {
        setSaving(true);
        let autostartError: unknown = null;

        try {
            // Avoid redundant autostart IPC on Windows where unchanged state can fail.
            if (tauriRuntime && settings.autostart !== autostartEnabled) {
                try {
                    await invoke("set_autostart", { enabled: settings.autostart });
                    setAutostartEnabled(settings.autostart);
                } catch (err) {
                    autostartError = err;
                }
            }

            // Persist backend-owned settings even if autostart command fails.
            const saved = await api.updateSettings(toUpdatePayload(settings));
            setSettings((current) => ({
                ...saved,
                autostart: current.autostart,
            }));
            await mutateSettings(saved, { revalidate: false });
            if (autostartError) {
                showToast(
                    t("settings.toast.autostart_failed", {
                        reason: String(autostartError),
                    }),
                    "error",
                );
            } else {
                showToast(t("settings.toast.saved"));
            }
        } catch (err) {
            console.error("Failed to save settings:", err);
            showToast(
                t("settings.toast.save_failed", { reason: String(err) }),
                "error",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleReportBug = () => {
        openExternalLink(BUG_REPORT_URL);
    };

    const handleCheckUpdates = async () => {
        if (!tauriRuntime || checkingUpdates) return;

        setCancelUpdateRequested(false);
        cancelUpdateRequestedRef.current = false;
        downloadStartedAtRef.current = null;
        setUpdateProgress({
            ...INITIAL_UPDATE_PROGRESS,
            phase: "checking",
        });
        setCheckingUpdates(true);
        showToast(t("settings.toast.check_update_checking"), "info");
        try {
            const { check } = await import("@tauri-apps/plugin-updater");
            const update = await check();
            if (!update) {
                setUpdateProgress(INITIAL_UPDATE_PROGRESS);
                showToast(t("settings.about.up_to_date"), "info");
                return;
            }
            activeUpdateRef.current = update;

            if (cancelUpdateRequestedRef.current) {
                setUpdateProgress((current) => ({
                    ...current,
                    phase: "cancelled",
                    speedBytesPerSecond: 0,
                }));
                showToast(t("settings.toast.check_update_cancelled"), "info");
                return;
            }

            const latestVersion =
                update && typeof update.version === "string"
                    ? update.version
                    : "latest";
            setUpdateProgress((current) => ({
                ...current,
                phase: "downloading",
                latestVersion,
            }));
            showToast(
                t("settings.toast.check_update_available", {
                    version: latestVersion,
                }),
                "info",
            );

            await update.download((event: DownloadEvent) => {
                if (cancelUpdateRequestedRef.current) {
                    return;
                }
                if (event.event === "Started") {
                    downloadStartedAtRef.current = Date.now();
                    setUpdateProgress((current) => ({
                        ...current,
                        totalBytes:
                            typeof event.data.contentLength === "number"
                                ? event.data.contentLength
                                : null,
                        downloadedBytes: 0,
                        speedBytesPerSecond: 0,
                    }));
                    return;
                }
                if (event.event === "Progress") {
                    const now = Date.now();
                    setUpdateProgress((current) => {
                        const downloadedBytes =
                            current.downloadedBytes + event.data.chunkLength;
                        const startedAt = downloadStartedAtRef.current;
                        const elapsedSeconds =
                            startedAt != null ? (now - startedAt) / 1000 : 0;
                        const speedBytesPerSecond =
                            elapsedSeconds > 0
                                ? downloadedBytes / elapsedSeconds
                                : current.speedBytesPerSecond;
                        return {
                            ...current,
                            downloadedBytes,
                            speedBytesPerSecond,
                        };
                    });
                }
            });

            if (cancelUpdateRequestedRef.current) {
                setUpdateProgress((current) => ({
                    ...current,
                    phase: "cancelled",
                    speedBytesPerSecond: 0,
                }));
                showToast(t("settings.toast.check_update_cancelled"), "info");
                return;
            }

            setUpdateProgress((current) => ({
                ...current,
                phase: "installing",
                speedBytesPerSecond: 0,
            }));
            await update.install();

            if (cancelUpdateRequestedRef.current) {
                setUpdateProgress((current) => ({
                    ...current,
                    phase: "cancelled",
                    speedBytesPerSecond: 0,
                }));
                showToast(t("settings.toast.check_update_cancelled"), "info");
                return;
            }

            setUpdateProgress((current) => ({
                ...current,
                phase: "restarting",
                speedBytesPerSecond: 0,
            }));
            showToast(t("settings.toast.check_update_restarting"), "info");
            await invoke("relaunch_app");
        } catch (err) {
            console.error("Failed to check updates:", err);
            setUpdateProgress(INITIAL_UPDATE_PROGRESS);
            showToast(
                t("settings.toast.check_update_failed", {
                    reason: String(err),
                }),
                "error",
            );
        } finally {
            const activeUpdate = activeUpdateRef.current;
            if (activeUpdate) {
                void activeUpdate.close().catch((error) => {
                    console.debug("Failed to release updater resource:", error);
                });
            }
            activeUpdateRef.current = null;
            cancelUpdateRequestedRef.current = false;
            downloadStartedAtRef.current = null;
            setCancelUpdateRequested(false);
            setCheckingUpdates(false);
        }
    };

    const handleCancelUpdate = async () => {
        if (!checkingUpdates || cancelUpdateRequested) return;
        cancelUpdateRequestedRef.current = true;
        setCancelUpdateRequested(true);
        showToast(t("settings.toast.check_update_cancel_requested"), "info");
        const activeUpdate = activeUpdateRef.current;
        if (activeUpdate) {
            try {
                await activeUpdate.close();
            } catch (error) {
                console.debug("Failed to close updater resource:", error);
            }
        }
    };

    const handleOpenWebConsole = async () => {
        if (!tauriRuntime) return;
        setOpeningDevtools(true);
        try {
            await invoke("open_main_devtools");
        } catch (err) {
            console.error("Failed to open web console:", err);
            showToast(
                t("settings.toast.open_console_failed", { reason: String(err) }),
                "error",
            );
        } finally {
            setOpeningDevtools(false);
        }
    };

    const handleOpenLogFolder = async () => {
        if (!tauriRuntime) return;
        setOpeningLogFolder(true);
        try {
            await invoke<string>("open_logs_folder");
        } catch (err) {
            console.error("Failed to open log folder:", err);
            showToast(
                t("settings.toast.open_log_failed", { reason: String(err) }),
                "error",
            );
        } finally {
            setOpeningLogFolder(false);
        }
    };

    const currentPagePort =
        typeof window !== "undefined" ? (window.location.port || null) : null;
    const apiPort =
        runtimePortInfo?.api_target_port != null
            ? String(runtimePortInfo.api_target_port)
            : typeof window !== "undefined"
              ? resolvePortFromUrl(getApiBaseUrl())
              : null;
    const webModePort =
        runtimePortInfo?.web_mode_port != null
            ? String(runtimePortInfo.web_mode_port)
            : currentPagePort;
    const updateProgressPercent =
        typeof updateProgress.totalBytes === "number" && updateProgress.totalBytes > 0
            ? Math.min(
                  100,
                  Math.floor(
                      (updateProgress.downloadedBytes / updateProgress.totalBytes) *
                          100,
                  ),
              )
            : 0;
    const isUpdateProgressVisible =
        tauriRuntime &&
        (updateProgress.phase === "downloading" ||
            updateProgress.phase === "installing" ||
            updateProgress.phase === "restarting" ||
            updateProgress.phase === "cancelled");
    const canCancelUpdate =
        checkingUpdates &&
        updateProgress.phase === "downloading" &&
        !cancelUpdateRequested;
    const updatePhaseLabel =
        updateProgress.phase === "idle"
            ? ""
            : t(`settings.update.phase.${updateProgress.phase}`);
    const downloadedText = formatBytes(updateProgress.downloadedBytes);
    const totalText =
        typeof updateProgress.totalBytes === "number" &&
        updateProgress.totalBytes > 0
            ? formatBytes(updateProgress.totalBytes)
            : null;
    const downloadProgressText = totalText
        ? t("settings.update.progress.with_total", {
              downloaded: downloadedText,
              total: totalText,
              percent: updateProgressPercent,
          })
        : t("settings.update.progress.unknown_total", {
              downloaded: downloadedText,
          });
    const downloadSpeedText =
        updateProgress.phase === "downloading" &&
        updateProgress.speedBytesPerSecond > 0
            ? t("settings.update.speed", {
                  speed: `${formatBytes(updateProgress.speedBytesPerSecond)}/s`,
              })
            : "";

    return (
        <TooltipProvider>
            <div className="flex flex-col h-full bg-transparent text-foreground overflow-hidden">
                {/* Topbar */}
                <AppHeader contentClassName="flex items-center gap-3 w-full">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate("/")}
                            className="h-9 w-9 rounded-full hover:bg-foreground hover:text-background active:scale-95 transition-all text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <h2 className="text-lg font-bold tracking-tight">
                            {t("settings.page.title")}
                        </h2>
                    </div>
                </AppHeader>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <EmptyState
                            icon={
                                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                            }
                            title={t("common.loading.title")}
                            description={t("common.loading.description")}
                        />
                    </div>
                ) : (
                    <Tabs
                        defaultValue="general"
                        className="flex-1 flex flex-col overflow-hidden"
                    >
                        {/* Tab bar - full width background, content aligned with content area */}
                        <div className="w-full px-6 pt-6 pb-2 bg-transparent">
                            <div className="max-w-4xl mx-auto">
                                <TabsList className="w-full h-12 bg-secondary/30 p-1 rounded-full border border-border/50">
                                    <TabsTrigger
                                        value="general"
                                        className="flex-1 h-full rounded-full data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-none transition-all font-medium"
                                    >
                                        {t("settings.tabs.general")}
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="advanced"
                                        className="flex-1 h-full rounded-full data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-none transition-all font-medium"
                                    >
                                        {t("settings.tabs.advanced")}
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="about"
                                        className="flex-1 h-full rounded-full data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-none transition-all font-medium"
                                    >
                                        {t("settings.tabs.about")}
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </div>

                        <main className="flex-1 overflow-y-auto p-6">
                            <div className="max-w-4xl mx-auto w-full">
                                {/* -- General -- */}
                                <TabsContent
                                    value="general"
                                    className="space-y-6 animate-in fade-in duration-300 mt-0"
                                >
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold mb-2">
                                            <Palette className="w-4 h-4 text-brand" />
                                            {t("settings.section.appearance")}
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">
                                                        {t("settings.theme.mode.title")}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.theme.mode.description")}
                                                    </p>
                                                </div>
                                                <Tabs
                                                    value={theme}
                                                    onValueChange={(v) =>
                                                        setTheme(
                                                            v as
                                                                | "light"
                                                                | "dark"
                                                                | "system",
                                                        )
                                                    }
                                                    className="w-full sm:w-[320px]"
                                                >
                                                    <TabsList className="w-full h-10 bg-background p-1 rounded-xl border border-border/50 flex">
                                                        <TabsTrigger
                                                            value="light"
                                                            className="flex-1 h-full rounded-lg data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2 text-xs"
                                                        >
                                                            <Sun className="w-3.5 h-3.5" />
                                                            {t("settings.theme.light")}
                                                        </TabsTrigger>
                                                        <TabsTrigger
                                                            value="dark"
                                                            className="flex-1 h-full rounded-lg data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2 text-xs"
                                                        >
                                                            <Moon className="w-3.5 h-3.5" />
                                                            {t("settings.theme.dark")}
                                                        </TabsTrigger>
                                                        <TabsTrigger
                                                            value="system"
                                                            className="flex-1 h-full rounded-lg data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2 text-xs"
                                                        >
                                                            <Monitor className="w-3.5 h-3.5" />
                                                            {t("settings.theme.system")}
                                                        </TabsTrigger>
                                                    </TabsList>
                                                </Tabs>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold mb-2">
                                            <Globe className="w-4 h-4 text-brand" />
                                            {t("settings.section.language")}
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1 flex-1">
                                                    <Label
                                                        htmlFor="language-select"
                                                        className="text-sm font-medium"
                                                    >
                                                        {t("settings.language.label")}
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.language.description")}
                                                    </p>
                                                </div>
                                                <div className="w-full sm:w-[220px]">
                                                    <Select
                                                        value={settings.language ?? "en"}
                                                        onValueChange={async (value) => {
                                                            const language: "en" | "zh" =
                                                                value === "zh"
                                                                    ? "zh"
                                                                    : "en";
                                                            const newSettings = {
                                                                ...settings,
                                                                language,
                                                            };
                                                            setSettings(newSettings);
                                                            setLocale(language);
                                                            try {
                                                                await api.updateSettings(newSettings);
                                                                showToast(
                                                                    t("settings.toast.language_saved"),
                                                                );
                                                            } catch (err) {
                                                                console.error(
                                                                    "Failed to auto-save language:",
                                                                    err,
                                                                );
                                                                showToast(
                                                                    t(
                                                                        "settings.toast.language_save_failed",
                                                                        {
                                                                            reason: String(err),
                                                                        },
                                                                    ),
                                                                    "error",
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger id="language-select">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="en">
                                                                {t("settings.language.en")}
                                                            </SelectItem>
                                                            <SelectItem value="zh">
                                                                {t("settings.language.zh")}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold mb-2">
                                            <MonitorPlay className="w-4 h-4 text-brand" />
                                            {t("settings.section.windowBehavior")}
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium">
                                                    {t("settings.window.autostart.title")}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {t("settings.window.autostart.description")}
                                                </p>
                                            </div>
                                            <Switch
                                                checked={settings.autostart}
                                                className="data-[state=checked]:bg-brand focus-visible:ring-2 focus-visible:ring-brand/50"
                                                onCheckedChange={async (v) => {
                                                    const newSettings = {
                                                        ...settings,
                                                        autostart: v,
                                                    };
                                                    setSettings(newSettings);
                                                    try {
                                                        await invoke(
                                                            "set_autostart",
                                                            { enabled: v },
                                                        );
                                                        // Trigger auto-save
                                                        await api.updateSettings(
                                                            newSettings,
                                                        );
                                                    } catch (err) {
                                                        console.error(
                                                            "Failed to auto-save autostart:",
                                                            err,
                                                        );
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold mb-2">
                                            <RefreshCw className="w-4 h-4 text-brand" />
                                            {t("settings.section.dataRefresh")}
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1 flex-1">
                                                    <Label
                                                        htmlFor="global-refresh-interval"
                                                        className="text-sm font-medium"
                                                    >
                                                        {t("settings.refresh.global.title")}
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.refresh.global.description")}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {t("settings.refresh.global.hint")}
                                                    </p>
                                                </div>
                                                <div className="w-full sm:w-[180px]">
                                                    <Select
                                                        value={String(
                                                            settings.refresh_interval_minutes,
                                                        )}
                                                        onValueChange={async (value) => {
                                                            const newSettings = {
                                                                ...settings,
                                                                refresh_interval_minutes: Number(
                                                                    value,
                                                                ),
                                                            };
                                                            setSettings(newSettings);
                                                            try {
                                                                await api.updateSettings(newSettings);
                                                            } catch (err) {
                                                                console.error(
                                                                    "Failed to auto-save refresh interval:",
                                                                    err,
                                                                );
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger id="global-refresh-interval">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {refreshIntervalOptions.map(
                                                                (option) => (
                                                                    <SelectItem
                                                                        key={option.value}
                                                                        value={String(
                                                                            option.value,
                                                                        )}
                                                                    >
                                                                        {option.label}
                                                                    </SelectItem>
                                                                ),
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* -- Advanced -- */}
                                <TabsContent
                                    value="advanced"
                                    className="animate-in fade-in duration-300 flex flex-col mt-0 space-y-6"
                                >
                                    {/* -- Proxy Settings -- */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Network className="w-4 h-4 text-brand" />
                                            {t("settings.section.proxy")}
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1 flex-1">
                                                    <Label
                                                        htmlFor="proxy"
                                                        className="text-sm font-medium"
                                                    >
                                                        {t("settings.proxy.label")}
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.proxy.description")}
                                                    </p>
                                                </div>
                                                <Input
                                                    id="proxy"
                                                    placeholder="http://127.0.0.1:7890"
                                                    value={settings.proxy}
                                                    onChange={(e) =>
                                                        setSettings((s) => ({
                                                            ...s,
                                                            proxy: e.target
                                                                .value,
                                                        }))
                                                    }
                                                    className="w-full sm:w-[280px] bg-background"
                                                />
                                            </div>
                                        </div>
                                    </section>

                                    <Separator className="opacity-50" />

                                    {/* -- Scraper Settings -- */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <MonitorPlay className="w-4 h-4 text-brand" />
                                            {t("settings.section.scraper")}
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col gap-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="space-y-1 flex-1">
                                                        <Label
                                                            htmlFor="scraper-timeout"
                                                        className="text-sm font-medium"
                                                    >
                                                        {t("settings.scraper.timeout.label")}
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.scraper.timeout.description")}
                                                    </p>
                                                </div>
                                                    <Input
                                                        id="scraper-timeout"
                                                    type="number"
                                                    min={
                                                        SCRAPER_TIMEOUT_MIN_SECONDS
                                                    }
                                                    max={
                                                        SCRAPER_TIMEOUT_MAX_SECONDS
                                                    }
                                                    step={1}
                                                    value={
                                                        settings.scraper_timeout_seconds
                                                    }
                                                    onChange={(e) => {
                                                        const raw = Number(
                                                            e.target.value,
                                                        );
                                                        setSettings((s) => ({
                                                            ...s,
                                                            scraper_timeout_seconds:
                                                                normalizeScraperTimeoutSeconds(
                                                                    raw,
                                                                ),
                                                        }));
                                                    }}
                                                    className="w-full sm:w-[120px] bg-background text-center font-mono"
                                                />
                                            </div>
                                        </div>
                                        </div>
                                    </section>

                                    <Separator className="opacity-50" />

                                    {/* -- Script Runtime Security -- */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Shield className="w-4 h-4 text-brand" />
                                            {t("settings.section.script_runtime")}
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150 space-y-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <Label
                                                            htmlFor="script-sandbox-enabled"
                                                            className="text-sm font-medium"
                                                        >
                                                            {t("settings.script.sandbox.label")}
                                                        </Label>
                                                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                                            {t("settings.script.sandbox.beta")}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.script.sandbox.description")}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {t("settings.script.sandbox.note")}
                                                    </p>
                                                </div>
                                                <Switch
                                                    id="script-sandbox-enabled"
                                                    checked={
                                                        settings.script_sandbox_enabled
                                                    }
                                                    className="data-[state=checked]:bg-brand focus-visible:ring-2 focus-visible:ring-brand/50"
                                                    onCheckedChange={(value) =>
                                                        setSettings((s) => ({
                                                            ...s,
                                                            script_sandbox_enabled:
                                                                value,
                                                        }))
                                                    }
                                                />
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1 flex-1">
                                                    <Label
                                                        htmlFor="script-timeout"
                                                        className="text-sm font-medium"
                                                    >
                                                        {t("settings.script.timeout.label")}
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.script.timeout.description")}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {t("settings.script.timeout.hint")}
                                                    </p>
                                                </div>
                                                <Input
                                                    id="script-timeout"
                                                    type="number"
                                                    min={SCRIPT_TIMEOUT_MIN_SECONDS}
                                                    max={SCRIPT_TIMEOUT_MAX_SECONDS}
                                                    step={1}
                                                    value={settings.script_timeout_seconds}
                                                    onChange={(e) => {
                                                        const raw = Number(
                                                            e.target.value,
                                                        );
                                                        setSettings((s) => ({
                                                            ...s,
                                                            script_timeout_seconds:
                                                                normalizeScriptTimeoutSeconds(
                                                                    raw,
                                                                ),
                                                        }));
                                                    }}
                                                    className="w-full sm:w-[120px] bg-background text-center font-mono"
                                                />
                                            </div>
                                        </div>
                                    </section>

                                    <Separator className="opacity-50" />

                                    {/* -- Debug Logging -- */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Info className="w-4 h-4 text-brand" />
                                            {t("settings.section.debug")}
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">
                                                        {t("settings.debug.enabled.label")}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.debug.enabled.description")}
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={
                                                        settings.debug_logging_enabled
                                                    }
                                                    className="data-[state=checked]:bg-brand focus-visible:ring-2 focus-visible:ring-brand/50"
                                                    onCheckedChange={(v) =>
                                                        setSettings((s) => ({
                                                            ...s,
                                                            debug_logging_enabled:
                                                                v,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="pt-2 flex flex-wrap items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={
                                                        handleOpenWebConsole
                                                    }
                                                    disabled={
                                                        !tauriRuntime ||
                                                        !settings.debug_logging_enabled ||
                                                        openingDevtools
                                                    }
                                                    className="gap-2 rounded-lg text-xs"
                                                >
                                                    <Terminal className="w-3.5 h-3.5" />
                                                    {openingDevtools
                                                        ? t("settings.button.opening")
                                                        : t("settings.button.open_console")}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={
                                                        handleOpenLogFolder
                                                    }
                                                    disabled={
                                                        !tauriRuntime ||
                                                        openingLogFolder
                                                    }
                                                    className="gap-2 rounded-lg text-xs"
                                                >
                                                    <FolderOpen className="w-3.5 h-3.5" />
                                                    {openingLogFolder
                                                        ? t("settings.button.opening")
                                                        : t("settings.button.open_log_folder")}
                                                </Button>
                                            </div>
                                        </div>
                                    </section>

                                    <Separator className="opacity-50" />

                                    {/* -- Network Ports -- */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Network className="w-4 h-4 text-brand" />
                                            {t("settings.section.network")}
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="grid grid-cols-2 gap-8">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                                                        {t("settings.network.api")}
                                                    </span>
                                                    <code className="block font-mono text-sm text-brand">
                                                        {apiPort || t("common.unknown")}
                                                    </code>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                                                        {t("settings.network.web")}
                                                    </span>
                                                    <code className="block font-mono text-sm text-brand">
                                                        {webModePort || t("common.unknown")}
                                                    </code>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <Separator className="opacity-50" />

                                    {/* -- Encryption -- */}
                                    <section className="space-y-4 pb-8">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Shield className="w-4 h-4 text-brand" />
                                            {t("settings.section.encryption")}
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">
                                                        {t("settings.encryption.local.label")}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t("settings.encryption.local.description")}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {encryptionStatus}
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={
                                                        settings.encryption_enabled
                                                    }
                                                    className="data-[state=checked]:bg-brand focus-visible:ring-2 focus-visible:ring-brand/50"
                                                    onCheckedChange={(v) => {
                                                        if (v && !encryptionAvailable) {
                                                            showToast(
                                                                t(
                                                                    "settings.encryption.retry_hint",
                                                                ),
                                                                "info",
                                                            );
                                                        }
                                                        setSettings((s) => ({
                                                            ...s,
                                                            encryption_enabled:
                                                                v,
                                                        }));
                                                    }}
                                                />
                                            </div>
                                            {!encryptionAvailable && (
                                                <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                                                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                    <p>{t("settings.encryption.retry_hint")}</p>
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </TabsContent>

                                {/* -- About -- */}
                                <TabsContent
                                    value="about"
                                    className="animate-in fade-in duration-300 mt-0"
                                >
                                    <div className="flex flex-col items-center justify-center py-16 space-y-6">
                                        <div className="flex items-center justify-center p-4 bg-background/80 backdrop-blur-md rounded-2xl border border-border/50">
                                            <LogoIcon className="w-16 h-16" />
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h1 className="text-3xl font-bold tracking-tight">
                                                Glanceus
                                            </h1>
                                            <p className="text-muted-foreground">
                                                {t("settings.about.tagline")}
                                            </p>
                                            <p className="text-sm font-mono text-muted-foreground/60 pt-2">
                                                Version {appVersion}
                                            </p>
                                        </div>

                                        <div className="pt-8">
                                            <div className="flex flex-wrap items-center justify-center gap-3">
                                                <Button
                                                    variant="outline"
                                                    className="rounded-full px-6 gap-2 hover:bg-foreground hover:text-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                                    onClick={
                                                        handleCheckUpdates
                                                    }
                                                    disabled={
                                                        !tauriRuntime ||
                                                        checkingUpdates
                                                    }
                                                >
                                                    <Download
                                                        className={`w-4 h-4 ${checkingUpdates ? "animate-spin" : ""}`}
                                                    />
                                                    {checkingUpdates
                                                        ? t(
                                                              "settings.button.checking_update",
                                                          )
                                                        : t(
                                                              "settings.button.check_update",
                                                          )}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="rounded-full px-6 hover:bg-foreground hover:text-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                                    onClick={handleReportBug}
                                                >
                                                    Report Bug
                                                </Button>
                                            </div>
                                            {isUpdateProgressVisible && (
                                                <div className="mt-4 w-full max-w-xl rounded-2xl border border-border/70 bg-surface/80 p-4 space-y-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <p className="text-sm font-medium">
                                                            {updatePhaseLabel}
                                                        </p>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 px-3 rounded-full"
                                                            onClick={
                                                                handleCancelUpdate
                                                            }
                                                            disabled={
                                                                !canCancelUpdate
                                                            }
                                                        >
                                                            {cancelUpdateRequested
                                                                ? t(
                                                                      "settings.button.cancelling_update",
                                                                  )
                                                                : t(
                                                                      "settings.button.cancel_update",
                                                                  )}
                                                        </Button>
                                                    </div>
                                                    <Progress
                                                        value={
                                                            updateProgressPercent
                                                        }
                                                        className="h-2"
                                                    />
                                                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                                        <span>
                                                            {downloadProgressText}
                                                        </span>
                                                        {downloadSpeedText && (
                                                            <span>
                                                                {
                                                                    downloadSpeedText
                                                                }
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TabsContent>
                            </div>
                        </main>

                        {/* Save button - fixed at bottom, full width (only shown in Advanced tab) */}
                        <TabsContent
                            value="advanced"
                            className="mt-0 flex-shrink-0"
                        >
                            <div className="w-full px-6 py-4 border-t border-border/50 bg-background/80 backdrop-blur-sm">
                                <div className="max-w-4xl mx-auto flex justify-end">
                                    <Button
                                        onClick={handleSave}
                                        disabled={saving || loading}
                                        className="px-8 bg-brand hover:bg-foreground hover:text-background text-primary-foreground rounded-full transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                    >
                                        {saving
                                            ? t("common.saving")
                                            : t("settings.button.save_advanced")}
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </TooltipProvider>
    );
}
