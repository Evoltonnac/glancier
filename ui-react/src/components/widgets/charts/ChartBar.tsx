import { ChartFrame } from "./ChartFrame";
import { renderBarChart } from "./adapters/rechartsAdapter";
import { validateChartEncoding } from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { ChartBar as ChartBarWidget } from "../shared/chartSchemas";

interface ChartBarProps {
    widget: ChartBarWidget;
    data: Record<string, any>;
}

export function ChartBar({ widget, data }: ChartBarProps) {
    const sqlResponse = data.sql_response ?? {};
    const rows = Array.isArray(widget.data_source) ? widget.data_source : [];
    const encodingValidation = validateChartEncoding(
        widget.type,
        widget.encoding,
        Array.isArray(sqlResponse.fields) ? sqlResponse.fields : undefined,
    );
    const state = classifyChartState({
        sourceStatus: sqlResponse.status,
        rows,
        runtimeError: sqlResponse.error,
        encodingValidation,
    });

    return (
        <ChartFrame
            type="Chart.Bar"
            state={state}
            title={widget.title}
            description={widget.description}
        >
            {state.kind === "ready"
                ? renderBarChart({
                      rows,
                      encoding: widget.encoding,
                      legend: widget.legend,
                      colors: widget.colors,
                  })
                : null}
        </ChartFrame>
    );
}
