import { Card } from "./ui/card";
import { AlertTriangle, Wrench } from "lucide-react";
import type {
    ViewComponent,
    SourceSummary,
    DataResponse,
} from "../types/config";
import { WidgetRenderer } from "./widgets/WidgetRenderer";

interface BaseSourceCardProps {
    component: ViewComponent;
    sourceSummary?: SourceSummary;
    sourceData?: DataResponse | null;
    onInteract?: (source: SourceSummary) => void;
    onShowError?: (source: SourceSummary) => void;
}

// Semantic status color indicator for server-rack style pill
const statusPillColorMap: Record<string, string> = {
    success: "bg-success shadow-[0_0_8px_hsl(var(--success)/0.5)]",
    info: "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse",
    warning: "bg-warning shadow-[0_0_8px_hsl(var(--warning)/0.5)]",
    error: "bg-error shadow-[0_0_8px_hsl(var(--error)/0.5)]",
    disabled: "bg-muted-foreground opacity-50",
};

export function BaseSourceCard({
    component,
    sourceSummary,
    sourceData,
    onInteract,
    onShowError,
}: BaseSourceCardProps) {
    const ui = component.ui || {
        title: component.label || "Untitled",
        icon: undefined,
        status_field: undefined,
    };

    const hasError =
        !!sourceSummary?.error ||
        !!sourceSummary?.error_details ||
        (!!sourceSummary?.message && sourceSummary.status === "error") ||
        !!sourceData?.error;
    const hasActionableInteraction =
        !!sourceSummary?.interaction &&
        (sourceSummary.status === "suspended" || sourceSummary.status === "error");
    const shouldShowError = hasError && !hasActionableInteraction;
    const errorLabel =
        sourceSummary?.error ||
        sourceData?.error ||
        sourceSummary?.message?.split("\n")[0] ||
        "Execution failed";

    // Determine status for indicator
    const rawStatus = sourceSummary?.status || "disabled";
    let pillKey: "success" | "info" | "error" | "warning" | "disabled";
    if ((rawStatus as string) === "refreshing") {
        pillKey = "info";
    } else if (rawStatus === "suspended") {
        pillKey = "warning";
    } else if (rawStatus === "error" || hasError) {
        pillKey = "error";
    } else if (sourceSummary?.has_data) {
        pillKey = "success";
    } else {
        pillKey = "disabled";
    }

    const pillClass = statusPillColorMap[pillKey] || statusPillColorMap.disabled;

    // Decide if we have data to show
    const hasWidgetData =
        sourceData?.data && component.widgets && component.widgets.length > 0;
    const hasNoData = !hasWidgetData;

    return (
        <Card className="bg-surface border-border h-full flex flex-col relative overflow-hidden hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
            {/* Header — acts as drag handle */}
            <div
                className="qb-card-header relative z-10 flex-shrink-0 flex items-center justify-between px-4 border-b border-border/40 bg-transparent"
                style={{ height: "var(--qb-card-header-height)" }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {ui.icon && (
                        <span className="text-sm leading-none shrink-0 text-muted-foreground">
                            {ui.icon}
                        </span>
                    )}
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold truncate">
                        {ui.title}
                    </span>
                </div>
                {hasActionableInteraction && sourceSummary && onInteract && (
                    <button
                        type="button"
                        className={`relative z-10 mr-5 inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors ${
                            sourceSummary.status === "error"
                                ? "bg-error/15 text-error hover:bg-error/25"
                                : "bg-warning/15 text-warning hover:bg-warning/25"
                        }`}
                        onClick={(event) => {
                            event.stopPropagation();
                            onInteract(sourceSummary);
                        }}
                        title={
                            sourceSummary.status === "error"
                                ? "凭证无效，点击修复"
                                : "等待补充信息"
                        }
                    >
                        <Wrench className="h-3 w-3" />
                        {sourceSummary.status === "error" ? "修复" : "需操作"}
                    </button>
                )}
                {shouldShowError && sourceSummary && onShowError && (
                    <button
                        type="button"
                        className="relative z-10 mr-5 inline-flex h-6 items-center gap-1 rounded bg-error/15 px-2 text-[11px] font-medium text-error hover:bg-error/25 transition-colors"
                        onClick={(event) => {
                            event.stopPropagation();
                            onShowError(sourceSummary);
                        }}
                        title={errorLabel}
                    >
                        <AlertTriangle className="h-3 w-3" />
                        错误
                    </button>
                )}
                {/* Absolute positioned server rack style indicator light in top-left */}
                <div
                    className={`absolute left-2 top-1/2 -translate-y-1/2 w-[4px] h-3 rounded-full flex-shrink-0 transition-all duration-500 z-20 ${pillClass}`}
                    title={`Status: ${pillKey}`}
                />
            </div>

            {/* Content area — fills remaining card height */}
            <div className="relative z-10 flex-1 flex flex-col overflow-hidden min-h-0 px-4 py-3 bg-surface/50">
                {hasWidgetData && (
                    <div className="flex flex-col gap-2 h-full min-h-0">
                        {component.widgets!.map((widget, idx) => (
                            <WidgetRenderer
                                key={idx}
                                widget={widget}
                                data={sourceData!.data!}
                            />
                        ))}
                    </div>
                )}

                {hasNoData && (
                    <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
                        暂无数据
                    </div>
                )}
            </div>
        </Card>
    );
}
