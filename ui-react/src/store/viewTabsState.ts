import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { StoredView } from "../types/config";
import { mergeOrderedViewIds, resolveActiveViewId } from "../pages/dashboardViewTabs";

interface ViewTabsState {
    activeViewId: string | null;
    orderedViewIds: string[];
    setActiveViewId(id: string | null): void;
    setOrderedViewIds(ids: string[]): void;
    syncWithViews(views: StoredView[]): {
        activeViewId: string | null;
        orderedViewIds: string[];
    };
    // Dual-mode state: single view mode vs management mode
    viewMode: "single" | "management";
    setViewMode: (mode: "single" | "management") => void;
    selectedDashboardId: string | null;
    setSelectedDashboardId: (id: string | null) => void;
}

export const useViewTabsState = create<ViewTabsState>()(
    persist(
        (set, get) => ({
            activeViewId: null,
            orderedViewIds: [],
            setActiveViewId: (id) => set({ activeViewId: id }),
            setOrderedViewIds: (ids) => set({ orderedViewIds: ids }),
            syncWithViews(views: StoredView[]) {
                const state = get();
                const orderedViewIds = mergeOrderedViewIds(
                    views,
                    state.orderedViewIds,
                );
                const activeViewId = resolveActiveViewId(
                    views,
                    state.activeViewId,
                );
                set({ activeViewId, orderedViewIds });
                return { activeViewId, orderedViewIds };
            },
            // Dual-mode state
            viewMode: "single" as const,
            setViewMode: (mode) => set({ viewMode: mode }),
            selectedDashboardId: null,
            setSelectedDashboardId: (id) => set({ selectedDashboardId: id }),
        }),
        {
            name: "glanceus-dashboard-view-tabs-v1",
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                activeViewId: state.activeViewId,
                orderedViewIds: state.orderedViewIds,
                viewMode: state.viewMode,
                selectedDashboardId: state.selectedDashboardId,
            }),
        },
    ),
);
