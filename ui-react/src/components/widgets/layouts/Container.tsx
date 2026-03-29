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
 * Container Schema
 *
 * Vertical flow layout container that stacks child items from top to bottom.
 */
export const ContainerSchema = z.object({
    type: z.literal("Container"),
    items: z.array(z.any()),
    spacing: SpacingSchema.default("md"),
    align_y: AlignSchema.default("start"),
    align_x: AlignSchema.optional(),
    height: LayoutSizeSchema.default("stretch"),
});

export type ContainerProps = z.infer<typeof ContainerSchema>;

interface ContainerComponentProps {
    spacing?: z.infer<typeof SpacingSchema>;
    align_y?: z.infer<typeof AlignSchema>;
    align_x?: z.infer<typeof AlignSchema>;
    height?: LayoutSize;
    children: ReactNode;
}

export function Container({
    spacing = "md",
    align_y = "start",
    align_x,
    height = "stretch",
    children,
}: ContainerComponentProps) {
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
            className={`flex flex-col min-h-0 w-full ${heightClass} ${layoutSpacingClassMap[spacing]} ${justifyClassMap[align_y]} ${
                align_x ? itemsAlignClassMap[align_x] : ""
            }`}
            style={style}
        >
            {children}
        </div>
    );
}
