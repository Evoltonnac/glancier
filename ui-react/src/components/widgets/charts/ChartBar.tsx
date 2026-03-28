import { ChartFrame } from "./ChartFrame";
import { renderBarChart } from "./adapters/rechartsAdapter";
import {
    deriveSqlFieldsFromRows,
    validateChartEncoding,
} from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { RuntimeChartBar as ChartBarWidget } from "../shared/chartSchemas";

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
        deriveSqlFieldsFromRows(rows),
    );
    const state = classifyChartState({
        sourceStatus: sqlResponse.status,
        rows,
        runtimeError: sqlResponse.error,
        encodingValidation,
    });

    return (
        <ChartFrame type="Chart.Bar" state={state}>
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
