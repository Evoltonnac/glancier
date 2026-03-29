import { z } from "zod";
import {
    SizeSchema,
    ToneSchema,
    toneProgressClassMap,
    SemanticColorSchema,
    resolveSemanticColor,
} from "../shared/commonProps";

/**
 * Progress Schema
 */
export const ProgressSchema = z.object({
    type: z.literal("Progress"),
    value: z.coerce.number().min(0).max(100),
    label: z.union([z.string(), z.number()]).optional(),
    style: z.enum(["bar", "ring"]).default("bar"),
    size: SizeSchema.default("md"),
    tone: ToneSchema.optional(),
    color: SemanticColorSchema.optional(),
    show_percentage: z.boolean().default(true),
    thresholds: z
        .object({
            warning: z.coerce.number().min(0).max(100).default(70),
            danger: z.coerce.number().min(0).max(100).default(90),
        })
        .optional(),
});

export type ProgressProps = z.infer<typeof ProgressSchema>;

const ringConfigMap = {
    sm: { box: "w-16 h-16", text: "text-sm", r: 26, c: 32, stroke: 6 },
    md: { box: "w-24 h-24", text: "text-lg", r: 40, c: 48, stroke: 8 },
    lg: { box: "w-32 h-32", text: "text-xl", r: 54, c: 64, stroke: 10 },
    xl: { box: "w-40 h-40", text: "text-2xl", r: 68, c: 80, stroke: 12 },
};

const barHeightMap = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
    xl: "h-4",
};

function getAutoTone(
    value: number,
    thresholds?: { warning: number; danger: number },
): z.infer<typeof ToneSchema> {
    if (!thresholds) return "info";
    if (value >= thresholds.danger) return "danger";
    if (value >= thresholds.warning) return "warning";
    return "success";
}

export function Progress({
    value,
    label,
    style = "bar",
    size = "md",
    tone,
    color,
    show_percentage = true,
    thresholds,
}: ProgressProps) {
    const resolvedTone = color ? undefined : tone || getAutoTone(value, thresholds);
    const progressColorClass = resolvedTone
        ? toneProgressClassMap[resolvedTone]
        : undefined;
    const colorValue = color ? resolveSemanticColor(color) : undefined;

    if (style === "ring") {
        const ring = ringConfigMap[size];
        const circumference = 2 * Math.PI * ring.r;
        const offset = circumference - (value / 100) * circumference;

        return (
            <div className="flex flex-col items-center qb-gap-2">
                <div className={`relative ${ring.box}`}>
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx={ring.c}
                            cy={ring.c}
                            r={ring.r}
                            stroke="currentColor"
                            strokeWidth={ring.stroke}
                            fill="none"
                            className="text-gray-200 dark:text-gray-800"
                        />
                        <circle
                            cx={ring.c}
                            cy={ring.c}
                            r={ring.r}
                            stroke="currentColor"
                            strokeWidth={ring.stroke}
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={offset}
                            strokeLinecap="round"
                            className={progressColorClass?.replace("bg-", "text-")}
                            style={colorValue ? { color: colorValue } : undefined}
                        />
                    </svg>
                    {show_percentage && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`${ring.text} font-semibold`}>{value}%</span>
                        </div>
                    )}
                </div>
                {label && <span className="text-sm text-muted-foreground">{label}</span>}
            </div>
        );
    }

    return (
        <div className="flex flex-col qb-gap-1 w-full">
            {(label || show_percentage) && (
                <div className="flex justify-between items-baseline">
                    {label && <span className="text-sm text-muted-foreground">{label}</span>}
                    {show_percentage && <span className="text-sm font-medium">{value}%</span>}
                </div>
            )}
            <div
                className={`w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden ${barHeightMap[size]}`}
            >
                <div
                    className={`h-full ${progressColorClass || ""} transition-all duration-300`}
                    style={{
                        width: `${value}%`,
                        ...(colorValue ? { backgroundColor: colorValue } : {}),
                    }}
                />
            </div>
        </div>
    );
}
