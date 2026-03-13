import { z } from "zod";
import type { ReactNode } from "react";
import { SpacingSchema, spacingClassMap } from "../shared/commonProps";

/**
 * List Schema
 *
 * Container for rendering arrays of data with filtering, sorting, and pagination.
 */
export const ListSchema = z.object({
    type: z.literal("List"),
    data_source: z.string(),
    item_alias: z.string(),
    render: z.array(z.any()),

    layout: z.enum(["col", "grid"]).default("col"),
    columns: z.number().min(1).max(6).optional(),
    spacing: SpacingSchema.default("md"),

    filter: z.string().optional(),
    sort_by: z.string().optional(),
    sort_order: z.enum(["asc", "desc"]).default("asc"),
    limit: z.number().positive().optional(),

    pagination: z.boolean().default(false),
    page_size: z.number().positive().default(10),
});

export type ListProps = z.infer<typeof ListSchema>;

interface ListComponentProps {
    layout?: "col" | "grid";
    columns?: number;
    spacing?: z.infer<typeof SpacingSchema>;
    children: ReactNode;
}

export function List({
    layout = "col",
    columns = 2,
    spacing = "md",
    children,
}: ListComponentProps) {
    const spacingClass = spacingClassMap[spacing];

    if (layout === "grid") {
        const gridColsMap: Record<number, string> = {
            1: "grid-cols-1",
            2: "grid-cols-1 md:grid-cols-2",
            3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
            4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
            5: "grid-cols-1 md:grid-cols-2 lg:grid-cols-5",
            6: "grid-cols-1 md:grid-cols-2 lg:grid-cols-6",
        };

        return (
            <div
                className={`grid ${gridColsMap[columns] || gridColsMap[2]} ${spacingClass} w-full h-full content-start`}
            >
                {children}
            </div>
        );
    }

    return <div className={`flex flex-col w-full h-full ${spacingClass}`}>{children}</div>;
}
