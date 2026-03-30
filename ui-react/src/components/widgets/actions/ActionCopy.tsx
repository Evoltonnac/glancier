import { z } from "zod";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import {
    SizeSchema,
    ToneSchema,
    toneButtonClassMap,
    SemanticColorSchema,
    resolveSurfaceColorStyle,
} from "../shared/commonProps";

/**
 * Action.Copy Schema
 */
export const ActionCopySchema = z.object({
    type: z.literal("Action.Copy"),
    title: z.string(),
    text: z.string(),
    size: SizeSchema.default("md"),
    tone: ToneSchema.default("default"),
    color: SemanticColorSchema.optional(),
});

export type ActionCopyProps = z.infer<typeof ActionCopySchema>;

const sizeMap = {
    sm: "gap-1 px-2.5 py-1 text-xs",
    md: "gap-1.5 px-3 py-1.5 text-sm",
    lg: "gap-2 px-4 py-2 text-sm",
    xl: "gap-2 px-5 py-2.5 text-base",
};

const iconSizeMap = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-4 h-4",
    xl: "w-5 h-5",
};

export function ActionCopy({
    title,
    text,
    size = "md",
    tone = "default",
    color,
}: ActionCopyProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text:", err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={`inline-flex items-center rounded-md font-medium ${
                color ? "transition-opacity hover:opacity-90" : "transition-colors"
            } ${sizeMap[size]} ${color ? "" : toneButtonClassMap[tone]}`}
            style={resolveSurfaceColorStyle(color)}
        >
            {copied ? <Check className={iconSizeMap[size]} /> : <Copy className={iconSizeMap[size]} />}
            {copied ? "Copied!" : title}
        </button>
    );
}
