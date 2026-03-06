import * as React from "react";
import { cn } from "../../lib/utils";

interface BentoWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    icon?: React.ReactNode;
    subtitle?: string;
    variant?: "default" | "outline" | "ghost";
    headerAction?: React.ReactNode;
}

export function BentoWidget({
    title,
    icon,
    subtitle,
    variant = "default",
    headerAction,
    className,
    children,
    ...props
}: BentoWidgetProps) {
    return (
        <div
            className={cn(
                "rounded-xl p-4 flex flex-col gap-3 transition-all duration-300",
                variant === "default" && "bg-surface/40 border border-border/50 hover:bg-surface/60",
                variant === "outline" && "border border-border bg-transparent",
                variant === "ghost" && "bg-transparent",
                className,
            )}
            {...props}
        >
            {(title || icon || headerAction) && (
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        {icon && (
                            <div className="p-1.5 rounded-lg bg-brand/10 text-brand">
                                {icon}
                            </div>
                        )}
                        <div className="flex flex-col">
                            {title && (
                                <h3 className="text-sm font-semibold tracking-tight">
                                    {title}
                                </h3>
                            )}
                            {subtitle && (
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                    {subtitle}
                                </p>
                            )}
                        </div>
                    </div>
                    {headerAction && (
                        <div className="flex-shrink-0">{headerAction}</div>
                    )}
                </div>
            )}
            <div className="flex-1 flex flex-col min-h-0">{children}</div>
        </div>
    );
}
