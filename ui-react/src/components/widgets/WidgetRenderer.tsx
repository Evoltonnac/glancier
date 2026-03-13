import { z } from "zod";
import { memo, useEffect, useState } from "react";
import { evaluateTemplate } from "../../lib/utils";
import { evaluateTemplateExpression } from "../../lib/templateExpression";

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
import { ActionSet } from "./actions/ActionSet";
import { ActionOpenUrl } from "./actions/ActionOpenUrl";
import { ActionCopy } from "./actions/ActionCopy";

/**
 * Unified Widget Schema
 *
 * Discriminated union of all supported widget types.
 * This serves as the single source of truth for AI consumption and runtime validation.
 */
export const WidgetSchema: z.ZodType<any> = z.lazy(() =>
    z.discriminatedUnion("type", [
        // Layouts
        ContainerSchema.extend({
            items: z.array(WidgetSchema),
        }),
        ColumnSetSchema.extend({
            columns: z.array(
                ColumnSchema.extend({
                    items: z.array(WidgetSchema),
                }),
            ),
        }),
        // Containers
        ListSchema.extend({
            // Defer validation until each list item is rendered with item-specific data.
            render: z.array(z.any()),
        }),
        // Elements
        TextBlockSchema,
        FactSetSchema,
        ImageSchema,
        BadgeSchema,
        // Visualizations
        ProgressSchema,
        // Actions
        ActionSetSchema.extend({
            actions: z.array(z.union([ActionOpenUrlSchema, ActionCopySchema])),
        }),
        ActionOpenUrlSchema,
        ActionCopySchema,
    ]),
);

export type Widget = z.infer<typeof WidgetSchema>;

/**
 * Recursively evaluate all template strings in a widget configuration
 */
function evaluateWidgetTemplates(widget: any, data: Record<string, any>): any {
    if (typeof widget === "string") {
        return evaluateTemplate(widget, data);
    }

    if (Array.isArray(widget)) {
        return widget.map((item) => evaluateWidgetTemplates(item, data));
    }

    if (widget && typeof widget === "object") {
        // Special case: Skip evaluating templates in List widget's render array
        // The render array will be evaluated per-item by the List component
        if (widget.type === "List" && widget.render) {
            const result: any = {};
            for (const [key, value] of Object.entries(widget)) {
                // Preserve render array as-is for per-item evaluation
                result[key] =
                    key === "render"
                        ? value
                        : evaluateWidgetTemplates(value, data);
            }
            return result;
        }

        const result: any = {};
        for (const [key, value] of Object.entries(widget)) {
            result[key] = evaluateWidgetTemplates(value, data);
        }
        return result;
    }

    return widget;
}

interface WidgetRendererProps {
    widget: Widget;
    data: Record<string, any>;
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
                            <div key={index}>
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
function WidgetRendererImpl({ widget, data }: WidgetRendererProps) {
    // Evaluate all template strings in the widget configuration
    const evaluatedWidget = evaluateWidgetTemplates(widget, data);

    // Validate against schema
    const parseResult = WidgetSchema.safeParse(evaluatedWidget);

    if (!parseResult.success) {
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
                Invalid widget configuration:{" "}
                {evaluatedWidget.type || "unknown"}
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
