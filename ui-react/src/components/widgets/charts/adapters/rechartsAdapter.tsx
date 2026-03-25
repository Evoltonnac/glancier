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

const DEFAULT_PALETTE = ["blue", "teal", "green", "amber", "violet", "pink", "slate", "red"];

type ChartRow = Record<string, unknown>;

type CartesianAdapterInput = {
    rows: ChartRow[];
    encoding: ChartEncoding;
    legend?: boolean;
    colors?: string[];
};

type PieAdapterInput = {
    rows: ChartRow[];
    encoding: ChartEncoding;
    legend?: boolean;
    colors?: string[];
    donut?: boolean;
};

function getField(channel: ChartEncodingChannel | undefined): string {
    return channel?.field ?? "";
}

function getPalette(colors?: string[]): string[] {
    return colors && colors.length > 0 ? colors : DEFAULT_PALETTE;
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

function colorAt(index: number, colors?: string[]): string {
    const palette = getPalette(colors);
    return palette[index % palette.length] ?? DEFAULT_PALETTE[0];
}

function CartesianCommon({
    children,
    xField,
    legend,
}: {
    children: ReactNode;
    xField: string;
    legend?: boolean;
}) {
    return (
        <>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={xField} />
            <YAxis />
            <Tooltip />
            {legend ? <Legend /> : null}
            {children}
        </>
    );
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
    const palette = getPalette(colors);

    const renderSeriesNode = (seriesKey: string, index: number) => {
        const sharedProps = {
            dataKey: seriesField ? seriesKey : yField,
            name: seriesKey,
            stroke: palette[index % palette.length],
            fill: palette[index % palette.length],
        };

        if (kind === "line") {
            return <Line key={seriesKey} type="monotone" {...sharedProps} dot={false} />;
        }

        if (kind === "bar") {
            return <Bar key={seriesKey} {...sharedProps} />;
        }

        return <Area key={seriesKey} type="monotone" {...sharedProps} fillOpacity={0.3} />;
    };

    const chartData = seriesField
        ? Array.from(
              rows.reduce((accumulator, row) => {
                  const xValue = row[xField];
                  const seriesValue = row[seriesField];
                  const yValue = row[yField];
                  const key = String(xValue ?? "");
                  const existing = accumulator.get(key) ?? { [xField]: xValue };

                  if (seriesValue !== null && seriesValue !== undefined) {
                      existing[String(seriesValue)] = yValue;
                  }

                  accumulator.set(key, existing);
                  return accumulator;
              }, new Map<string, ChartRow>()),
          ).map(([, value]) => value)
        : rows;

    const seriesNodes = seriesField
        ? seriesValues.map((seriesValue, index) => renderSeriesNode(seriesValue, index))
        : [renderSeriesNode(yField, 0)];

    if (kind === "line") {
        return (
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                <LineChart data={chartData}>
                    <CartesianCommon xField={xField} legend={legend}>
                        {seriesNodes}
                    </CartesianCommon>
                </LineChart>
            </ResponsiveContainer>
        );
    }

    if (kind === "bar") {
        return (
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                <BarChart data={chartData}>
                    <CartesianCommon xField={xField} legend={legend}>
                        {seriesNodes}
                    </CartesianCommon>
                </BarChart>
            </ResponsiveContainer>
        );
    }

    return (
        <ResponsiveContainer width="100%" height="100%" minHeight={240}>
            <AreaChart data={chartData}>
                <CartesianCommon xField={xField} legend={legend}>
                    {seriesNodes}
                </CartesianCommon>
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

export function renderPieChart({ rows, encoding, legend, colors, donut }: PieAdapterInput) {
    const labelField = getField(encoding.label);
    const valueField = getField(encoding.value);

    return (
        <ResponsiveContainer width="100%" height="100%" minHeight={240}>
            <PieChart>
                <Tooltip />
                {legend ? <Legend /> : null}
                <Pie
                    data={rows}
                    nameKey={labelField}
                    dataKey={valueField}
                    innerRadius={donut ? 48 : 0}
                    outerRadius={96}
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
