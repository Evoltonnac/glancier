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
 * ColumnSet Schema
 *
 * Horizontal layout container that divides space into multiple columns.
 * Can only contain Column components as direct children.
 */
export const ColumnSetSchema = z.object({
    type: z.literal("ColumnSet"),
    columns: z.array(z.any()),
    spacing: SpacingSchema.default("md"),
    align_x: AlignSchema.default("start"),
    align_y: AlignSchema.optional(),
    height: LayoutSizeSchema.default("auto"),
});

export type ColumnSetProps = z.infer<typeof ColumnSetSchema>;

interface ColumnSetComponentProps {
    spacing?: z.infer<typeof SpacingSchema>;
    align_x?: z.infer<typeof AlignSchema>;
    align_y?: z.infer<typeof AlignSchema>;
    height?: LayoutSize;
    children: ReactNode;
}

export function ColumnSet({
    spacing = "md",
    align_x = "start",
    align_y,
    height = "auto",
    children,
}: ColumnSetComponentProps) {
    const heightClass =
        height === "auto"
            ? "flex-shrink-0"
            : height === "stretch"
              ? "flex-grow shrink-0 basis-auto"
              : "";

    const style: CSSProperties =
        typeof height === "number" ? { flex: `${height} 0 auto` } : {};

    return (
        <div
            className={`flex flex-row min-h-0 w-full ${heightClass} ${layoutSpacingClassMap[spacing]} ${justifyClassMap[align_x]} ${
                align_y ? itemsAlignClassMap[align_y] : ""
            }`}
            style={style}
        >
            {children}
        </div>
    );
}
