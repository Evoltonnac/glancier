import { z } from "zod";
import type { ReactNode } from "react";
import {
    AlignSchema,
    SpacingSchema,
    justifyClassMap,
    itemsAlignClassMap,
    layoutSpacingClassMap,
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
});

export type ColumnSetProps = z.infer<typeof ColumnSetSchema>;

interface ColumnSetComponentProps {
    spacing?: z.infer<typeof SpacingSchema>;
    align_x?: z.infer<typeof AlignSchema>;
    align_y?: z.infer<typeof AlignSchema>;
    children: ReactNode;
}

export function ColumnSet({
    spacing = "md",
    align_x = "start",
    align_y,
    children,
}: ColumnSetComponentProps) {
    return (
        <div
            className={`flex flex-row flex-grow shrink-0 basis-auto min-h-0 w-full ${layoutSpacingClassMap[spacing]} ${justifyClassMap[align_x]} ${
                align_y ? itemsAlignClassMap[align_y] : ""
            }`}
        >
            {children}
        </div>
    );
}
