import { z } from "zod";
import {
    SEMANTIC_COLORS,
    SemanticColorSchema,
    type SemanticColor,
} from "./semanticColors";

export const CHART_SEMANTIC_COLORS = SEMANTIC_COLORS;
export const ChartSemanticColorSchema = SemanticColorSchema;

const ChartFieldRefSchema = z.object({
    field: z.string().min(1),
});

const OptionalChartFieldRefSchema = z
    .object({
        field: z.string().min(1),
    })
    .partial();

const CartesianEncodingSchema = z
    .object({
        x: OptionalChartFieldRefSchema.optional(),
        y: OptionalChartFieldRefSchema.optional(),
        series: ChartFieldRefSchema.optional(),
    })
    .superRefine((value, ctx) => {
        if (!value.x?.field) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["x", "field"],
                message: "Required",
            });
        }
        if (!value.y?.field) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["y", "field"],
                message: "Required",
            });
        }
    });

const PieEncodingSchema = z
    .object({
        label: OptionalChartFieldRefSchema.optional(),
        value: OptionalChartFieldRefSchema.optional(),
    })
    .superRefine((value, ctx) => {
        if (!value.label?.field) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["label", "field"],
                message: "Required",
            });
        }
        if (!value.value?.field) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["value", "field"],
                message: "Required",
            });
        }
    });

const TableColumnSchema = z.object({
    field: z.string().min(1),
    title: z.string().optional(),
    format: z.string().optional(),
});

const ChartBaseSchema = z.object({
    data_source: z.string().min(1),
    legend: z.boolean().optional(),
    colors: z.array(ChartSemanticColorSchema).optional(),
});

const RuntimeChartBaseSchema = ChartBaseSchema.extend({
    data_source: z.array(z.record(z.string(), z.any())),
});

export const ChartLineSchema = ChartBaseSchema.extend({
    type: z.literal("Chart.Line"),
    encoding: CartesianEncodingSchema,
});

export const ChartBarSchema = ChartBaseSchema.extend({
    type: z.literal("Chart.Bar"),
    encoding: CartesianEncodingSchema,
});

export const ChartAreaSchema = ChartBaseSchema.extend({
    type: z.literal("Chart.Area"),
    encoding: CartesianEncodingSchema,
});

export const ChartPieSchema = ChartBaseSchema.extend({
    type: z.literal("Chart.Pie"),
    encoding: PieEncodingSchema,
    donut: z.boolean().default(false),
});

export const ChartTableSchema = ChartBaseSchema.extend({
    type: z.literal("Chart.Table"),
    encoding: z.object({
        columns: z.array(TableColumnSchema).min(1),
    }),
    sort_by: z.string().optional(),
    sort_order: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().positive().optional(),
});

export const ChartWidgetSchema = z.discriminatedUnion("type", [
    ChartLineSchema,
    ChartBarSchema,
    ChartAreaSchema,
    ChartPieSchema,
    ChartTableSchema,
]);

export const RuntimeChartLineSchema = RuntimeChartBaseSchema.extend({
    type: z.literal("Chart.Line"),
    encoding: CartesianEncodingSchema,
});

export const RuntimeChartBarSchema = RuntimeChartBaseSchema.extend({
    type: z.literal("Chart.Bar"),
    encoding: CartesianEncodingSchema,
});

export const RuntimeChartAreaSchema = RuntimeChartBaseSchema.extend({
    type: z.literal("Chart.Area"),
    encoding: CartesianEncodingSchema,
});

export const RuntimeChartPieSchema = RuntimeChartBaseSchema.extend({
    type: z.literal("Chart.Pie"),
    encoding: PieEncodingSchema,
    donut: z.boolean().default(false),
});

export const RuntimeChartTableSchema = RuntimeChartBaseSchema.extend({
    type: z.literal("Chart.Table"),
    encoding: z.object({
        columns: z.array(TableColumnSchema).min(1),
    }),
    sort_by: z.string().optional(),
    sort_order: z.enum(["asc", "desc"]).optional(),
    limit: z.number().int().positive().optional(),
});

export const RuntimeChartWidgetSchema = z.discriminatedUnion("type", [
    RuntimeChartLineSchema,
    RuntimeChartBarSchema,
    RuntimeChartAreaSchema,
    RuntimeChartPieSchema,
    RuntimeChartTableSchema,
]);

export type ChartWidget = z.infer<typeof ChartWidgetSchema>;
export type ChartSemanticColor = SemanticColor;
export type ChartLine = z.infer<typeof ChartLineSchema>;
export type ChartBar = z.infer<typeof ChartBarSchema>;
export type ChartArea = z.infer<typeof ChartAreaSchema>;
export type ChartPie = z.infer<typeof ChartPieSchema>;
export type ChartTable = z.infer<typeof ChartTableSchema>;
export type RuntimeChartLine = z.infer<typeof RuntimeChartLineSchema>;
export type RuntimeChartBar = z.infer<typeof RuntimeChartBarSchema>;
export type RuntimeChartArea = z.infer<typeof RuntimeChartAreaSchema>;
export type RuntimeChartPie = z.infer<typeof RuntimeChartPieSchema>;
export type RuntimeChartTable = z.infer<typeof RuntimeChartTableSchema>;
