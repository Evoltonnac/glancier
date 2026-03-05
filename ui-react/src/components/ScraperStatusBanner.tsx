import { useState } from "react";
import {
    ExternalLink,
    SkipForward,
    XCircle,
    Activity,
    ChevronRight,
} from "lucide-react";
import { cn } from "../lib/utils";

export interface ScraperStatusBannerProps {
    activeScraperName: string | null;
    queueLength: number;
    onShowWindow: () => void;
    onSkip: () => void;
    onClearQueue: () => void;
}

export function ScraperStatusBanner({
    activeScraperName,
    queueLength,
    onShowWindow,
    onSkip,
    onClearQueue,
}: ScraperStatusBannerProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!activeScraperName && queueLength === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex items-end justify-end pointer-events-none">
            <div
                className={cn(
                    "bg-surface border border-border shadow-soft-elevation rounded-full flex items-center p-1.5 pointer-events-auto transition-all overflow-hidden",
                    // Custom easing inspired by refined UI guidelines
                    "duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    isExpanded
                        ? "max-w-[800px] pl-3"
                        : "max-w-[72px] cursor-pointer hover:bg-surface/80",
                )}
                onClick={() => {
                    if (!isExpanded) setIsExpanded(true);
                }}
            >
                {/* ---------- COLLAPSED CONTENT ---------- */}
                {!isExpanded && (
                    <div className="flex items-center justify-center w-full gap-2 px-2 py-0.5">
                        <Activity className="h-4 w-4 text-brand animate-pulse" />
                        {queueLength > 0 && (
                            <span className="text-xs font-semibold tabular-nums text-foreground">
                                {queueLength}
                            </span>
                        )}
                    </div>
                )}

                {/* ---------- EXPANDED CONTENT ---------- */}
                {isExpanded && (
                    <>
                        <div className="flex items-center gap-2.5 shrink-0 animate-in fade-in duration-300 delay-100">
                            {/* Server Rack Style Indicator Light */}
                            <div className="h-3 w-1 rounded-full bg-brand shadow-[0_0_8px_hsl(var(--brand)/0.6)] animate-pulse" />

                            <span className="text-sm font-medium whitespace-nowrap">
                                <span className="text-muted-foreground mr-1">
                                    正在后台抓取:
                                </span>
                                <span className="text-foreground max-w-[150px] truncate inline-block align-bottom">
                                    {activeScraperName || "准备中..."}
                                </span>
                            </span>

                            {queueLength > 0 && (
                                <span className="text-xs font-semibold text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded tabular-nums ml-1">
                                    +{queueLength}
                                </span>
                            )}
                        </div>

                        <div className="w-px h-4 bg-border mx-2 shrink-0 animate-in fade-in duration-300 delay-100" />

                        <div className="flex items-center gap-1 shrink-0 animate-in fade-in duration-300 delay-100 relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onShowWindow();
                                }}
                                className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium text-muted-foreground hover:bg-foreground hover:text-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                                title="显示浏览器"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                浏览器
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSkip();
                                }}
                                className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium text-muted-foreground hover:bg-foreground hover:text-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                                title="跳过当前"
                            >
                                <SkipForward className="h-3.5 w-3.5" />
                                跳过
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClearQueue();
                                }}
                                className="flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium text-error hover:bg-error hover:text-error-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                                title="清空队列"
                            >
                                <XCircle className="h-3.5 w-3.5" />
                                清空
                            </button>

                            <div className="w-px h-4 bg-border mx-1" />

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded(false);
                                }}
                                className="flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                                title="收起"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
