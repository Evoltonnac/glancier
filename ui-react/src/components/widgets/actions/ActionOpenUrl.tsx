import { z } from "zod";
import { ExternalLink } from "lucide-react";
import { openExternalLink } from "../../../lib/utils";
import {
    SizeSchema,
    ToneSchema,
    toneButtonClassMap,
    SemanticColorSchema,
    resolveSurfaceColorStyle,
} from "../shared/commonProps";

/**
 * Action.OpenUrl Schema
 */
export const ActionOpenUrlSchema = z.object({
    type: z.literal("Action.OpenUrl"),
    title: z.string(),
    url: z.string().url(),
    size: SizeSchema.default("md"),
    tone: ToneSchema.default("default"),
    color: SemanticColorSchema.optional(),
});

export type ActionOpenUrlProps = z.infer<typeof ActionOpenUrlSchema>;

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

export function ActionOpenUrl({
    title,
    url,
    size = "md",
    tone = "default",
    color,
}: ActionOpenUrlProps) {
    const handleClick = () => {
        openExternalLink(url);
    };

    return (
        <button
            onClick={handleClick}
            className={`inline-flex items-center rounded-md font-medium ${
                color ? "transition-opacity hover:opacity-90" : "transition-colors"
            } ${sizeMap[size]} ${color ? "" : toneButtonClassMap[tone]}`}
            style={resolveSurfaceColorStyle(color)}
        >
            {title}
            <ExternalLink className={iconSizeMap[size]} />
        </button>
    );
}
