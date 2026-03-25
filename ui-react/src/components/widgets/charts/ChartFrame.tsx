import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { cn } from "../../../lib/utils";
import type { ChartState } from "../shared/chartState";

type ChartFrameType = "Chart.Line" | "Chart.Bar" | "Chart.Area" | "Chart.Pie" | "Chart.Table";

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
        <div className="flex h-full min-h-[220px] items-center justify-center">
            <div className="flex max-w-md flex-col items-center text-center qb-gap-2">
                <h3 className="text-lg font-semibold leading-tight">{heading}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
        </div>
    );
}

export function ChartFrame({ type, state, title, description, children }: ChartFrameProps) {
    const loadingLabel = loadingLabelByWidgetType[type];

    let content: ReactNode;
    if (state.kind === "loading") {
        content = (
            <div
                aria-label={loadingLabel}
                className="flex h-full min-h-[220px] items-center justify-center rounded-lg border border-dashed border-border/60 bg-surface/40 text-sm text-muted-foreground"
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
        content = (
            <FallbackBody
                heading="Invalid chart configuration"
                body="One or more required fields are missing or incompatible for this chart type. Update the field mapping and try again."
            />
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
                    {description ? <CardDescription>{description}</CardDescription> : null}
                </CardHeader>
            )}
            <CardContent className={cn("flex-1 min-h-0 pt-4", state.kind === "ready" ? "" : "pb-4")}>
                {content}
            </CardContent>
        </Card>
    );
}

export { loadingLabelByWidgetType };
