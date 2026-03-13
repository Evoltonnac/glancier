import { z } from "zod";
import {
    SizeSchema,
    ToneSchema,
    toneBadgeClassMap,
} from "../shared/commonProps";

/**
 * Badge Schema
 */
export const BadgeSchema = z.object({
    type: z.literal("Badge"),
    text: z.union([z.string(), z.number()]),
    tone: ToneSchema.default("default"),
    size: SizeSchema.default("md"),
});

export type BadgeProps = z.infer<typeof BadgeSchema>;

const sizeMap = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-0.5 text-xs",
    lg: "px-2.5 py-1 text-sm",
    xl: "px-3 py-1 text-sm",
};

export function Badge({ text, tone = "default", size = "md" }: BadgeProps) {
    return (
        <span
            className={`inline-flex items-center rounded-md font-medium ${sizeMap[size]} ${toneBadgeClassMap[tone]}`}
        >
            {text}
        </span>
    );
}
