import { z } from "zod";

export const SpacingSchema = z.enum(["none", "sm", "md", "lg"]);
export type Spacing = z.infer<typeof SpacingSchema>;

export const SizeSchema = z.enum(["sm", "md", "lg", "xl"]);
export type Size = z.infer<typeof SizeSchema>;

export const ToneSchema = z.enum([
    "default",
    "muted",
    "info",
    "success",
    "warning",
    "danger",
]);
export type Tone = z.infer<typeof ToneSchema>;

export const AlignSchema = z.enum(["start", "center", "end"]);
export type Align = z.infer<typeof AlignSchema>;

export const spacingClassMap: Record<Spacing, string> = {
    none: "gap-0",
    sm: "gap-2",
    md: "gap-4",
    lg: "gap-6",
};

export const justifyClassMap: Record<Align, string> = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
};

export const textAlignClassMap: Record<Align, string> = {
    start: "text-left",
    center: "text-center",
    end: "text-right",
};

export const sizeTextClassMap: Record<Size, string> = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
    xl: "text-3xl",
};

export const sizeImageClassMap: Record<Size, string> = {
    sm: "w-6 h-6",
    md: "w-10 h-10",
    lg: "w-16 h-16",
    xl: "w-24 h-24",
};

export const toneTextClassMap: Record<Tone, string> = {
    default: "text-foreground",
    muted: "text-muted-foreground",
    info: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-error",
};

export const toneBadgeClassMap: Record<Tone, string> = {
    default: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    muted: "bg-muted text-muted-foreground",
    info: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    success:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    warning:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    danger: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export const toneButtonClassMap: Record<Tone, string> = {
    default:
        "bg-gray-100 hover:bg-gray-200 text-gray-900 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-100",
    muted:
        "bg-muted hover:bg-muted/80 text-muted-foreground border border-border/70",
    info: "bg-brand hover:bg-brand/90 text-white",
    success: "bg-success hover:bg-success/90 text-white",
    warning: "bg-warning hover:bg-warning/90 text-white",
    danger: "bg-error hover:bg-error/90 text-white",
};

export const toneProgressClassMap: Record<Tone, string> = {
    default: "bg-secondary",
    muted: "bg-muted",
    info: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-error",
};
