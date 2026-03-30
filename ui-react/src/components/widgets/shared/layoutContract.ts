export type WidgetLayoutCategory = "structural" | "content";

export interface WidgetLayoutMeta {
    category: WidgetLayoutCategory;
    minHeightRows: number;
    weight: number;
}

const DEFAULT_LAYOUT_META: WidgetLayoutMeta = {
    category: "structural",
    minHeightRows: 0,
    weight: 0,
};

const WIDGET_LAYOUT_META: Record<string, WidgetLayoutMeta> = {
    TextBlock: {
        category: "structural",
        minHeightRows: 0,
        weight: 0,
    },
    FactSet: {
        category: "structural",
        minHeightRows: 0,
        weight: 0,
    },
    ActionSet: {
        category: "structural",
        minHeightRows: 0,
        weight: 0,
    },
    Badge: {
        category: "structural",
        minHeightRows: 0,
        weight: 0,
    },
    Image: {
        category: "structural",
        minHeightRows: 0,
        weight: 0,
    },
    List: {
        category: "content",
        minHeightRows: 3,
        weight: 1,
    },
    Progress: {
        category: "content",
        minHeightRows: 2,
        weight: 1,
    },
    "Chart.Line": {
        category: "content",
        minHeightRows: 4,
        weight: 1,
    },
    "Chart.Bar": {
        category: "content",
        minHeightRows: 4,
        weight: 1,
    },
    "Chart.Area": {
        category: "content",
        minHeightRows: 4,
        weight: 1,
    },
    "Chart.Pie": {
        category: "content",
        minHeightRows: 4,
        weight: 1,
    },
    "Chart.Table": {
        category: "content",
        minHeightRows: 4,
        weight: 1,
    },
};

export function getWidgetLayoutMeta(widgetType: string): WidgetLayoutMeta {
    return WIDGET_LAYOUT_META[widgetType] ?? DEFAULT_LAYOUT_META;
}
