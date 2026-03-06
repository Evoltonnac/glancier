export * from "./config";

// Common UI Types
export type StatusColor = "success" | "info" | "warning" | "error" | "disabled";

export interface TrendData {
    value: number;
    label?: string;
    isPositive?: boolean;
}

// Layout Types
export interface GridLayout {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    maxW?: number;
    minH?: number;
    maxH?: number;
}
