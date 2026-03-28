import { z } from "zod";
import type { ReactNode } from "react";
import {
    AlignSchema,
    SpacingSchema,
    justifyClassMap,
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
});

export type ContainerProps = z.infer<typeof ContainerSchema>;

interface ContainerComponentProps {
    spacing?: z.infer<typeof SpacingSchema>;
    align_y?: z.infer<typeof AlignSchema>;
    children: ReactNode;
}

export function Container({
    spacing = "md",
    align_y = "start",
    children,
}: ContainerComponentProps) {
    return (
        <div
            className={`flex flex-col flex-1 min-h-0 w-full ${layoutSpacingClassMap[spacing]} ${justifyClassMap[align_y]}`}
        >
            {children}
        </div>
    );
}
