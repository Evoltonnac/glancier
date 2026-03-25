import { ChartFrame } from "./ChartFrame";
import { validateChartEncoding } from "../shared/chartFieldValidation";
import { classifyChartState } from "../shared/chartState";
import { formatChartTableValue } from "../shared/chartFormatting";
import type { ChartTable as ChartTableWidget } from "../shared/chartSchemas";

interface ChartTableProps {
    widget: ChartTableWidget;
    data: Record<string, any>;
}

type TableRow = Record<string, unknown>;

function compareTableValues(left: unknown, right: unknown): number {
    if (left == null && right == null) {
        return 0;
    }
    if (left == null) {
        return -1;
    }
    if (right == null) {
        return 1;
    }

    if (typeof left === "number" && typeof right === "number") {
        return left === right ? 0 : left > right ? 1 : -1;
    }

    const leftDate = new Date(left as string | number);
    const rightDate = new Date(right as string | number);
    if (!Number.isNaN(leftDate.getTime()) && !Number.isNaN(rightDate.getTime())) {
        const leftTime = leftDate.getTime();
        const rightTime = rightDate.getTime();
        return leftTime === rightTime ? 0 : leftTime > rightTime ? 1 : -1;
    }

    const leftText = String(left);
    const rightText = String(right);
    return leftText.localeCompare(rightText, "en", { numeric: true, sensitivity: "base" });
}

function getProcessedRows(rows: TableRow[], sortBy?: string, sortOrder: "asc" | "desc" = "asc", limit?: number) {
    let processedRows = [...rows];

    if (sortBy) {
        processedRows = processedRows
            .map((row, index) => ({ row, index }))
            .sort((left, right) => {
                const comparison = compareTableValues(left.row[sortBy], right.row[sortBy]);
                if (comparison !== 0) {
                    return sortOrder === "desc" ? -comparison : comparison;
                }
                return left.index - right.index;
            })
            .map(({ row }) => row);
    }

    if (limit) {
        processedRows = processedRows.slice(0, limit);
    }

    return processedRows;
}

export function ChartTable({ widget, data }: ChartTableProps) {
    const sqlResponse = data.sql_response ?? {};
    const rows = Array.isArray(widget.data_source) ? (widget.data_source as TableRow[]) : [];
    const columns = widget.columns ?? widget.encoding.columns ?? [];
    const encodingValidation = validateChartEncoding(
        widget.type,
        { columns },
        Array.isArray(sqlResponse.fields) ? sqlResponse.fields : undefined,
    );
    const state = classifyChartState({
        sourceStatus: sqlResponse.status,
        rows,
        runtimeError: sqlResponse.error,
        encodingValidation,
    });
    const processedRows =
        state.kind === "ready"
            ? getProcessedRows(rows, widget.sort_by, widget.sort_order ?? "asc", widget.limit)
            : [];

    return (
        <ChartFrame
            type="Chart.Table"
            state={state}
            title={widget.title}
            description={widget.description}
        >
            {state.kind === "ready" ? (
                <div className="h-full overflow-auto rounded-md border border-border/40 bg-surface/20">
                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-surface/60 text-left">
                            <tr>
                                {columns.map((column) => (
                                    <th
                                        key={column.field}
                                        className="border-b border-border/40 px-3 py-2 font-semibold text-foreground"
                                        scope="col"
                                    >
                                        {column.title ?? column.field}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {processedRows.map((row, rowIndex) => (
                                <tr key={`${rowIndex}-${columns.map((column) => String(row[column.field] ?? "")).join("|")}`}>
                                    {columns.map((column) => (
                                        <td
                                            key={column.field}
                                            className="border-b border-border/30 px-3 py-2 align-top text-muted-foreground last:border-b-0"
                                        >
                                            {formatChartTableValue(row[column.field], column.format)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </ChartFrame>
    );
}
