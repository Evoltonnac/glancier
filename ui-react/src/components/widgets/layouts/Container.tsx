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
});

export type ContainerProps = z.infer<typeof ContainerSchema>;

interface ContainerComponentProps {
    spacing?: z.infer<typeof SpacingSchema>;
    align_y?: z.infer<typeof AlignSchema>;
    align_x?: z.infer<typeof AlignSchema>;
    children: ReactNode;
}

export function Container({
    spacing = "md",
    align_y = "start",
    align_x,
    children,
}: ContainerComponentProps) {
    return (
        <div
            className={`flex flex-col flex-grow shrink-0 basis-auto min-h-0 w-full ${layoutSpacingClassMap[spacing]} ${justifyClassMap[align_y]} ${
                align_x ? itemsAlignClassMap[align_x] : ""
            }`}
        >
            {children}
        </div>
    );
}
