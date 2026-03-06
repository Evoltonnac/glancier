import { create } from "zustand";
import {
    StoredView,
    SourceSummary,
    DataResponse,
} from "../types/config";
import { api } from "../api/client";

interface AppState {
    // UI State
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
    toggleSidebar: () => void;

    // Data State
    viewConfig: StoredView | null;
    setViewConfig: (view: StoredView | null) => void;
    sources: SourceSummary[];
    setSources: (sources: SourceSummary[]) => void;
    dataMap: Record<string, DataResponse>;
    setDataMap: (dataMap: Record<string, DataResponse> | ((prev: Record<string, DataResponse>) => Record<string, DataResponse>)) => void;
    loading: boolean;
    setLoading: (loading: boolean) => void;

    // Interaction State
    interactSource: SourceSummary | null;
    setInteractSource: (source: SourceSummary | null) => void;
    isAddDialogOpen: boolean;
    setIsAddDialogOpen: (open: boolean) => void;
    deletingSourceId: string | null;
    setDeletingSourceId: (id: string | null) => void;

    // Scraper State
    activeScraper: string | null;
    setActiveScraper: (id: string | null) => void;
    skippedScrapers: Set<string>;
    setSkippedScrapers: (ids: Set<string>) => void;
    addSkippedScraper: (id: string) => void;
    clearSkippedScrapers: () => void;

    // Integrations Page State
    integrationsSelectedFile: string | null;
    setIntegrationsSelectedFile: (file: string | null) => void;
    integrationsSidebarCollapsed: boolean;
    setIntegrationsSidebarCollapsed: (collapsed: boolean) => void;

    // Actions
    loadData: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
    // UI State
    sidebarCollapsed: false,
    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

    // Data State
    viewConfig: null,
    setViewConfig: (viewConfig) => set({ viewConfig }),
    sources: [],
    setSources: (sources) => set({ sources }),
    dataMap: {},
    setDataMap: (dataMap) =>
        set((state) => ({
            dataMap: typeof dataMap === "function" ? dataMap(state.dataMap) : dataMap,
        })),
    loading: true,
    setLoading: (loading) => set({ loading }),

    // Interaction State
    interactSource: null,
    setInteractSource: (interactSource) => set({ interactSource }),
    isAddDialogOpen: false,
    setIsAddDialogOpen: (isAddDialogOpen) => set({ isAddDialogOpen }),
    deletingSourceId: null,
    setDeletingSourceId: (deletingSourceId) => set({ deletingSourceId }),

    // Scraper State
    activeScraper: null,
    setActiveScraper: (activeScraper) => set({ activeScraper }),
    skippedScrapers: new Set(),
    setSkippedScrapers: (skippedScrapers) => set({ skippedScrapers }),
    addSkippedScraper: (id) =>
        set((state) => {
            const next = new Set(state.skippedScrapers);
            next.add(id);
            return { skippedScrapers: next };
        }),
    clearSkippedScrapers: () => set({ skippedScrapers: new Set() }),

    // Integrations Page State
    integrationsSelectedFile: null,
    setIntegrationsSelectedFile: (integrationsSelectedFile) => set({ integrationsSelectedFile }),
    integrationsSidebarCollapsed: false,
    setIntegrationsSidebarCollapsed: (integrationsSidebarCollapsed) => set({ integrationsSidebarCollapsed }),

    // Actions
    loadData: async () => {
        const { dataMap, viewConfig } = get();
        // Guard against UI wipeout when navigating back to Dashboard:
        // Only set loading to true if we genuinely have no initial data.
        if (!viewConfig || Object.keys(dataMap).length === 0) {
            set({ loading: true });
        }
        try {
            const [views, sourcesData] = await Promise.all([
                api.getViews(),
                api.getSources(),
            ]);

            const activeView = views.length > 0 ? views[0] : null;

            const dataPromises = sourcesData.map((s) =>
                api
                    .getSourceData(s.id)
                    .then((data: any) => ({ id: s.id, data })),
            );
            const results = await Promise.all(dataPromises);
            const newDataMap: Record<string, DataResponse> = {};
            results.forEach(({ id, data }) => {
                newDataMap[id] = data;
            });

            set({
                viewConfig: activeView,
                sources: sourcesData,
                dataMap: newDataMap,
                loading: false,
            });
        } catch (error) {
            console.error("加载数据失败:", error);
            set({ loading: false });
        }
    },
}));
