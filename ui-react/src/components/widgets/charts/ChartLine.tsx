import { ChartFrame } from "./ChartFrame";
import { renderLineChart } from "./adapters/rechartsAdapter";
import { validateChartEncoding } from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { ChartLine as ChartLineWidget } from "../shared/chartSchemas";

interface ChartLineProps {
    widget: ChartLineWidget;
    data: Record<string, any>;
}

export function ChartLine({ widget, data }: ChartLineProps) {
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
            type="Chart.Line"
            state={state}
            title={widget.title}
            description={widget.description}
        >
            {state.kind === "ready"
                ? renderLineChart({
                      rows,
                      encoding: widget.encoding,
                      legend: widget.legend,
                      colors: widget.colors,
                  })
                : null}
        </ChartFrame>
    );
}
