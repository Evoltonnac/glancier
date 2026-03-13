import { z } from "zod";
import {
    SizeSchema,
    ToneSchema,
    sizeTextClassMap,
    textAlignClassMap,
    toneTextClassMap,
    AlignSchema,
} from "../shared/commonProps";

/**
 * TextBlock Schema
 *
 * Universal text component for character-based information.
 */
export const TextBlockSchema = z.object({
    type: z.literal("TextBlock"),
    text: z.union([z.string(), z.number(), z.boolean()]),
    size: SizeSchema.default("md"),
    weight: z.enum(["normal", "medium", "semibold", "bold"]).default("normal"),
    tone: ToneSchema.default("default"),
    align_x: AlignSchema.default("start"),
    wrap: z.boolean().default(true),
    maxLines: z.number().positive().optional(),
    max_lines: z.number().positive().optional(),
});

export type TextBlockProps = z.infer<typeof TextBlockSchema>;

const weightMap = {
    normal: "font-normal",
    medium: "font-medium",
    semibold: "font-semibold",
    bold: "font-bold",
};

export function TextBlock({
    text,
    size = "md",
    weight = "normal",
    tone = "default",
    align_x = "start",
    wrap = true,
    maxLines,
    max_lines,
}: TextBlockProps) {
    const resolvedMaxLines = maxLines ?? max_lines;
    const displayText = text === null || text === undefined ? "" : String(text);

    const shouldClampLines = typeof resolvedMaxLines === "number" && resolvedMaxLines > 0;
    const wrapClass = shouldClampLines || wrap ? "break-words" : "whitespace-nowrap truncate";
    const clampStyle = shouldClampLines
        ? {
              display: "-webkit-box",
              WebkitBoxOrient: "vertical" as const,
              WebkitLineClamp: String(resolvedMaxLines),
              overflow: "hidden",
          }
        : undefined;

    return (
        <div
            className={`${sizeTextClassMap[size]} ${weightMap[weight]} ${toneTextClassMap[tone]} ${textAlignClassMap[align_x]} ${wrapClass}`}
            style={clampStyle}
        >
            {displayText}
        </div>
    );
}
