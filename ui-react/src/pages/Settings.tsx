import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { api, getApiBaseUrl } from "../api/client";
import type { SystemSettings } from "../api/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
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
    Copy,
    Check,
    ChevronLeft,
    Info,
    Download,
    Sun,
    Moon,
    Monitor,
    Palette,
    Terminal,
    FolderOpen,
    RefreshCw,
} from "lucide-react";
import { TooltipProvider } from "../components/ui/tooltip";
import { useTheme } from "../components/theme-provider";
import { AppHeader } from "../components/AppHeader";
import { isTauri, openExternalLink } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { useStore } from "../store";
import { useSettings } from "../hooks/useSWR";
import logoMark from "../assets/logo.svg";

const DEFAULT_SETTINGS: SystemSettings = {
    autostart: false,
    proxy: "",
    encryption_enabled: false,
    debug_logging_enabled: false,
    refresh_interval_minutes: 0,
    scraper_timeout_seconds: 10,
    master_key: null,
    theme: "system",
    density: "normal",
};

const REFRESH_INTERVAL_OPTIONS: Array<{ value: number; label: string }> = [
    { value: 0, label: "关闭自动刷新" },
    { value: 5, label: "5 分钟" },
    { value: 15, label: "15 分钟" },
    { value: 30, label: "30 分钟" },
    { value: 60, label: "1 小时" },
    { value: 180, label: "3 小时" },
];

const SCRAPER_TIMEOUT_MIN_SECONDS = 1;
const SCRAPER_TIMEOUT_MAX_SECONDS = 300;
const BUG_REPORT_URL =
    "https://github.com/Evoltonnac/glancier/issues/new/choose";

interface RuntimePortInfo {
    api_target_port: number;
    web_mode_port: number | null;
}

function normalizeScraperTimeoutSeconds(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 10;
    }
    return Math.min(
        SCRAPER_TIMEOUT_MAX_SECONDS,
        Math.max(SCRAPER_TIMEOUT_MIN_SECONDS, Math.floor(value)),
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

export default function SettingsPage() {
    const tauriRuntime = isTauri();
    const navigate = useNavigate();
    const showToast = useStore((state) => state.showToast);
    const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
    const [saving, setSaving] = useState(false);
    const [openingDevtools, setOpeningDevtools] = useState(false);
    const [openingLogFolder, setOpeningLogFolder] = useState(false);
    const [runtimePortInfo, setRuntimePortInfo] =
        useState<RuntimePortInfo | null>(null);
    const [masterKeyDisplay, setMasterKeyDisplay] = useState<string | null>(
        null,
    );
    const [importKeyValue, setImportKeyValue] = useState("");
    const [showImport, setShowImport] = useState(false);
    const [copied, setCopied] = useState(false);
    const { theme, setTheme } = useTheme();

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
                    console.warn("读取运行时端口信息失败:", error);
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
    const { settings: swrSettings, isLoading: swrLoading } = useSettings();

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

    // Sync SWR data to state
    useEffect(() => {
        if (swrSettings) {
            setSettings({
                ...swrSettings,
                autostart: autostartEnabled,
                debug_logging_enabled: Boolean(swrSettings.debug_logging_enabled),
                refresh_interval_minutes:
                    typeof swrSettings.refresh_interval_minutes === "number"
                        ? swrSettings.refresh_interval_minutes
                        : 0,
                scraper_timeout_seconds: normalizeScraperTimeoutSeconds(
                    swrSettings.scraper_timeout_seconds,
                ),
            });
        }
    }, [swrSettings, autostartEnabled]);

    // Loading state combines SWR loading and Tauri loading
    const loading = swrLoading;

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Handle autostart via Tauri command (must use Tauri, not http API)
            await invoke("set_autostart", { enabled: settings.autostart });

            // 2. Save proxy & encryption settings to Python backend
            await api.updateSettings(settings);
            showToast("设置已保存");
        } catch (err) {
            console.error("保存设置失败:", err);
            showToast("保存设置失败：" + err, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleExportKey = async () => {
        try {
            const { master_key } = await api.exportMasterKey();
            setMasterKeyDisplay(master_key);
        } catch (err) {
            console.error(err);
        }
    };

    const handleImportKey = async () => {
        if (!importKeyValue.trim()) return;
        try {
            await api.importMasterKey(importKeyValue.trim());
            setImportKeyValue("");
            setShowImport(false);
            showToast("主密钥导入成功！");
        } catch (err) {
            console.error(err);
            showToast("导入失败：" + err, "error");
        }
    };

    const handleCopy = async () => {
        if (!masterKeyDisplay) return;
        await navigator.clipboard.writeText(masterKeyDisplay);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReportBug = () => {
        openExternalLink(BUG_REPORT_URL);
    };

    const handleOpenWebConsole = async () => {
        if (!tauriRuntime) return;
        setOpeningDevtools(true);
        try {
            await invoke("open_main_devtools");
        } catch (err) {
            console.error("打开网页控制台失败:", err);
            showToast("打开网页控制台失败：" + err, "error");
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
            console.error("打开日志文件夹失败:", err);
            showToast("打开日志文件夹失败：" + err, "error");
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
    const appVersion = "0.1.0"; // Consider fetching from Tauri API in the future

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
                            设置
                        </h2>
                    </div>
                </AppHeader>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <EmptyState
                            icon={
                                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                            }
                            title="加载中..."
                            description="正在获取系统配置"
                        />
                    </div>
                ) : (
                    <Tabs
                        defaultValue="general"
                        className="flex-1 flex flex-col overflow-hidden"
                    >
                        {/* Tab 切换栏 - 背景撑满页面，内容与内容区对齐 */}
                        <div className="w-full px-6 pt-6 pb-2 bg-transparent">
                            <div className="max-w-4xl mx-auto">
                                <TabsList className="w-full h-12 bg-secondary/30 p-1 rounded-full border border-border/50">
                                    <TabsTrigger
                                        value="general"
                                        className="flex-1 h-full rounded-full data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-none transition-all font-medium"
                                    >
                                        通用
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="advanced"
                                        className="flex-1 h-full rounded-full data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-none transition-all font-medium"
                                    >
                                        高级
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="about"
                                        className="flex-1 h-full rounded-full data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-none transition-all font-medium"
                                    >
                                        关于
                                    </TabsTrigger>
                                </TabsList>
                            </div>
                        </div>

                        <main className="flex-1 overflow-y-auto p-6">
                            <div className="max-w-4xl mx-auto w-full">
                                {/* ── 通用 (General) ── */}
                                <TabsContent
                                    value="general"
                                    className="space-y-6 animate-in fade-in duration-300 mt-0"
                                >
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold mb-2">
                                            <Palette className="w-4 h-4 text-brand" />
                                            外观主题
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">
                                                        主题模式
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        选择应用的外观主题，立即生效。
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
                                                            浅色
                                                        </TabsTrigger>
                                                        <TabsTrigger
                                                            value="dark"
                                                            className="flex-1 h-full rounded-lg data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2 text-xs"
                                                        >
                                                            <Moon className="w-3.5 h-3.5" />
                                                            深色
                                                        </TabsTrigger>
                                                        <TabsTrigger
                                                            value="system"
                                                            className="flex-1 h-full rounded-lg data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2 text-xs"
                                                        >
                                                            <Monitor className="w-3.5 h-3.5" />
                                                            系统
                                                        </TabsTrigger>
                                                    </TabsList>
                                                </Tabs>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold mb-2">
                                            <MonitorPlay className="w-4 h-4 text-brand" />
                                            窗口行为
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="space-y-1">
                                                <p className="text-sm font-medium">
                                                    开机自启
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    随系统启动自动运行 Glancier
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
                                            数据刷新
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1 flex-1">
                                                    <Label
                                                        htmlFor="global-refresh-interval"
                                                        className="text-sm font-medium"
                                                    >
                                                        全局自动刷新
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">
                                                        默认刷新间隔。source 或 integration 可单独覆盖。
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
                                                            {REFRESH_INTERVAL_OPTIONS.map(
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

                                {/* ── 高级 (Advanced) ── */}
                                <TabsContent
                                    value="advanced"
                                    className="animate-in fade-in duration-300 flex flex-col mt-0 space-y-6"
                                >
                                    {/* ── 代理设置 ── */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Network className="w-4 h-4 text-brand" />
                                            代理设置
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1 flex-1">
                                                    <Label
                                                        htmlFor="proxy"
                                                        className="text-sm font-medium"
                                                    >
                                                        HTTP/HTTPS 代理
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">
                                                        适用于 Python 后端 HTTP
                                                        请求。留空表示不使用。
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

                                    {/* ── 抓取设置 ── */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <MonitorPlay className="w-4 h-4 text-brand" />
                                            抓取设置
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="flex flex-col gap-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                    <div className="space-y-1 flex-1">
                                                        <Label
                                                            htmlFor="scraper-timeout"
                                                        className="text-sm font-medium"
                                                    >
                                                        抓取超时 (秒)
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground">
                                                        默认 10
                                                        秒。超时后任务会自动跳过。
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

                                    {/* ── 调试日志 ── */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Info className="w-4 h-4 text-brand" />
                                            调试日志
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">
                                                        启用详细日志
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        记录更多调试信息，建议仅在排障时启用。
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
                                                        ? "打开中..."
                                                        : "打开网页控制台"}
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
                                                        ? "打开中..."
                                                        : "打开日志文件夹"}
                                                </Button>
                                            </div>
                                        </div>
                                    </section>

                                    <Separator className="opacity-50" />

                                    {/* ── 端口占用 ── */}
                                    <section className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Network className="w-4 h-4 text-brand" />
                                            网络端口
                                        </div>
                                        <div className="rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                            <div className="grid grid-cols-2 gap-8">
                                                <div className="space-y-1">
                                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                                                        API 服务
                                                    </span>
                                                    <code className="block font-mono text-sm text-brand">
                                                        {apiPort || "未知"}
                                                    </code>
                                                </div>
                                                <div className="space-y-1">
                                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                                                        WEB 服务
                                                    </span>
                                                    <code className="block font-mono text-sm text-brand">
                                                        {webModePort || "未知"}
                                                    </code>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <Separator className="opacity-50" />

                                    {/* ── 密钥加密 ── */}
                                    <section className="space-y-4 pb-8">
                                        <div className="flex items-center gap-2 text-base font-semibold">
                                            <Shield className="w-4 h-4 text-brand" />
                                            数据加密
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium">
                                                        本地 AES-256 加密
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        加密存储 API Key
                                                        等敏感凭证。
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={
                                                        settings.encryption_enabled
                                                    }
                                                    className="data-[state=checked]:bg-brand focus-visible:ring-2 focus-visible:ring-brand/50"
                                                    onCheckedChange={(v) =>
                                                        setSettings((s) => ({
                                                            ...s,
                                                            encryption_enabled:
                                                                v,
                                                        }))
                                                    }
                                                />
                                            </div>

                                            {settings.encryption_enabled && (
                                                <div className="rounded-xl border border-brand/20 px-5 py-5 space-y-4 bg-brand/5 animate-in slide-in-from-top-2 duration-300">
                                                    <div className="flex items-start gap-3">
                                                        <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                                                        <p className="text-xs text-foreground/80 leading-relaxed">
                                                            <strong>
                                                                多端同步：
                                                            </strong>{" "}
                                                            先在此设备导出通行码，再在目标设备导入，两台设备便可共享解密能力。
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={
                                                                handleExportKey
                                                            }
                                                            className="bg-background text-xs h-8 rounded-lg"
                                                        >
                                                            导出通行码
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                setShowImport(
                                                                    (v) => !v,
                                                                )
                                                            }
                                                            className="bg-background text-xs h-8 rounded-lg"
                                                        >
                                                            导入通行码
                                                        </Button>
                                                    </div>

                                                    {masterKeyDisplay && (
                                                        <div className="flex items-center gap-2 bg-background rounded-lg border border-border/50 p-2.5 mt-2">
                                                            <code className="text-[11px] flex-1 break-all font-mono text-brand font-medium">
                                                                {
                                                                    masterKeyDisplay
                                                                }
                                                            </code>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 shrink-0 hover:bg-secondary rounded-md"
                                                                onClick={
                                                                    handleCopy
                                                                }
                                                            >
                                                                {copied ? (
                                                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                                                ) : (
                                                                    <Copy className="w-3.5 h-3.5" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    )}

                                                    {showImport && (
                                                        <div className="flex gap-2 mt-2 pt-4 border-t border-brand/10">
                                                            <Input
                                                                placeholder="粘贴通行码..."
                                                                value={
                                                                    importKeyValue
                                                                }
                                                                onChange={(e) =>
                                                                    setImportKeyValue(
                                                                        e.target
                                                                            .value,
                                                                    )
                                                                }
                                                                className="h-9 text-sm bg-background"
                                                            />
                                                            <Button
                                                                size="sm"
                                                                onClick={
                                                                    handleImportKey
                                                                }
                                                                disabled={
                                                                    !importKeyValue.trim()
                                                                }
                                                                className="h-9 px-4 rounded-lg"
                                                            >
                                                                确认导入
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </TabsContent>

                                {/* ── 关于 (About) ── */}
                                <TabsContent
                                    value="about"
                                    className="animate-in fade-in duration-300 mt-0"
                                >
                                    <div className="flex flex-col items-center justify-center py-16 space-y-6">
                                        <div className="w-24 h-24 bg-brand rounded-[2rem] flex items-center justify-center shadow-lg shadow-brand/20">
                                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 p-[1px]">
                                                <img
                                                    src={logoMark}
                                                    alt="Glancier"
                                                    className="h-8 w-8 object-contain brightness-0 invert"
                                                />
                                            </div>
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h1 className="text-3xl font-bold tracking-tight">
                                                Glancier
                                            </h1>
                                            <p className="text-muted-foreground">
                                                个人数据聚合与监控看板
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
                                                    onClick={() =>
                                                        showToast(
                                                            "当前已是最新版本",
                                                            "info",
                                                        )
                                                    }
                                                >
                                                    <Download className="w-4 h-4" />
                                                    检查更新
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="rounded-full px-6 hover:bg-foreground hover:text-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                                    onClick={handleReportBug}
                                                >
                                                    Report Bug
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>
                            </div>
                        </main>

                        {/* 保存按钮 - 固定底部，撑满宽度（仅高级tab显示） */}
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
                                        {saving ? "保存中..." : "保存高级设置"}
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
