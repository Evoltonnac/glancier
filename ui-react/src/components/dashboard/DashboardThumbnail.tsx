import { useMemo } from "react";
import type { StoredView, ViewItem } from "../../types/config";
import { cn } from "../../lib/utils";

interface DashboardThumbnailProps {
    view: StoredView;
    className?: string;
}

/** Determine widget type from ViewItem */
function getWidgetType(item: ViewItem): string {
    const templateId = item.template_id?.toLowerCase() ?? "";
    const propsType = String(item.props?.type ?? "").toLowerCase();
    if (templateId.includes("chart") || templateId === "source_card" || propsType === "chart") {
        return "chart";
    }
    if (templateId.includes("list") || propsType === "list") {
        return "list";
    }
    if (templateId.includes("timeline") || propsType === "timeline") {
        return "timeline";
    }
    if (templateId.includes("map") || propsType === "map") {
        return "map";
    }
    if (templateId.includes("badge") || propsType === "badge") {
        return "badge";
    }
    if (templateId.includes("progress") || propsType === "progress") {
        return "progress";
    }
    return "default";
}

/** SVG: blue bar chart with 3 bars */
function ChartSkeleton() {
    return (
        <svg viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
            {/* Background bars */}
            <rect x="8" y="28" width="14" height="16" rx="2" fill="#e5e7eb" />
            <rect x="28" y="18" width="14" height="26" rx="2" fill="#e5e7eb" />
            <rect x="48" y="22" width="14" height="22" rx="2" fill="#e5e7eb" />
            {/* Blue highlight bar */}
            <rect x="48" y="22" width="14" height="10" rx="2" fill="#3b82f6" fillOpacity="0.5" />
            {/* Axis line */}
            <line x1="4" y1="44" x2="76" y2="44" stroke="#d1d5db" strokeWidth="1" />
        </svg>
    );
}

/** SVG: gray lines with dot bullets */
function ListSkeleton() {
    return (
        <svg viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
            {/* Dot bullets */}
            <circle cx="10" cy="12" r="2" fill="#9ca3af" />
            <circle cx="10" cy="24" r="2" fill="#9ca3af" />
            <circle cx="10" cy="36" r="2" fill="#9ca3af" />
            {/* Lines */}
            <rect x="18" y="10" width="52" height="4" rx="2" fill="#e5e7eb" />
            <rect x="18" y="22" width="44" height="4" rx="2" fill="#e5e7eb" />
            <rect x="18" y="34" width="36" height="4" rx="2" fill="#e5e7eb" />
        </svg>
    );
}

/** SVG: vertical line with circle nodes */
function TimelineSkeleton() {
    return (
        <svg viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
            {/* Vertical line */}
            <line x1="16" y1="8" x2="16" y2="40" stroke="#d1d5db" strokeWidth="2" />
            {/* Circle nodes */}
            <circle cx="16" cy="12" r="4" fill="#e5e7eb" />
            <circle cx="16" cy="24" r="4" fill="#e5e7eb" />
            <circle cx="16" cy="36" r="4" fill="#e5e7eb" />
            {/* Horizontal connectors */}
            <line x1="20" y1="12" x2="32" y2="12" stroke="#d1d5db" strokeWidth="1" strokeDasharray="2 2" />
            <line x1="20" y1="24" x2="40" y2="24" stroke="#d1d5db" strokeWidth="1" strokeDasharray="2 2" />
            <line x1="20" y1="36" x2="36" y2="36" stroke="#d1d5db" strokeWidth="1" strokeDasharray="2 2" />
            {/* Content blocks */}
            <rect x="32" y="9" width="38" height="6" rx="2" fill="#e5e7eb" />
            <rect x="40" y="21" width="30" height="6" rx="2" fill="#e5e7eb" />
            <rect x="36" y="33" width="34" height="6" rx="2" fill="#e5e7eb" />
        </svg>
    );
}

/** SVG: gray rectangle with map-like outline */
function MapSkeleton() {
    return (
        <svg viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
            {/* Map background */}
            <rect x="8" y="6" width="64" height="36" rx="4" fill="#f3f4f6" />
            {/* Map outline / regions */}
            <path
                d="M8 20 L24 12 L40 18 L56 10 L72 16 L72 34 L56 42 L40 36 L24 42 L8 34 Z"
                fill="none"
                stroke="#d1d5db"
                strokeWidth="1.5"
            />
            {/* Location dots */}
            <circle cx="24" cy="22" r="3" fill="#9ca3af" />
            <circle cx="48" cy="24" r="3" fill="#9ca3af" />
            <circle cx="36" cy="32" r="3" fill="#9ca3af" />
        </svg>
    );
}

/** SVG: small colored rounded rectangles (badges) */
function BadgeSkeleton() {
    return (
        <svg viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
            {/* Badge row 1 */}
            <rect x="8" y="12" width="20" height="8" rx="4" fill="#fee2e2" />
            <rect x="34" y="12" width="16" height="8" rx="4" fill="#fef3c7" />
            <rect x="56" y="12" width="18" height="8" rx="4" fill="#d1fae5" />
            {/* Badge row 2 */}
            <rect x="8" y="28" width="14" height="8" rx="4" fill="#dbeafe" />
            <rect x="28" y="28" width="22" height="8" rx="4" fill="#fee2e2" />
            <rect x="56" y="28" width="16" height="8" rx="4" fill="#f3f4f6" />
        </svg>
    );
}

/** SVG: horizontal progress bar */
function ProgressSkeleton() {
    return (
        <svg viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
            {/* Track */}
            <rect x="8" y="20" width="64" height="8" rx="4" fill="#e5e7eb" />
            {/* Fill */}
            <rect x="8" y="20" width="40" height="8" rx="4" fill="#3b82f6" fillOpacity="0.5" />
            {/* Label lines */}
            <rect x="8" y="34" width="24" height="4" rx="2" fill="#e5e7eb" />
            <rect x="56" y="34" width="16" height="4" rx="2" fill="#e5e7eb" />
        </svg>
    );
}

/** SVG: generic grid placeholder */
function DefaultSkeleton() {
    return (
        <svg viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
            {/* Grid cells */}
            <rect x="8" y="8" width="30" height="14" rx="2" fill="#e5e7eb" />
            <rect x="42" y="8" width="30" height="14" rx="2" fill="#e5e7eb" />
            <rect x="8" y="26" width="20" height="14" rx="2" fill="#e5e7eb" />
            <rect x="32" y="26" width="40" height="14" rx="2" fill="#e5e7eb" />
        </svg>
    );
}

/** Empty dashboard placeholder */
function EmptySkeleton() {
    return (
        <svg viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="size-full">
            {/* Dashed border rectangle */}
            <rect
                x="10"
                y="10"
                width="60"
                height="28"
                rx="4"
                fill="none"
                stroke="#d1d5db"
                strokeWidth="1.5"
                strokeDasharray="4 2"
            />
            {/* Plus icon */}
            <line x1="40" y1="20" x2="40" y2="28" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="36" y1="24" x2="44" y2="24" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

/** Get skeleton component for widget type */
function getSkeletonComponent(type: string) {
    switch (type) {
        case "chart":
            return ChartSkeleton;
        case "list":
            return ListSkeleton;
        case "timeline":
            return TimelineSkeleton;
        case "map":
            return MapSkeleton;
        case "badge":
            return BadgeSkeleton;
        case "progress":
            return ProgressSkeleton;
        default:
            return DefaultSkeleton;
    }
}

export function DashboardThumbnail({ view, className }: DashboardThumbnailProps) {
    const items = useMemo(
        () =>
            [...(view.items ?? [])]
                .sort((a, b) => (a.y - b.y) || (a.x - b.x))
                .slice(0, 12),
        [view.items],
    );

    if (items.length === 0) {
        return (
            <div
                className={cn(
                    "relative aspect-[16/9] overflow-hidden rounded-xl border border-border/60 bg-muted/40 p-2",
                    className,
                )}
            >
                <EmptySkeleton />
            </div>
        );
    }

    return (
        <div
            className={cn(
                "relative aspect-[16/9] overflow-hidden rounded-xl border border-border/60 bg-muted/30 p-2",
                className,
            )}
        >
            <div className="grid h-full w-full grid-cols-12 grid-rows-12 gap-0.5 rounded-lg bg-background/80 p-0.5">
                {items.map((item) => {
                    const SkeletonComponent = getSkeletonComponent(getWidgetType(item));
                    const colStart = Math.min(item.x + 1, 12);
                    const colSpan = Math.max(1, Math.min(item.w, 12 - item.x));
                    const rowStart = Math.min(item.y + 1, 12);
                    const rowSpan = Math.max(1, Math.min(item.h, 12 - item.y));

                    return (
                        <div
                            key={item.id}
                            className="overflow-hidden rounded-md border border-border/40 bg-muted/70 p-0.5"
                            style={{
                                gridColumn: `${colStart} / span ${colSpan}`,
                                gridRow: `${rowStart} / span ${rowSpan}`,
                            }}
                        >
                            <SkeletonComponent />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
