import { Link, useNavigate, useLocation } from "react-router-dom";
import { api } from "../api/client";
import {
    Activity,
    RefreshCw,
    Settings,
    LayoutDashboard,
    Blocks,
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";

import { AppHeader } from "./AppHeader";

export function TopNav() {
    const navigate = useNavigate();
    const location = useLocation();

    if (location.pathname === "/settings") {
        return null;
    }

    const isHomeActive = location.pathname === "/";
    const isIntegrationsActive = location.pathname.startsWith("/integrations");

    const handleRefreshAll = async () => {
        try {
            await api.refreshAll();
            window.dispatchEvent(new CustomEvent("app:refresh_data"));
        } catch (error) {
            console.error("刷新失败:", error);
        }
    };

    const navItemClass = (isActive: boolean) =>
        `inline-flex items-center justify-center h-9 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${
            isActive
                ? "bg-foreground text-background font-medium rounded-full px-4 gap-2 shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground rounded-full w-9 px-0"
        }`;

    const actionButtonClass =
        "inline-flex items-center justify-center h-9 w-9 rounded-md transition-colors duration-150 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";

    return (
        <TooltipProvider>
            <AppHeader>
                {/* Left: Brand & Nav */}
                <div className="flex items-center gap-8">
                    <Link to="/" className="flex items-center gap-3">
                            <div className="p-2 bg-brand/15 rounded-lg border border-brand/20">
                                <Activity className="w-5 h-5 text-brand" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold leading-none tracking-tight">
                                    Quota Board
                                </h1>
                                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">
                                    资源总览
                                </p>
                            </div>
                        </Link>

                        {/* Middle: Navigation Tabs (heavier, pill-style) */}
                        <nav className="hidden md:flex items-center space-x-1 bg-muted/40 p-1 rounded-full border border-border/50">
                            {isHomeActive ? (
                                <Link to="/" className={navItemClass(true)}>
                                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                                    <span className="text-sm">全部看板</span>
                                </Link>
                            ) : (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Link to="/" className={navItemClass(false)}>
                                            <LayoutDashboard className="w-4 h-4 shrink-0" />
                                            <span className="sr-only">全部看板</span>
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent sideOffset={8}>
                                        <p>全部看板</p>
                                    </TooltipContent>
                                </Tooltip>
                            )}

                            {isIntegrationsActive ? (
                                <Link to="/integrations" className={navItemClass(true)}>
                                    <Blocks className="w-4 h-4 shrink-0" />
                                    <span className="text-sm">集成管理</span>
                                </Link>
                            ) : (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Link to="/integrations" className={navItemClass(false)}>
                                            <Blocks className="w-4 h-4 shrink-0" />
                                            <span className="sr-only">集成管理</span>
                                        </Link>
                                    </TooltipTrigger>
                                    <TooltipContent sideOffset={8}>
                                        <p>集成管理</p>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </nav>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleRefreshAll}
                                    className={actionButtonClass}
                                    aria-label="全部刷新"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>重新获取所有数据源的配额数据</p>
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => navigate("/settings")}
                                    className={actionButtonClass}
                                    aria-label="系统设置"
                                >
                                    <Settings className="w-4 h-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>系统设置</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
            </AppHeader>
        </TooltipProvider>
    );
}
