import { ChartFrame } from "./ChartFrame";
import { renderLineChart } from "./adapters/rechartsAdapter";
import {
    resolveChartFieldsSource,
    validateChartEncoding,
} from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { RuntimeChartLine as ChartLineWidget } from "../shared/chartSchemas";

interface ChartLineProps {
    widget: ChartLineWidget;
    data: Record<string, any>;
}

export function ChartLine({ widget, data }: ChartLineProps) {
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
        <ChartFrame type="Chart.Line" state={state}>
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
