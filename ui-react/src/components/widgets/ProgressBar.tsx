import { ProgressBarWidget } from "../../types/config";
import { evaluateTemplate } from "../../lib/utils";

interface Props {
    widget: ProgressBarWidget;
    data: Record<string, any>;
}

export function ProgressBar({ widget, data }: Props) {
    const usageRaw = evaluateTemplate(widget.usage, data);
    const limitRaw = evaluateTemplate(widget.limit, data);
    const title = evaluateTemplate(widget.title, data);

    const usage =
        usageRaw !== undefined && usageRaw !== null && !isNaN(Number(usageRaw))
            ? Number(usageRaw)
            : 0;
    const limit =
        limitRaw !== undefined && limitRaw !== null && !isNaN(Number(limitRaw))
            ? Number(limitRaw)
            : 0;

    // Graceful degradation when there's no limit
    if (!limit || limit === 0) {
        return (
            <div className="flex flex-col gap-1 w-full h-full justify-center min-h-0 overflow-hidden">
                {title && <span className="text-xs font-medium">{title}</span>}
                <span className="text-sm text-muted-foreground">
                    Limit undefined
                </span>
            </div>
        );
    }

    const percentage = Math.min(100, (usage / limit) * 100);

    // Color thresholds
    let colorClass = "bg-primary";
    const warn = widget.color_thresholds?.warning_percent || 75;
    const crit = widget.color_thresholds?.critical_percent || 90;

    if (percentage >= crit) {
        colorClass = "bg-red-500";
    } else if (percentage >= warn) {
        colorClass = "bg-yellow-500";
    }

    return (
        <div className="flex flex-col gap-1.5 w-full h-full justify-center min-h-0 overflow-hidden">
            <div className="flex items-center justify-between text-xs">
                {title && <span className="font-medium">{title}</span>}
                <span className="text-muted-foreground ml-2 shrink-0">
                    {Number(usage.toFixed(4)).toLocaleString()} /{" "}
                    {Number(limit.toFixed(4)).toLocaleString()}
                </span>
            </div>
            {/* Custom progress bar to easily control color */}
            <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${colorClass}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
