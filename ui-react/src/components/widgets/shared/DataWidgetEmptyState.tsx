import { DatabaseZap } from "lucide-react";

import { EmptyState } from "../../EmptyState";
import { useI18n } from "../../../i18n";

type DataWidgetKind = "chart" | "list";

interface DataWidgetEmptyStateProps {
    kind: DataWidgetKind;
}

export function DataWidgetEmptyState({
    kind,
}: DataWidgetEmptyStateProps) {
    const { t } = useI18n();

    return (
        <EmptyState
            icon={<DatabaseZap className="h-6 w-6" />}
            title={t(`widget.empty.${kind}.title`)}
            description={t(`widget.empty.${kind}.description`)}
            className="min-h-0 h-full p-4"
        />
    );
}
