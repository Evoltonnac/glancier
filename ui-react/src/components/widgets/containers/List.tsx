import { z } from "zod";
import type { ReactNode } from "react";
import {
    AlignSchema,
    SpacingSchema,
    contentAlignClassMap,
    itemsAlignClassMap,
    justifyClassMap,
    justifyItemsClassMap,
    layoutSpacingClassMap,
} from "../shared/commonProps";

/**
 * List Schema
 *
 * Container for rendering arrays of data with filtering, sorting, and pagination.
 */
export const ListSchema = z.object({
    type: z.literal("List"),
    data_source: z.array(z.any()),
    item_alias: z.string(),
    render: z.array(z.any()),

    layout: z.enum(["col", "grid"]).default("col"),
    columns: z.number().min(1).max(6).optional(),
    spacing: SpacingSchema.default("md"),
    align_x: AlignSchema.optional(),
    align_y: AlignSchema.optional(),

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
    align_x?: z.infer<typeof AlignSchema>;
    align_y?: z.infer<typeof AlignSchema>;
    children: ReactNode;
}

export function List({
    layout = "col",
    columns = 2,
    spacing = "md",
    align_x,
    align_y,
    children,
}: ListComponentProps) {
    const spacingClass = layoutSpacingClassMap[spacing];

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
                className={`grid ${gridColsMap[columns] || gridColsMap[2]} ${spacingClass} w-full h-full min-h-0 ${
                    align_x ? justifyItemsClassMap[align_x] : ""
                } ${align_y ? contentAlignClassMap[align_y] : "content-start"}`}
            >
                {children}
            </div>
        );
    }

    return (
        <div
            className={`flex flex-col w-full h-full min-h-0 ${spacingClass} ${
                align_x ? itemsAlignClassMap[align_x] : ""
            } ${align_y ? justifyClassMap[align_y] : ""}`}
        >
            {children}
        </div>
    );
}
