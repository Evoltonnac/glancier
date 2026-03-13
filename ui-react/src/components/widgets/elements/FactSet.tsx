import { z } from "zod";
import {
    SpacingSchema,
    ToneSchema,
    spacingClassMap,
    toneTextClassMap,
} from "../shared/commonProps";

/**
 * FactSet Schema
 *
 * Structured key-value information display.
 */
export const FactSchema = z.object({
    label: z.union([z.string(), z.number()]),
    value: z.union([z.string(), z.number()]),
    tone: ToneSchema.optional(),
});

export const FactSetSchema = z.object({
    type: z.literal("FactSet"),
    facts: z.array(FactSchema),
    spacing: SpacingSchema.default("md"),
});

export type FactSetProps = z.infer<typeof FactSetSchema>;

export function FactSet({ facts, spacing = "md" }: FactSetProps) {
    return (
        <div className={`flex flex-col ${spacingClassMap[spacing]}`}>
            {facts.map(
                (
                    fact: {
                        label: string | number;
                        value: string | number;
                        tone?: z.infer<typeof ToneSchema>;
                    },
                    index: number,
                ) => (
                    <div key={index} className="flex justify-between items-baseline gap-4">
                        <span className="text-sm text-muted-foreground shrink-0">{fact.label}:</span>
                        <span
                            className={`text-sm font-medium text-right truncate ${toneTextClassMap[fact.tone || "default"]}`}
                        >
                            {fact.value}
                        </span>
                    </div>
                ),
            )}
        </div>
    );
}
