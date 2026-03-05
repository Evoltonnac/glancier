import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { api } from "../api/client";
import {
    Activity,
    RefreshCw,
    Settings,
    LayoutDashboard,
    Blocks,
} from "lucide-react";
import { Button } from "./ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";

export function TopNav() {
    const navigate = useNavigate();
    const location = useLocation();

    if (location.pathname === "/settings") {
        return null;
    }

    const handleRefreshAll = async () => {
        try {
            await api.refreshAll();
            window.dispatchEvent(new CustomEvent("app:refresh_data"));
        } catch (error) {
            console.error("刷新失败:", error);
        }
    };

    return (
        <header className="flex-shrink-0 border-b border-border px-6 py-3 bg-background z-50">
            <div className="flex items-center justify-between">
                {/* Left: Brand */}
                <div className="flex items-center gap-6">
                    <Link to="/" className="flex items-center gap-3 mr-4">
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

                    {/* Middle: Navigation Tabs */}
                    <nav className="hidden md:flex items-center space-x-1">
                        <NavLink
                            to="/"
                            className={({ isActive }) =>
                                `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActive
                                        ? "bg-muted text-foreground"
                                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                }`
                            }
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            全部看板
                        </NavLink>
                        <NavLink
                            to="/integrations"
                            className={({ isActive }) =>
                                `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    isActive
                                        ? "bg-muted text-foreground"
                                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                }`
                            }
                        >
                            <Blocks className="w-4 h-4" />
                            集成管理
                        </NavLink>
                    </nav>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRefreshAll}
                                    className="h-8"
                                >
                                    <RefreshCw className="w-4 h-4 md:mr-2" />
                                    <span className="hidden md:inline">
                                        全部刷新
                                    </span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>重新获取所有数据源的配额数据</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9"
                                    onClick={() => navigate("/settings")}
                                >
                                    <Settings className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>系统设置</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>
        </header>
    );
}
