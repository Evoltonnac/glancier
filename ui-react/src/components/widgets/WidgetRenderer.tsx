import { z } from "zod";
import { memo, useEffect, useState } from "react";
import { evaluateTemplateExpression } from "../../lib/templateExpression";
import { resolveWidgetParams } from "./shared/widgetParamResolver";

// Import all widget schemas
import { ContainerSchema } from "./layouts/Container";
import { ColumnSetSchema } from "./layouts/ColumnSet";
import { ColumnSchema } from "./layouts/Column";
import { ListSchema } from "./containers/List";
import { TextBlockSchema } from "./elements/TextBlock";
import { FactSetSchema } from "./elements/FactSet";
import { ImageSchema } from "./elements/Image";
import { BadgeSchema } from "./elements/Badge";
import { ProgressSchema } from "./visualizations/Progress";
import {
    ChartLineSchema,
    ChartBarSchema,
    ChartAreaSchema,
    ChartPieSchema,
    RuntimeChartLineSchema,
    RuntimeChartBarSchema,
    RuntimeChartAreaSchema,
    RuntimeChartPieSchema,
} from "./shared/chartSchemas";
import { ActionSetSchema } from "./actions/ActionSet";
import { ActionOpenUrlSchema } from "./actions/ActionOpenUrl";
import { ActionCopySchema } from "./actions/ActionCopy";

// Import all widget components
import { Container } from "./layouts/Container";
import { ColumnSet } from "./layouts/ColumnSet";
import { Column } from "./layouts/Column";
import { List } from "./containers/List";
import { TextBlock } from "./elements/TextBlock";
import { FactSet } from "./elements/FactSet";
import { Image } from "./elements/Image";
import { Badge } from "./elements/Badge";
import { Progress } from "./visualizations/Progress";
import { ChartLine } from "./charts/ChartLine";
import { ChartBar } from "./charts/ChartBar";
import { ChartArea } from "./charts/ChartArea";
import { ChartPie } from "./charts/ChartPie";
import { ActionSet } from "./actions/ActionSet";
import { ActionOpenUrl } from "./actions/ActionOpenUrl";
import { ActionCopy } from "./actions/ActionCopy";

/**
 * Unified Widget Schema
 *
 * Discriminated union of all supported widget types.
 * This serves as the single source of truth for AI consumption and runtime validation.
 */
function createWidgetSchema(
    listRenderSchemaFactory: (self: z.ZodTypeAny) => z.ZodTypeAny,
    chartSchemaSet = {
        line: ChartLineSchema,
        bar: ChartBarSchema,
        area: ChartAreaSchema,
        pie: ChartPieSchema,
    },
): z.ZodType<any> {
    let selfSchema: z.ZodType<any>;

    selfSchema = z.lazy(() =>
        z.discriminatedUnion("type", [
            // Layouts
            ContainerSchema.extend({
                items: z.array(selfSchema),
            }),
            ColumnSetSchema.extend({
                columns: z.array(
                    ColumnSchema.extend({
                        items: z.array(selfSchema),
                    }),
                ),
            }),
            // Containers
            ListSchema.extend({
                render: listRenderSchemaFactory(selfSchema),
            }),
            // Elements
            TextBlockSchema,
            FactSetSchema,
            ImageSchema,
            BadgeSchema,
            // Visualizations
            ProgressSchema,
            chartSchemaSet.line,
            chartSchemaSet.bar,
            chartSchemaSet.area,
            chartSchemaSet.pie,
            // Actions
            ActionSetSchema.extend({
                actions: z.array(z.union([ActionOpenUrlSchema, ActionCopySchema])),
            }),
            ActionOpenUrlSchema,
            ActionCopySchema,
        ]),
    );

    return selfSchema;
}

export const WidgetSchema = createWidgetSchema((self) => z.array(self));

const RuntimeWidgetSchema = createWidgetSchema(
    // Defer List.render validation until each item is rendered with item-specific data.
    () => z.array(z.any()),
    {
        line: RuntimeChartLineSchema,
        bar: RuntimeChartBarSchema,
        area: RuntimeChartAreaSchema,
        pie: RuntimeChartPieSchema,
    },
);

export type Widget = z.infer<typeof WidgetSchema>;

function getWidgetTypeLabel(widget: unknown): string {
    if (
        widget &&
        typeof widget === "object" &&
        "type" in widget &&
        typeof (widget as { type?: unknown }).type === "string"
    ) {
        return (widget as { type: string }).type;
    }
    return "unknown";
}

function formatIssuePath(path: readonly PropertyKey[]): string {
    if (path.length === 0) {
        return "(root)";
    }

    return path
        .map((segment, index) => {
            if (typeof segment === "number") {
                return `[${segment}]`;
            }
            if (typeof segment === "symbol") {
                return index === 0
                    ? segment.toString()
                    : `.${segment.toString()}`;
            }
            return index === 0 ? segment : `.${segment}`;
        },
        )
        .join("");
}

interface WidgetRendererProps {
    widget: Widget;
    data: Record<string, any>;
    skipTemplateResolution?: boolean;
}

interface ListWidgetRendererProps {
    widget: z.infer<typeof ListSchema> & { render: Widget[] };
    data: Record<string, any>;
}

function ListWidgetRenderer({ widget, data }: ListWidgetRendererProps) {
    const [currentPage, setCurrentPage] = useState(1);

    // Extract array data from inline array
    const sourceItems = Array.isArray(widget.data_source) ? widget.data_source : [];

    let processedData = [...sourceItems];

    // Apply filter
    if (widget.filter) {
        try {
            processedData = processedData.filter((item) => {
                const filterContext = { ...data, [widget.item_alias]: item };
                return Boolean(
                    evaluateTemplateExpression(widget.filter!, filterContext),
                );
            });
        } catch (error) {
            console.error("List filter evaluation failed:", error);
        }
    }

    // Apply sorting
    if (widget.sort_by) {
        const sortPath = widget.sort_by.replace(`${widget.item_alias}.`, "");
        processedData.sort((a, b) => {
            const aVal = sortPath
                .split(".")
                .reduce((obj: any, key: string) => obj?.[key], a);
            const bVal = sortPath
                .split(".")
                .reduce((obj: any, key: string) => obj?.[key], b);

            if (aVal === bVal) return 0;
            const comparison = aVal > bVal ? 1 : -1;
            return widget.sort_order === "desc" ? -comparison : comparison;
        });
    }

    // Apply limit
    if (widget.limit) {
        processedData = processedData.slice(0, widget.limit);
    }

    const pageSize = widget.page_size || 10;
    const totalPages = widget.pagination
        ? Math.max(1, Math.ceil(processedData.length / pageSize))
        : 1;

    useEffect(() => {
        setCurrentPage((prev) => Math.min(prev, totalPages));
    }, [totalPages]);

    const pageData = widget.pagination
        ? processedData.slice(
              (currentPage - 1) * pageSize,
              currentPage * pageSize,
          )
        : processedData;

    return (
        <div className="flex flex-col w-full flex-1 min-h-0 qb-gap-4">
            <div className="flex-1 min-h-0 overflow-auto">
                <List
                    layout={widget.layout}
                    columns={widget.columns}
                    spacing={widget.spacing}
                >
                    {pageData.map((item, index) => {
                        // Create item-specific data context
                        const itemData = { ...data, [widget.item_alias]: item };

                        return (
                            <div
                                key={index}
                                className="rounded-md border border-border/40 bg-surface/20 px-2 py-1.5"
                            >
                                {widget.render.map(
                                    (
                                        renderWidget: Widget,
                                        renderIndex: number,
                                    ) => (
                                        <WidgetRendererImpl
                                            key={renderIndex}
                                            widget={renderWidget}
                                            data={itemData}
                                        />
                                    ),
                                )}
                            </div>
                        );
                    })}
                </List>
            </div>

            {widget.pagination && totalPages > 1 && (
                <div className="flex items-center justify-end qb-gap-2 text-xs">
                    <button
                        type="button"
                        onClick={() =>
                            setCurrentPage((prev) => Math.max(1, prev - 1))
                        }
                        disabled={currentPage === 1}
                        className="rounded border border-border px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Prev
                    </button>
                    <span className="text-muted-foreground">
                        Page {currentPage} / {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={() =>
                            setCurrentPage((prev) =>
                                Math.min(totalPages, prev + 1),
                            )
                        }
                        disabled={currentPage === totalPages}
                        className="rounded border border-border px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * WidgetRenderer Component
 *
 * Recursively renders widget tree with runtime schema validation.
 * Provides graceful fallback for invalid configurations.
 */
function WidgetRendererImpl({
    widget,
    data,
    skipTemplateResolution = false,
}: WidgetRendererProps) {
    // Evaluate all template strings in the widget configuration
    const evaluatedWidget = skipTemplateResolution
        ? widget
        : resolveWidgetParams(widget, data);

    // Validate against schema
    const parseResult = RuntimeWidgetSchema.safeParse(evaluatedWidget);

    if (!parseResult.success) {
        const widgetType = getWidgetTypeLabel(evaluatedWidget);
        const primaryIssue = parseResult.error.issues[0];
        const primaryPath = primaryIssue
            ? formatIssuePath(primaryIssue.path)
            : "(root)";
        const primaryMessage = primaryIssue?.message ?? "Unknown validation error";

        console.error("Widget validation failed:", parseResult.error);
        console.error(
            "Evaluated widget:",
            JSON.stringify(evaluatedWidget, null, 2),
        );
        console.error(
            "Zod error details:",
            JSON.stringify(parseResult.error.format(), null, 2),
        );
        return (
            <div className="text-xs text-red-500 p-2 border border-red-300 rounded bg-red-50 dark:bg-red-900/10">
                <div>Invalid widget configuration: {widgetType}</div>
                <div className="mt-1 text-[11px] leading-relaxed">
                    Path: {primaryPath}
                </div>
                <div className="text-[11px] leading-relaxed">
                    Reason: {primaryMessage}
                </div>
            </div>
        );
    }

    const validWidget = parseResult.data;

    // Render based on widget type
    switch (validWidget.type) {
        case "Container":
            return (
                <Container
                    spacing={validWidget.spacing}
                    align_y={validWidget.align_y}
                >
                    {validWidget.items.map((item: Widget, index: number) => (
                        <WidgetRendererImpl
                            key={index}
                            widget={item}
                            data={data}
                            skipTemplateResolution
                        />
                    ))}
                </Container>
            );

        case "ColumnSet":
            return (
                <ColumnSet
                    spacing={validWidget.spacing}
                    align_x={validWidget.align_x}
                >
                    {validWidget.columns.map((column: any, index: number) => (
                        <Column
                            key={index}
                            width={column.width}
                            align_y={column.align_y}
                            spacing={column.spacing}
                        >
                            {column.items.map(
                                (item: Widget, itemIndex: number) => (
                                    <WidgetRendererImpl
                                        key={itemIndex}
                                        widget={item}
                                        data={data}
                                        skipTemplateResolution
                                    />
                                ),
                            )}
                        </Column>
                    ))}
                </ColumnSet>
            );

        case "List":
            return <ListWidgetRenderer widget={validWidget} data={data} />;

        case "TextBlock":
            return <TextBlock {...validWidget} />;

        case "FactSet":
            return <FactSet {...validWidget} />;

        case "Image":
            return <Image {...validWidget} />;

        case "Badge":
            return <Badge {...validWidget} />;

        case "Progress":
            return <Progress {...validWidget} />;

        case "Chart.Line":
            return <ChartLine widget={validWidget} data={data} />;

        case "Chart.Bar":
            return <ChartBar widget={validWidget} data={data} />;

        case "Chart.Area":
            return <ChartArea widget={validWidget} data={data} />;

        case "Chart.Pie":
            return <ChartPie widget={validWidget} data={data} />;

        case "ActionSet":
            return (
                <ActionSet
                    spacing={validWidget.spacing}
                    align_x={validWidget.align_x}
                >
                    {validWidget.actions.map((action: any, index: number) => (
                        <WidgetRendererImpl
                            key={index}
                            widget={action}
                            data={data}
                            skipTemplateResolution
                        />
                    ))}
                </ActionSet>
            );

        case "Action.OpenUrl":
            return <ActionOpenUrl {...validWidget} />;

        case "Action.Copy":
            return <ActionCopy {...validWidget} />;

        default:
            return (
                <div className="text-xs text-red-500">
                    Unknown widget type: {(validWidget as any).type}
                </div>
            );
    }
}

export const WidgetRenderer = memo(WidgetRendererImpl);
