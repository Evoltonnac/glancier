import { z } from "zod";
import type { ReactNode } from "react";
import {
    AlignSchema,
    SpacingSchema,
    justifyClassMap,
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
});

export type ColumnSetProps = z.infer<typeof ColumnSetSchema>;

interface ColumnSetComponentProps {
    spacing?: z.infer<typeof SpacingSchema>;
    align_x?: z.infer<typeof AlignSchema>;
    children: ReactNode;
}

export function ColumnSet({
    spacing = "md",
    align_x = "start",
    children,
}: ColumnSetComponentProps) {
    return (
        <div
            className={`flex flex-row flex-1 min-h-0 w-full ${layoutSpacingClassMap[spacing]} ${justifyClassMap[align_x]}`}
        >
            {children}
        </div>
    );
}
