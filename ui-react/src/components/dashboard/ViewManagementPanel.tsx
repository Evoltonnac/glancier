import { useEffect, useState } from "react";

import type { StoredView } from "../../types/config";

interface ViewManagementPanelProps {
    views: StoredView[];
    activeViewId: string | null;
    onSelectView(viewId: string): void;
    onCreateView(): void;
    onRenameView(viewId: string, nextName: string): void;
    onDeleteView(viewId: string): void;
    title: string;
    createLabel: string;
    renamePlaceholder: string;
    deleteLabel: string;
}

export default function ViewManagementPanel({
    views,
    activeViewId,
    onSelectView,
    onCreateView,
    onRenameView,
    onDeleteView,
    title,
    createLabel,
    renamePlaceholder,
    deleteLabel,
}: ViewManagementPanelProps) {
    const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
    const isDeleteBlocked = views.length <= 1;

    useEffect(() => {
        setRenameDrafts((current) => {
            const next: Record<string, string> = {};
            for (const view of views) {
                next[view.id] = current[view.id] ?? view.name;
            }
            return next;
        });
    }, [views]);

    const updateDraft = (viewId: string, value: string) => {
        setRenameDrafts((current) => ({
            ...current,
            [viewId]: value,
        }));
    };

    const commitRename = (view: StoredView) => {
        const draft = renameDrafts[view.id] ?? view.name;
        onRenameView(view.id, draft);
    };

    return (
        <section className="rounded-lg border border-border bg-surface/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{title}</h3>
                <button
                    type="button"
                    data-testid="dashboard-view-create"
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                    onClick={onCreateView}
                >
                    {createLabel}
                </button>
            </div>
            <ol className="space-y-2">
                {views.map((view) => (
                    <li
                        key={view.id}
                        data-testid={`dashboard-view-row-${view.id}`}
                        className={`flex items-center gap-2 rounded-md border px-2 py-2 ${
                            activeViewId === view.id
                                ? "border-brand/60 bg-brand/5"
                                : "border-border bg-background/60"
                        }`}
                    >
                        <button
                            type="button"
                            className="max-w-[180px] shrink truncate text-left text-sm font-medium"
                            title={view.name}
                            onClick={() => onSelectView(view.id)}
                        >
                            {view.name}
                        </button>
                        <input
                            type="text"
                            data-testid={`dashboard-view-rename-${view.id}`}
                            value={renameDrafts[view.id] ?? view.name}
                            onChange={(event) =>
                                updateDraft(view.id, event.target.value)
                            }
                            onBlur={() => commitRename(view)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    commitRename(view);
                                } else if (event.key === "Escape") {
                                    event.preventDefault();
                                    updateDraft(view.id, view.name);
                                }
                            }}
                            className="h-8 min-w-0 flex-1 rounded border border-border bg-background px-2 text-sm"
                            placeholder={renamePlaceholder}
                        />
                        <button
                            type="button"
                            data-testid={`dashboard-view-delete-${view.id}`}
                            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => onDeleteView(view.id)}
                            disabled={isDeleteBlocked}
                        >
                            {deleteLabel}
                        </button>
                    </li>
                ))}
            </ol>
        </section>
    );
}
