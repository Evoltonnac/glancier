import * as React from "react";
import { cn } from "../../lib/utils";

export const MicroLabel = React.forwardRef<
    HTMLSpanElement,
    React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
    <span
        ref={ref}
        className={cn(
            "text-xs text-muted-foreground uppercase tracking-wider font-semibold",
            className,
        )}
        {...props}
    />
));
MicroLabel.displayName = "MicroLabel";

export const MetricNumber = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight tabular-nums text-foreground",
            className,
        )}
        {...props}
    />
));
MetricNumber.displayName = "MetricNumber";

export interface ThinProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
    value: number; // 0 to 100
    max?: number;
    variant?: "brand" | "warning" | "success" | "error" | "default";
}

export const ThinProgressBar = React.forwardRef<
    HTMLDivElement,
    ThinProgressBarProps
>(({ value, max = 100, variant = "default", className, ...props }, ref) => {
    const percentage = Math.min(
        100,
        Math.max(0, max > 0 ? (value / max) * 100 : 0),
    );

    let fillClass = "bg-primary";
    switch (variant) {
        case "brand":
            fillClass = "bg-brand";
            break;
        case "warning":
            fillClass = "bg-warning";
            break;
        case "success":
            fillClass = "bg-success";
            break;
        case "error":
            fillClass = "bg-error";
            break;
        case "default":
        default:
            fillClass = "bg-primary";
            break;
    }

    return (
        <div
            ref={ref}
            className={cn(
                "w-full bg-muted rounded-full h-1.5 overflow-hidden",
                className,
            )}
            {...props}
        >
            <div
                className={cn(
                    "h-full rounded-full transition-all duration-300 ease-in-out",
                    fillClass,
                )}
                style={{ width: `${percentage}%` }}
            />
        </div>
    );
});
ThinProgressBar.displayName = "ThinProgressBar";
