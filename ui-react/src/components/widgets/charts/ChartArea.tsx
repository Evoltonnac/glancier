import { ChartFrame } from "./ChartFrame";
import { renderAreaChart } from "./adapters/rechartsAdapter";
import {
    deriveSqlFieldsFromRows,
    validateChartEncoding,
} from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { RuntimeChartArea as ChartAreaWidget } from "../shared/chartSchemas";

interface ChartAreaProps {
    widget: ChartAreaWidget;
    data: Record<string, any>;
}

export function ChartArea({ widget, data }: ChartAreaProps) {
    const sqlResponse = data.sql_response ?? {};
    const rows = Array.isArray(widget.data_source) ? widget.data_source : [];
    const encodingValidation = validateChartEncoding(
        widget.type,
        widget.encoding,
        deriveSqlFieldsFromRows(rows),
    );
    const state = classifyChartState({
        sourceStatus: sqlResponse.status,
        rows,
        runtimeError: sqlResponse.error,
        encodingValidation,
    });

    return (
        <ChartFrame
            type="Chart.Area"
            state={state}
            title={widget.title}
            description={widget.description}
        >
            {state.kind === "ready"
                ? renderAreaChart({
                      rows,
                      encoding: widget.encoding,
                      legend: widget.legend,
                      colors: widget.colors,
                  })
                : null}
        </ChartFrame>
    );
}
