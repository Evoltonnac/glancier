import { ChartFrame } from "./ChartFrame";
import { renderAreaChart } from "./adapters/rechartsAdapter";
import {
    resolveChartFieldsSource,
    validateChartEncoding,
} from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { RuntimeChartArea as ChartAreaWidget } from "../shared/chartSchemas";

interface ChartAreaProps {
    widget: ChartAreaWidget;
    data: Record<string, any>;
}

export function ChartArea({ widget, data }: ChartAreaProps) {
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
        <ChartFrame type="Chart.Area" state={state}>
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
