import type { ReactNode } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
    BarChart,
    Bar,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";

import type {
    ChartEncoding,
    ChartEncodingChannel,
} from "../../shared/chartFieldValidation";
import {
    CHART_SEMANTIC_COLORS,
    type ChartSemanticColor,
} from "../../shared/chartSchemas";

const DEFAULT_PALETTE: ChartSemanticColor[] = [...CHART_SEMANTIC_COLORS];

type ChartRow = Record<string, unknown>;

type CartesianAdapterInput = {
    rows: ChartRow[];
    encoding: ChartEncoding;
    legend?: boolean;
    colors?: ChartSemanticColor[];
};

type PieAdapterInput = {
    rows: ChartRow[];
    encoding: ChartEncoding;
    legend?: boolean;
    colors?: ChartSemanticColor[];
    donut?: boolean;
};

function getField(channel: ChartEncodingChannel | undefined): string {
    return String(channel?.field ?? "").trim();
}

const CHART_COLOR_TOKEN_MAP: Record<ChartSemanticColor, string> = {
    blue: "hsl(var(--chart-blue))",
    teal: "hsl(var(--chart-teal))",
    green: "hsl(var(--chart-green))",
    cyan: "hsl(var(--chart-cyan))",
    yellow: "hsl(var(--chart-yellow))",
    gold: "hsl(var(--chart-gold))",
    orange: "hsl(var(--chart-orange))",
    amber: "hsl(var(--chart-amber))",
    red: "hsl(var(--chart-red))",
    violet: "hsl(var(--chart-violet))",
    pink: "hsl(var(--chart-pink))",
    slate: "hsl(var(--chart-slate))",
};

function getPalette(colors?: ChartSemanticColor[]): ChartSemanticColor[] {
    return colors && colors.length > 0 ? colors : DEFAULT_PALETTE;
}

function resolveSemanticColor(color: ChartSemanticColor): string {
    return CHART_COLOR_TOKEN_MAP[color];
}

function uniqueSeriesValues(rows: ChartRow[], field?: string): string[] {
    if (!field) {
        return [];
    }

    return Array.from(
        new Set(
            rows
                .map((row) => row[field])
                .filter((value) => value !== null && value !== undefined)
                .map((value) => String(value)),
        ),
    );
}

function colorAt(index: number, colors?: ChartSemanticColor[]): string {
    const palette = getPalette(colors);
    const colorName = palette[index % palette.length] ?? DEFAULT_PALETTE[0];
    return resolveSemanticColor(colorName);
}

function coerceNumericValue(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function cartesianCommonElements(
    xField: string,
    legend?: boolean,
): ReactNode[] {
    return [
        <CartesianGrid key="grid" strokeDasharray="3 3" />,
        <XAxis key="xaxis" dataKey={xField} />,
        <YAxis key="yaxis" />,
        <Tooltip key="tooltip" />,
        ...(legend ? [<Legend key="legend" />] : []),
    ];
}

function renderCartesianSeries({
    kind,
    rows,
    encoding,
    legend,
    colors,
}: CartesianAdapterInput & { kind: "line" | "bar" | "area" }) {
    const xField = getField(encoding.x);
    const yField = getField(encoding.y);
    const seriesField = getField(encoding.series);
    const seriesValues = uniqueSeriesValues(rows, seriesField);
    const hasSeriesChannel = Boolean(seriesField) && seriesValues.length > 0;
    const palette = getPalette(colors);
    const initializedSeriesDefaults = hasSeriesChannel
        ? Object.fromEntries(seriesValues.map((seriesKey) => [seriesKey, null]))
        : {};
    const normalizedRows = rows.map((row) => ({
        ...row,
        [yField]: coerceNumericValue(row[yField]),
    }));

    const renderSeriesNode = (seriesKey: string, index: number) => {
        const sharedProps = {
            dataKey: hasSeriesChannel ? seriesKey : yField,
            name: seriesKey,
            stroke: colorAt(index, palette),
            fill: colorAt(index, palette),
        };

        if (kind === "line") {
            return (
                <Line
                    key={seriesKey}
                    type="monotone"
                    {...sharedProps}
                    dot={false}
                    connectNulls={Boolean(seriesField)}
                />
            );
        }

        if (kind === "bar") {
            return <Bar key={seriesKey} {...sharedProps} />;
        }

        return (
            <Area
                key={seriesKey}
                type="monotone"
                {...sharedProps}
                fillOpacity={0.3}
                connectNulls={Boolean(seriesField)}
            />
        );
    };

    const chartData = hasSeriesChannel
        ? Array.from(
              rows.reduce((accumulator, row) => {
                  const xValue = row[xField];
                  const seriesValue = row[seriesField];
                  const yValue = row[yField];
                  const key = String(xValue ?? "");
                  const existing = accumulator.get(key) ?? {
                      [xField]: xValue,
                      ...initializedSeriesDefaults,
                  };
                  const normalizedY = coerceNumericValue(yValue);

                  if (seriesValue !== null && seriesValue !== undefined) {
                      existing[String(seriesValue)] = normalizedY;
                  }

                  accumulator.set(key, existing);
                  return accumulator;
              }, new Map<string, ChartRow>()),
          ).map(([, value]) => value)
        : normalizedRows;

    const seriesNodes = hasSeriesChannel
        ? seriesValues.map((seriesValue, index) =>
              renderSeriesNode(seriesValue, index),
          )
        : [renderSeriesNode(yField, 0)];

    if (kind === "line") {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    {cartesianCommonElements(xField, legend)}
                    {seriesNodes}
                </LineChart>
            </ResponsiveContainer>
        );
    }

    if (kind === "bar") {
        return (
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                    {cartesianCommonElements(xField, legend)}
                    {seriesNodes}
                </BarChart>
            </ResponsiveContainer>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
                {cartesianCommonElements(xField, legend)}
                {seriesNodes}
            </AreaChart>
        </ResponsiveContainer>
    );
}

export function renderLineChart(input: CartesianAdapterInput) {
    return renderCartesianSeries({ ...input, kind: "line" });
}

export function renderBarChart(input: CartesianAdapterInput) {
    return renderCartesianSeries({ ...input, kind: "bar" });
}

export function renderAreaChart(input: CartesianAdapterInput) {
    return renderCartesianSeries({ ...input, kind: "area" });
}

export function renderPieChart({
    rows,
    encoding,
    legend,
    colors,
    donut,
}: PieAdapterInput) {
    const labelField = getField(encoding.label);
    const valueField = getField(encoding.value);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Tooltip />
                {legend ? <Legend /> : null}
                <Pie
                    data={rows}
                    nameKey={labelField}
                    dataKey={valueField}
                    cx="50%"
                    cy="50%"
                    innerRadius={donut ? "60%" : 0}
                    outerRadius="80%"
                >
                    {rows.map((row, index) => (
                        <Cell
                            key={`${String(row[labelField] ?? index)}-${index}`}
                            fill={colorAt(index, colors)}
                        />
                    ))}
                </Pie>
            </PieChart>
        </ResponsiveContainer>
    );
}

export { DEFAULT_PALETTE };
