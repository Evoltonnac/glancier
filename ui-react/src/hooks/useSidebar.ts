import { useStore } from "../store";

export function useSidebar() {
    const sidebarCollapsed = useStore((state) => state.sidebarCollapsed);
    const setSidebarCollapsed = useStore((state) => state.setSidebarCollapsed);
    const toggleSidebar = useStore((state) => state.toggleSidebar);

    return {
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
    };
}
