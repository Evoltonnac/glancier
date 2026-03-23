import type { StoredView } from "../types/config";

export const DASHBOARD_VISIBLE_TAB_CAP = 6;

const COLLAPSE_WHITESPACE_PATTERN = /\s+/g;

function normalizeCap(cap: number | undefined): number {
    if (!Number.isFinite(cap) || cap === undefined) {
        return DASHBOARD_VISIBLE_TAB_CAP;
    }
    return Math.max(1, Math.trunc(cap));
}

function clampIndex(index: number, max: number): number {
    if (!Number.isFinite(index)) {
        return max;
    }
    return Math.min(max, Math.max(0, Math.trunc(index)));
}

function buildUniqueOrderedIds(ids: string[]): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const id of ids) {
        if (!seen.has(id)) {
            seen.add(id);
            unique.push(id);
        }
    }
    return unique;
}

function normalizeNameForComparison(rawName: string): string {
    return normalizeViewNameInput(rawName).toLocaleLowerCase();
}

function buildCaseInsensitiveNameSet(existingNames: string[]): Set<string> {
    const normalized = existingNames
        .map((name) => normalizeNameForComparison(name))
        .filter((name) => name.length > 0);
    return new Set(normalized);
}

function isCaseInsensitiveNameTaken(
    existingNameSet: Set<string>,
    candidateName: string,
): boolean {
    return existingNameSet.has(normalizeNameForComparison(candidateName));
}

function resolveInsertIndex(
    zoneIds: string[],
    dropTargetViewId: string | null,
    dropIndex: number,
): number {
    if (Number.isFinite(dropIndex)) {
        return clampIndex(dropIndex, zoneIds.length);
    }

    if (!dropTargetViewId) {
        return zoneIds.length;
    }

    const targetIndex = zoneIds.indexOf(dropTargetViewId);
    if (targetIndex < 0) {
        return zoneIds.length;
    }
    return targetIndex;
}

export function normalizeViewNameInput(rawName: string): string {
    return rawName.trim().replace(COLLAPSE_WHITESPACE_PATTERN, " ");
}

export function resolveActiveViewId(
    views: StoredView[],
    persistedActiveViewId: string | null,
): string | null {
    if (views.length === 0) {
        return null;
    }

    const availableViewIds = new Set(views.map((view) => view.id));
    if (
        persistedActiveViewId !== null &&
        availableViewIds.has(persistedActiveViewId)
    ) {
        return persistedActiveViewId;
    }

    return views[0].id;
}

export function mergeOrderedViewIds(
    views: StoredView[],
    persistedOrderedIds: string[],
): string[] {
    const availableViewIds = new Set(views.map((view) => view.id));
    const mergedOrderedIds: string[] = [];
    const seen = new Set<string>();

    for (const persistedId of persistedOrderedIds) {
        if (availableViewIds.has(persistedId) && !seen.has(persistedId)) {
            seen.add(persistedId);
            mergedOrderedIds.push(persistedId);
        }
    }

    for (const view of views) {
        if (!seen.has(view.id)) {
            seen.add(view.id);
            mergedOrderedIds.push(view.id);
        }
    }

    return mergedOrderedIds;
}

export function splitVisibleAndOverflowViewIds(
    orderedViewIds: string[],
    cap?: number,
): { visibleViewIds: string[]; overflowViewIds: string[] } {
    const effectiveCap = normalizeCap(cap);
    const uniqueOrderedIds = buildUniqueOrderedIds(orderedViewIds);

    return {
        visibleViewIds: uniqueOrderedIds.slice(0, effectiveCap),
        overflowViewIds: uniqueOrderedIds.slice(effectiveCap),
    };
}

export function createIndexedViewName(
    existingNames: string[],
    baseLabel: string,
): string {
    const normalizedBaseLabel = normalizeViewNameInput(baseLabel) || "New View";
    const existingNameSet = buildCaseInsensitiveNameSet(existingNames);

    if (!isCaseInsensitiveNameTaken(existingNameSet, normalizedBaseLabel)) {
        return normalizedBaseLabel;
    }

    let suffix = 1;
    while (true) {
        const candidate = `${normalizedBaseLabel} ${suffix}`;
        if (!isCaseInsensitiveNameTaken(existingNameSet, candidate)) {
            return candidate;
        }
        suffix += 1;
    }
}

export function buildReorderedViewIds(params: {
    orderedViewIds: string[];
    draggedViewId: string;
    dropTargetViewId: string | null;
    dropZone: "visible" | "overflow";
    dropIndex: number;
    cap?: number;
}): string[] {
    const effectiveCap = normalizeCap(params.cap);
    const uniqueOrderedIds = buildUniqueOrderedIds(params.orderedViewIds);
    if (!uniqueOrderedIds.includes(params.draggedViewId)) {
        return uniqueOrderedIds;
    }

    const orderedWithoutDragged = uniqueOrderedIds.filter(
        (viewId) => viewId !== params.draggedViewId,
    );
    const splitWithoutDragged = splitVisibleAndOverflowViewIds(
        orderedWithoutDragged,
        effectiveCap,
    );

    const destinationZoneIds =
        params.dropZone === "visible"
            ? [...splitWithoutDragged.visibleViewIds]
            : [...splitWithoutDragged.overflowViewIds];
    const insertIndex = resolveInsertIndex(
        destinationZoneIds,
        params.dropTargetViewId,
        params.dropIndex,
    );
    destinationZoneIds.splice(insertIndex, 0, params.draggedViewId);

    const recombinedIds =
        params.dropZone === "visible"
            ? [...destinationZoneIds, ...splitWithoutDragged.overflowViewIds]
            : [...splitWithoutDragged.visibleViewIds, ...destinationZoneIds];

    const finalSplit = splitVisibleAndOverflowViewIds(recombinedIds, effectiveCap);
    return [...finalSplit.visibleViewIds, ...finalSplit.overflowViewIds];
}
