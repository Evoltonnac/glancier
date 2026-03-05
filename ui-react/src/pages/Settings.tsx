import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { api, SystemSettings } from "../api/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
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
} from "lucide-react";
import { TooltipProvider } from "../components/ui/tooltip";
import { useTheme } from "../components/theme-provider";

const DEFAULT_SETTINGS: SystemSettings = {
    autostart: false,
    proxy: "",
    encryption_enabled: false,
    master_key: null,
};

export default function SettingsPage() {
    const navigate = useNavigate();
    const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [masterKeyDisplay, setMasterKeyDisplay] = useState<string | null>(
        null,
    );
    const [importKeyValue, setImportKeyValue] = useState("");
    const [showImport, setShowImport] = useState(false);
    const [copied, setCopied] = useState(false);
    const { theme, setTheme } = useTheme();

    // Load current settings from backend
    useEffect(() => {
        setLoading(true);
        Promise.all([
            api.getSettings(),
            invoke<boolean>("get_autostart").catch(() => false),
        ])
            .then(([s, autostartEnabled]) => {
                setSettings({ ...s, autostart: autostartEnabled });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Handle autostart via Tauri command (must use Tauri, not http API)
            await invoke("set_autostart", { enabled: settings.autostart });

            // 2. Save proxy & encryption settings to Python backend
            await api.updateSettings(settings);
            alert("设置已保存");
        } catch (err) {
            console.error("保存设置失败:", err);
            alert("保存设置失败：" + err);
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
            alert("主密钥导入成功！");
        } catch (err) {
            console.error(err);
            alert("导入失败：" + err);
        }
    };

    const handleCopy = async () => {
        if (!masterKeyDisplay) return;
        await navigator.clipboard.writeText(masterKeyDisplay);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const appVersion = "0.1.0"; // Consider fetching from Tauri API in the future

    return (
        <TooltipProvider>
            <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
                {/* Topbar */}
                <header className="flex-shrink-0 border-b border-border px-6 py-3 bg-background flex items-center gap-3 z-50">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate("/")}
                        className="h-9 w-9 rounded-full hover:bg-secondary focus:bg-secondary active:scale-95 transition-all text-muted-foreground hover:text-foreground"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                    <h2 className="text-lg font-bold tracking-tight">设置</h2>
                </header>

                <main className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-4xl mx-auto w-full flex flex-col h-full">
                        {loading ? (
                            <div className="py-12 text-center text-muted-foreground">
                                加载中...
                            </div>
                        ) : (
                            <Tabs defaultValue="general" className="w-full">
                                <TabsList className="w-full h-12 bg-secondary/30 p-1 mb-8 rounded-full border border-border/50">
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

                                {/* ── 通用 (General) ── */}
                                <TabsContent
                                    value="general"
                                    className="space-y-6 animate-in fade-in duration-300"
                                >
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold mb-2">
                                            <Palette className="w-4 h-4 text-brand" />
                                            外观主题
                                        </div>
                                        <div className="space-y-4 rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 transition-colors">
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">
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
                                                className="w-full"
                                            >
                                                <TabsList className="w-full h-11 bg-background p-1 rounded-xl border border-border/50 flex">
                                                    <TabsTrigger
                                                        value="light"
                                                        className="flex-1 h-full rounded-lg data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2"
                                                    >
                                                        <Sun className="w-4 h-4" />
                                                        浅色
                                                    </TabsTrigger>
                                                    <TabsTrigger
                                                        value="dark"
                                                        className="flex-1 h-full rounded-lg data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2"
                                                    >
                                                        <Moon className="w-4 h-4" />
                                                        深色
                                                    </TabsTrigger>
                                                    <TabsTrigger
                                                        value="system"
                                                        className="flex-1 h-full rounded-lg data-[state=active]:bg-brand data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-2"
                                                    >
                                                        <Monitor className="w-4 h-4" />
                                                        跟随系统
                                                    </TabsTrigger>
                                                </TabsList>
                                            </Tabs>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-base font-semibold mb-2">
                                            <MonitorPlay className="w-4 h-4 text-brand" />
                                            窗口行为
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-border px-5 py-4 bg-surface hover:border-foreground/20 transition-colors">
                                            <div>
                                                <p className="text-sm font-medium">
                                                    开机自启
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    随系统启动自动运行 Quota
                                                    Board
                                                </p>
                                            </div>
                                            <Switch
                                                checked={settings.autostart}
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
                                </TabsContent>

                                {/* ── 高级 (Advanced) ── */}
                                <TabsContent
                                    value="advanced"
                                    className="space-y-6 animate-in fade-in duration-300"
                                >
                                    <div className="space-y-6">
                                        {/* ── 代理设置 ── */}
                                        <section className="space-y-4">
                                            <div className="flex items-center gap-2 text-base font-semibold">
                                                <Network className="w-5 h-5 text-primary" />
                                                代理设置
                                            </div>
                                            <div className="space-y-3 rounded-lg border border-border px-5 py-4 bg-background">
                                                <div>
                                                    <Label
                                                        htmlFor="proxy"
                                                        className="text-sm font-medium"
                                                    >
                                                        HTTP/HTTPS 代理地址
                                                    </Label>
                                                    <p className="text-xs text-muted-foreground mt-1 mb-3">
                                                        适用于 Python 后端 HTTP
                                                        请求。Rust/WebView
                                                        端可在系统代理中配置。（留空表示不使用代理）
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
                                                    className="max-w-md"
                                                />
                                            </div>
                                        </section>

                                        <Separator />

                                        {/* ── 密钥加密 ── */}
                                        <section className="space-y-4">
                                            <div className="flex items-center gap-2 text-base font-semibold">
                                                <Shield className="w-5 h-5 text-primary" />
                                                密钥加密
                                            </div>
                                            <div className="flex items-center justify-between rounded-lg border border-border px-5 py-4 bg-background">
                                                <div>
                                                    <p className="text-sm font-medium">
                                                        本地 AES-256 加密存储
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-1 max-w-[80%]">
                                                        开启后，secrets.json
                                                        中的 API Key
                                                        等凭证将被加密保存。
                                                        切换开关会自动完成全量迁移。
                                                    </p>
                                                </div>
                                                <Switch
                                                    checked={
                                                        settings.encryption_enabled
                                                    }
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
                                                <div className="rounded-xl border border-brand/20 px-5 py-4 space-y-4 bg-brand/5">
                                                    <p className="text-sm text-foreground">
                                                        <strong>
                                                            多端同步：
                                                        </strong>{" "}
                                                        先在此设备导出通行码，再在目标设备导入，两台设备便可共享解密能力。
                                                    </p>
                                                    <div className="flex gap-3">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={
                                                                handleExportKey
                                                            }
                                                            className="bg-background"
                                                        >
                                                            导出同步通行码
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() =>
                                                                setShowImport(
                                                                    (v) => !v,
                                                                )
                                                            }
                                                            className="bg-background"
                                                        >
                                                            导入通行码
                                                        </Button>
                                                    </div>

                                                    {masterKeyDisplay && (
                                                        <div className="flex items-center gap-2 bg-background rounded-md border border-border/50 p-3 mt-4">
                                                            <code className="text-sm flex-1 break-all font-mono text-brand">
                                                                {
                                                                    masterKeyDisplay
                                                                }
                                                            </code>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="shrink-0 hover:bg-secondary"
                                                                onClick={
                                                                    handleCopy
                                                                }
                                                            >
                                                                {copied ? (
                                                                    <Check className="w-4 h-4 text-green-500" />
                                                                ) : (
                                                                    <Copy className="w-4 h-4" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    )}

                                                    {showImport && (
                                                        <div className="flex gap-2 mt-4 pt-4 border-t border-border/10">
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
                                                                className="max-w-md bg-background"
                                                            />
                                                            <Button
                                                                onClick={
                                                                    handleImportKey
                                                                }
                                                                disabled={
                                                                    !importKeyValue.trim()
                                                                }
                                                            >
                                                                确认导入
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </section>

                                        <div className="flex justify-end pt-4">
                                            <Button
                                                onClick={handleSave}
                                                disabled={saving || loading}
                                                className="px-8 bg-brand hover:bg-brand/90 text-primary-foreground rounded-full"
                                            >
                                                {saving
                                                    ? "保存中..."
                                                    : "保存高级设置"}
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* ── 关于 (About) ── */}
                                <TabsContent
                                    value="about"
                                    className="animate-in fade-in duration-300"
                                >
                                    <div className="flex flex-col items-center justify-center py-16 space-y-6">
                                        <div className="w-24 h-24 bg-brand rounded-3xl flex items-center justify-center">
                                            <Info className="w-12 h-12 text-primary-foreground" />
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h1 className="text-3xl font-bold tracking-tight">
                                                Quota Board
                                            </h1>
                                            <p className="text-muted-foreground">
                                                个人配额与资源看板
                                            </p>
                                            <p className="text-sm font-mono text-muted-foreground/80 pt-2">
                                                Version {appVersion}
                                            </p>
                                        </div>

                                        <div className="pt-8">
                                            <Button
                                                variant="outline"
                                                className="rounded-full px-6 gap-2"
                                                onClick={() =>
                                                    alert("当前已是最新版本")
                                                }
                                            >
                                                <Download className="w-4 h-4" />
                                                检查更新
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        )}
                    </div>
                </main>
            </div>
        </TooltipProvider>
    );
}
