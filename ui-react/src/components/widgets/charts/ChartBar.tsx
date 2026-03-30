import { ChartFrame } from "./ChartFrame";
import { renderBarChart } from "./adapters/rechartsAdapter";
import {
    resolveChartFieldsSource,
    validateChartEncoding,
} from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { RuntimeChartBar as ChartBarWidget } from "../shared/chartSchemas";

interface ChartBarProps {
    widget: ChartBarWidget;
    data: Record<string, any>;
}

export function ChartBar({ widget, data }: ChartBarProps) {
    void data;
    const rows = Array.isArray(widget.data_source) ? widget.data_source : [];
    const sqlFields = resolveChartFieldsSource(widget.fields_source, rows);
    const encodingValidation = validateChartEncoding(
        widget.type,
        widget.encoding,
        sqlFields,
    );
    const state = classifyChartState({
        rows,
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
