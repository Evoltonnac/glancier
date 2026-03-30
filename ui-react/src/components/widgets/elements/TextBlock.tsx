import { z } from "zod";
import {
    SizeSchema,
    ToneSchema,
    sizeTextClassMap,
    textAlignClassMap,
    toneTextClassMap,
    AlignSchema,
    SemanticColorSchema,
    resolveTextColorStyle,
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
    color: SemanticColorSchema.optional(),
    align_x: AlignSchema.default("start"),
    wrap: z.boolean().default(true),
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
    color,
    align_x = "start",
    wrap = true,
    max_lines,
}: TextBlockProps) {
    const displayText = text === null || text === undefined ? "" : String(text);

    const shouldClampLines = typeof max_lines === "number" && max_lines > 0;
    const wrapClass = shouldClampLines || wrap ? "break-words" : "whitespace-nowrap truncate";
    const clampStyle = shouldClampLines
        ? {
              display: "-webkit-box",
              WebkitBoxOrient: "vertical" as const,
              WebkitLineClamp: String(max_lines),
              overflow: "hidden",
          }
        : undefined;
    const colorStyle = resolveTextColorStyle(color);

    return (
        <div
            className={`${sizeTextClassMap[size]} ${weightMap[weight]} ${toneTextClassMap[tone]} ${textAlignClassMap[align_x]} ${wrapClass}`}
            style={{ ...clampStyle, ...colorStyle }}
        >
            {displayText}
        </div>
    );
}
