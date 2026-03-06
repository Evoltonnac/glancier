import * as React from "react";
import { cn } from "../../lib/utils";
import { Card } from "./card";
import { StatusColor, TrendData } from "../../types";

interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
    value?: string | number;
    description?: string;
    icon?: React.ReactNode;
    statusColor?: StatusColor;
    trend?: TrendData;
}

const statusColorMap: Record<string, string> = {
    success: "bg-success shadow-[0_0_8px_hsl(var(--success)/0.5)]",
    info: "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse",
    warning: "bg-warning shadow-[0_0_8px_hsl(var(--warning)/0.5)]",
    error: "bg-error shadow-[0_0_8px_hsl(var(--error)/0.5)]",
    disabled: "bg-muted-foreground opacity-50",
};

export function MetricCard({
    title,
    value,
    description,
    icon,
    statusColor,
    trend,
    className,
    children,
    ...props
}: MetricCardProps) {
    const statusClass = statusColor ? statusColorMap[statusColor] : null;

    return (
        <Card
            className={cn(
                "bg-surface border-border flex flex-col relative overflow-hidden hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150",
                className,
            )}
            {...props}
        >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 h-10 border-b border-border/40 bg-transparent relative">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {icon && <span className="text-muted-foreground">{icon}</span>}
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold truncate">
                        {title}
                    </span>
                </div>
                {statusClass && (
                    <div
                        className={cn(
                            "absolute left-2 top-1/2 -translate-y-1/2 w-[4px] h-3 rounded-full flex-shrink-0 transition-all duration-500",
                            statusClass,
                        )}
                    />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col px-4 py-3 bg-surface/50">
                {value !== undefined && (
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold tracking-tight">
                            {value}
                        </span>
                        {trend && (
                            <span
                                className={cn(
                                    "text-xs font-medium",
                                    trend.isPositive ? "text-success" : "text-error",
                                )}
                            >
                                {trend.isPositive ? "+" : "-"}
                                {Math.abs(trend.value)}
                                {trend.label && ` ${trend.label}`}
                            </span>
                        )}
                    </div>
                )}
                {description && (
                    <p className="text-xs text-muted-foreground mt-1">
                        {description}
                    </p>
                )}
                <div className="mt-2 flex-1">{children}</div>
            </div>
        </Card>
    );
}
