import { Card } from "./ui/card";
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
}

// Semantic dot-status color indicator (replaces removed gradient classes)
const statusDotColorMap: Record<string, string> = {
    active: "bg-success",
    refreshing: "bg-brand animate-pulse",
    suspended: "bg-warning",
    error: "bg-error",
    disabled: "bg-muted-foreground",
};

export function BaseSourceCard({
    component,
    sourceSummary,
    sourceData,
}: BaseSourceCardProps) {
    const ui = component.ui || {
        title: component.label || "Untitled",
        icon: undefined,
        status_field: undefined,
    };

    // Determine status for indicator dot
    const rawStatus = sourceSummary?.status || "disabled";
    let dotStatus: "active" | "refreshing" | "error" | "suspended" | "disabled";
    if ((rawStatus as string) === "refreshing") {
        dotStatus = "refreshing";
    } else if (sourceData?.error || sourceSummary?.error) {
        dotStatus = "error";
    } else if (rawStatus === "suspended") {
        dotStatus = "suspended";
    } else if (sourceSummary?.has_data && rawStatus === "active") {
        dotStatus = "active";
    } else {
        dotStatus = rawStatus as any;
    }

    const dotColorClass =
        statusDotColorMap[dotStatus] || statusDotColorMap.disabled;

    // Decide if we have data to show
    const hasWidgetData =
        sourceData?.data && component.widgets && component.widgets.length > 0;
    const hasNoData = !hasWidgetData;

    return (
        <Card className="bg-surface border-border h-full flex flex-col overflow-hidden hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150">
            {/* Header — semantic dot encodes status; acts as drag handle */}
            <div
                title={`Status: ${dotStatus}`}
                className="qb-card-header flex-shrink-0 flex items-center justify-between px-4 border-b border-border/40 bg-surface"
                style={{ height: "var(--qb-card-header-height)" }}
            >
                <div className="flex items-center gap-2 min-w-0 flex-1 mt-1">
                    {/* Semantic status dot */}
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColorClass}`} />
                    {ui.icon && (
                        <span className="text-sm leading-none shrink-0">
                            {ui.icon}
                        </span>
                    )}
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold truncate">
                        {ui.title}
                    </span>
                </div>
            </div>

            {/* Content area — fills remaining card height */}
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 px-4 py-3">
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
