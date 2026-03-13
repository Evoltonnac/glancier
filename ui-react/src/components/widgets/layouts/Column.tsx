import { z } from "zod";
import type { ReactNode } from "react";
import {
    AlignSchema,
    SpacingSchema,
    justifyClassMap,
    spacingClassMap,
} from "../shared/commonProps";

/**
 * Column Schema
 *
 * Single column within a ColumnSet. Defines width behavior and contains items.
 */
export const ColumnSchema = z.object({
    type: z.literal("Column"),
    items: z.array(z.any()),
    width: z
        .union([
            z.literal("auto"),
            z.literal("stretch"),
            z.number().positive(),
        ])
        .default("auto"),
    align_y: AlignSchema.default("start"),
    spacing: SpacingSchema.default("md"),
});

export type ColumnProps = z.infer<typeof ColumnSchema>;

interface ColumnComponentProps {
    width?: "auto" | "stretch" | number;
    align_y?: z.infer<typeof AlignSchema>;
    spacing?: z.infer<typeof SpacingSchema>;
    children: ReactNode;
}

export function Column({
    width = "auto",
    align_y = "start",
    spacing = "md",
    children,
}: ColumnComponentProps) {
    const widthClass =
        width === "auto" ? "flex-shrink-0" : width === "stretch" ? "flex-1" : "";

    const style = typeof width === "number" ? { flex: width } : undefined;

    return (
        <div
            className={`flex flex-col ${widthClass} ${spacingClassMap[spacing]} ${justifyClassMap[align_y]}`}
            style={style}
        >
            {children}
        </div>
    );
}
