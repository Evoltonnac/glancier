import { WidgetConfig } from "../../types/config";
import { HeroMetric } from "./HeroMetric";
import { KeyValueGrid } from "./KeyValueGrid";
import { ProgressBar } from "./ProgressBar";
import { ListWidget } from "./ListWidget";

/**
 * Default row-span weight per widget type.
 * Each widget's flex share inside the card content area is proportional to this value.
 * The sum of all widgets' row_spans equals the card's total available height units.
 */
const DEFAULT_ROW_SPANS: Record<string, number> = {
    hero_metric: 2,
    progress_bar: 1,
    key_value_grid: 2,
    list: 2,
};

export function WidgetRenderer({
    widget,
    data,
}: {
    widget: WidgetConfig;
    data: Record<string, any>;
}) {
    const rowSpan = widget.row_span ?? DEFAULT_ROW_SPANS[widget.type] ?? 1;

    let content: React.ReactNode;
    switch (widget.type) {
        case "list":
            content = <ListWidget widget={widget as any} data={data} />;
            break;
        case "hero_metric":
            content = <HeroMetric widget={widget as any} data={data} />;
            break;
        case "key_value_grid":
            content = <KeyValueGrid widget={widget as any} data={data} />;
            break;
        case "progress_bar":
            content = <ProgressBar widget={widget as any} data={data} />;
            break;
        default:
            content = (
                <div className="text-xs text-red-500 mt-2">
                    Unknown widget type: {(widget as any).type}
                </div>
            );
    }

    return (
        <div
            className="flex flex-col min-h-0 overflow-hidden w-full h-full"
            style={{ flex: rowSpan }}
        >
            {content}
        </div>
    );
}
