import { ChartFrame } from "./ChartFrame";
import { renderPieChart } from "./adapters/rechartsAdapter";
import { validateChartEncoding } from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { ChartPie as ChartPieWidget } from "../shared/chartSchemas";

interface ChartPieProps {
    widget: ChartPieWidget;
    data: Record<string, any>;
}

export function ChartPie({ widget, data }: ChartPieProps) {
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
            type="Chart.Pie"
            state={state}
            title={widget.title}
            description={widget.description}
        >
            {state.kind === "ready"
                ? renderPieChart({
                      rows,
                      encoding: widget.encoding,
                      legend: widget.legend,
                      colors: widget.colors,
                      donut: widget.donut,
                  })
                : null}
        </ChartFrame>
    );
}
