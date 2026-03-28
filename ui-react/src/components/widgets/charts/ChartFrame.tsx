import type { ReactNode } from "react";

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "../../ui/card";
import { cn } from "../../../lib/utils";
import type { ChartState } from "../shared/chartState";

type ChartFrameType =
    | "Chart.Line"
    | "Chart.Bar"
    | "Chart.Area"
    | "Chart.Pie"
    | "Chart.Table";

interface ChartFrameProps {
    type: ChartFrameType;
    state: ChartState;
    title?: string;
    description?: string;
    children?: ReactNode;
}

const loadingLabelByWidgetType: Record<ChartFrameType, string> = {
    "Chart.Line": "Loading line chart",
    "Chart.Bar": "Loading bar chart",
    "Chart.Area": "Loading area chart",
    "Chart.Pie": "Loading pie chart",
    "Chart.Table": "Loading chart table",
};

function FallbackBody({ heading, body }: { heading: string; body: string }) {
    return (
        <div className="flex h-full items-center justify-center">
            <div className="flex max-w-md flex-col items-center text-center qb-gap-2">
                <h3 className="text-lg font-semibold leading-tight">
                    {heading}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {body}
                </p>
            </div>
        </div>
    );
}

function describeChartConfigError(
    state: Extract<ChartState, { kind: "config_error" }>,
) {
    const detail = state.detail;
    if (detail.code === "missing_required_channel") {
        return {
            body: `Missing required field mapping for channel "${detail.channel}".`,
            path: detail.path,
        };
    }

    if (detail.code === "unknown_field") {
        return {
            body: detail.field
                ? `Unknown field "${detail.field}" for channel "${detail.channel}".`
                : `Unknown field mapping for channel "${detail.channel}".`,
            path: detail.path,
        };
    }

    return {
        body: detail.field
            ? `Field "${detail.field}" is incompatible with channel "${detail.channel}".`
            : `Field mapping is incompatible with channel "${detail.channel}".`,
        path: detail.path,
    };
}

export function ChartFrame({
    type,
    state,
    title,
    description,
    children,
}: ChartFrameProps) {
    const loadingLabel = loadingLabelByWidgetType[type];

    let content: ReactNode;
    if (state.kind === "loading") {
        content = (
            <div
                aria-label={loadingLabel}
                className="flex h-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-surface/40 text-sm text-muted-foreground"
            >
                {loadingLabel}
            </div>
        );
    } else if (state.kind === "runtime_error") {
        content = (
            <FallbackBody
                heading="Chart unavailable"
                body="This chart cannot be shown right now. Check the SQL source status or fix the widget field mapping, then refresh the card."
            />
        );
    } else if (state.kind === "config_error") {
        const detail = describeChartConfigError(state);
        content = (
            <div className="flex h-full items-center justify-center">
                <div className="flex max-w-md flex-col items-center text-center qb-gap-2">
                    <h3 className="text-lg font-semibold leading-tight">
                        Invalid chart configuration
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {detail.body}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Path:{" "}
                        <code className="rounded bg-surface/60 px-1 py-0.5">
                            {detail.path}
                        </code>
                    </p>
                </div>
            </div>
        );
    } else if (state.kind === "empty") {
        content = (
            <FallbackBody
                heading="No chart data available"
                body="This widget has no rows to visualize yet. Refresh the source or adjust the query to return chartable results."
            />
        );
    } else {
        content = children;
    }

    return (
        <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border bg-surface">
            {(title || description) && (
                <CardHeader className="qb-gap-1 border-b border-border/40">
                    {title ? <CardTitle>{title}</CardTitle> : null}
                    {description ? (
                        <CardDescription>{description}</CardDescription>
                    ) : null}
                </CardHeader>
            )}
            <CardContent
                className={cn(
                    "flex flex-1 flex-col min-h-0 overflow-hidden pt-4",
                    state.kind === "ready" ? "pb-0" : "pb-4",
                )}
            >
                {content}
            </CardContent>
        </Card>
    );
}

export { loadingLabelByWidgetType };
