import { z } from "zod";

export const SEMANTIC_COLORS = [
    "blue",
    "orange",
    "green",
    "violet",
    "red",
    "cyan",
    "amber",
    "pink",
    "teal",
    "gold",
    "slate",
    "yellow",
] as const;

export const SemanticColorSchema = z.enum(SEMANTIC_COLORS);
export type SemanticColor = z.infer<typeof SemanticColorSchema>;

const SEMANTIC_COLOR_TOKEN_MAP: Record<SemanticColor, string> = {
    blue: "hsl(var(--chart-blue))",
    orange: "hsl(var(--chart-orange))",
    green: "hsl(var(--chart-green))",
    violet: "hsl(var(--chart-violet))",
    red: "hsl(var(--chart-red))",
    cyan: "hsl(var(--chart-cyan))",
    amber: "hsl(var(--chart-amber))",
    pink: "hsl(var(--chart-pink))",
    teal: "hsl(var(--chart-teal))",
    gold: "hsl(var(--chart-gold))",
    slate: "hsl(var(--chart-slate))",
    yellow: "hsl(var(--chart-yellow))",
};

export function resolveSemanticColor(color: SemanticColor): string {
    return SEMANTIC_COLOR_TOKEN_MAP[color];
}
