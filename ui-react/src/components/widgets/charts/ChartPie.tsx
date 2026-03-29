import { ChartFrame } from "./ChartFrame";
import { renderPieChart } from "./adapters/rechartsAdapter";
import {
    resolveChartFieldsSource,
    validateChartEncoding,
} from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import type { RuntimeChartPie as ChartPieWidget } from "../shared/chartSchemas";

interface ChartPieProps {
    widget: ChartPieWidget;
    data: Record<string, any>;
}

export function ChartPie({ widget, data }: ChartPieProps) {
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
        <ChartFrame type="Chart.Pie" state={state}>
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
