import { z } from "zod";
import type { ReactNode } from "react";
import {
    AlignSchema,
    SpacingSchema,
    justifyClassMap,
    spacingClassMap,
} from "../shared/commonProps";

/**
 * ActionSet Schema
 */
export const ActionSetSchema = z.object({
    type: z.literal("ActionSet"),
    actions: z.array(z.any()),
    align_x: AlignSchema.default("start"),
    spacing: SpacingSchema.default("md"),
});

export type ActionSetProps = z.infer<typeof ActionSetSchema>;

interface ActionSetComponentProps {
    align_x?: z.infer<typeof AlignSchema>;
    spacing?: z.infer<typeof SpacingSchema>;
    children: ReactNode;
}

export function ActionSet({
    align_x = "start",
    spacing = "md",
    children,
}: ActionSetComponentProps) {
    return (
        <div
            className={`flex flex-row items-center ${justifyClassMap[align_x]} ${spacingClassMap[spacing]}`}
        >
            {children}
        </div>
    );
}
