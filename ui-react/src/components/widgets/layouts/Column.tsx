import { z } from "zod";
import type { ReactNode, CSSProperties } from "react";
import {
    AlignSchema,
    SpacingSchema,
    justifyClassMap,
    itemsAlignClassMap,
    layoutSpacingClassMap,
    LayoutSizeSchema,
    type LayoutSize,
} from "../shared/commonProps";

/**
 * Column Schema
 *
 * Single column within a ColumnSet. Defines width behavior and contains items.
 */
export const ColumnSchema = z.object({
    type: z.literal("Column"),
    items: z.array(z.any()),
    width: LayoutSizeSchema.default("auto"),
    height: LayoutSizeSchema.default("auto"),
    align_y: AlignSchema.default("start"),
    spacing: SpacingSchema.default("md"),
    align_x: AlignSchema.optional(),
});

export type ColumnProps = z.infer<typeof ColumnSchema>;

interface ColumnComponentProps {
    width?: LayoutSize;
    height?: LayoutSize;
    align_y?: z.infer<typeof AlignSchema>;
    spacing?: z.infer<typeof SpacingSchema>;
    align_x?: z.infer<typeof AlignSchema>;
    children: ReactNode;
}

export function Column({
    width = "auto",
    height = "auto",
    align_y = "start",
    spacing = "md",
    align_x,
    children,
}: ColumnComponentProps) {
    const widthClass =
        width === "auto"
            ? "flex-shrink-0"
            : width === "stretch"
              ? "flex-1 min-w-0"
              : "";

    const heightClass =
        height === "auto" ? "h-auto" : height === "stretch" ? "h-full" : "";

    const style: CSSProperties = {
        ...(typeof width === "number" ? { flex: `${width} 0 auto` } : {}),
        ...(typeof height === "number" ? { height: `${height}px` } : {}),
    };

    return (
        <div
            className={`flex flex-col ${widthClass} ${heightClass} ${layoutSpacingClassMap[spacing]} ${justifyClassMap[align_y]} ${
                align_x ? itemsAlignClassMap[align_x] : ""
            }`}
            style={style}
        >
            {children}
        </div>
    );
}
