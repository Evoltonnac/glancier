import { useState } from "react";
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
import { AlertCircle, ExternalLink, Wrench } from "lucide-react";
import { api } from "../../api/client";

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

export function FlowHandler({
    source,
    isOpen,
    onClose,
    onInteractSuccess,
    onPushToQueue,
}: FlowHandlerProps) {
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!source || !source.interaction) {
        return null;
    }

    const { interaction } = source;
    const isErrorState = source.status === "error";
    const isSuspendedState = source.status === "suspended";

    const handleInputChange = (key: string, value: string) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    const handleSubmit = async () => {
        if (!source) return;
        setLoading(true);
        setError(null);
        try {
            await api.interact(source.id, formData);
            onInteractSuccess?.();
            onClose();
        } catch (err: any) {
            setError(err.message || "Interaction failed");
        } finally {
            setLoading(false);
        }
    };

    const handleOAuthStart = async () => {
        if (!source) return;
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
                onClose();
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

            // 3. Open Popup
            const width = 600;
            const height = 700;
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;

            window.open(
                res.authorize_url,
                "oauth_window",
                `width=${width},height=${height},top=${top},left=${left},resizable,scrollbars,status`,
            );
        } catch (err: any) {
            setError(err.message || "Failed to start OAuth flow");
            setLoading(false);
            channel.close();
        }
    };

    const renderContent = () => {
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
                        {interaction.fields &&
                            interaction.fields.length > 0 && (
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

            case "confirm":
                return (
                    <div className="py-4 text-sm text-center">
                        Please confirm to proceed with {source.name}.
                    </div>
                );

            case "webview_scrape":
                return (
                    <div className="py-6 flex flex-col items-center justify-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                            <Wrench className="w-6 h-6 text-warning" />
                        </div>
                        <div className="text-sm text-muted-foreground text-center">
                            <p className="font-medium text-foreground mb-1">
                                需要手动继续 Web 抓取
                            </p>
                            <p>点击下方按钮将 WebView 以前台模式启动。</p>
                            <p className="mt-1">
                                你可以在窗口中登录或通过验证码，完成后将自动继续执行。
                            </p>
                        </div>
                        <Button
                            onClick={() => {
                                if (!source || !onPushToQueue) return;
                                const added = onPushToQueue(source, {
                                    foreground: true,
                                });
                                if (added) {
                                    onClose();
                                }
                            }}
                            className="w-full"
                        >
                            前台手动启动
                        </Button>
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

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>
                        {interaction.message ||
                            `Action Required: ${source.name}`}
                    </DialogTitle>
                    <DialogDescription>
                        {interaction.type === "oauth_start"
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
                        interaction.type !== "webview_scrape" && (
                            <Button onClick={handleSubmit} disabled={loading}>
                                {loading ? "Submitting..." : "Submit"}
                            </Button>
                        )}
                    {(interaction.type === "oauth_start" ||
                        interaction.type === "webview_scrape") && (
                        <Button variant="outline" onClick={onClose}>
                            关闭
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
