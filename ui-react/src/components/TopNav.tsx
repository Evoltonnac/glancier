import { Link, useNavigate, useLocation } from "react-router-dom";
import { Settings, LayoutDashboard, Blocks } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";

import { AppHeader } from "./AppHeader";

const LogoIcon = ({ className }: { className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="15 15 70 70"
        className={className}
    >
        <defs>
            <linearGradient id="sparkGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0055FF" />
                <stop offset="50%" stopColor="#00D4FF" />
                <stop offset="100%" stopColor="#00FFD1" />
            </linearGradient>
        </defs>
        <path
            d="M 29 15 L 54 15 A 3 3 0 0 1 57 18 L 57 54 A 3 3 0 0 1 54 57 L 18 57 A 3 3 0 0 1 15 54 L 15 29 A 14 14 0 0 1 29 15 Z"
            fill="currentColor"
        />
        <path
            d="M 18 63 L 54 63 A 3 3 0 0 1 57 66 L 57 82 A 3 3 0 0 1 54 85 L 29 85 A 14 14 0 0 1 15 71 L 15 66 A 3 3 0 0 1 18 63 Z"
            fill="currentColor"
        />
        <path
            d="M 66 43 L 82 43 A 3 3 0 0 1 85 46 L 85 71 A 14 14 0 0 1 71 85 L 66 85 A 3 3 0 0 1 63 82 L 63 46 A 3 3 0 0 1 66 43 Z"
            fill="currentColor"
        />
        <path
            d="M 74 15 Q 74 26 63 26 Q 74 26 74 37 Q 74 26 85 26 Q 74 26 74 15 Z"
            fill="url(#sparkGrad)"
        />
    </svg>
);

export function TopNav() {
    const navigate = useNavigate();
    const location = useLocation();

    if (location.pathname === "/settings") {
        return null;
    }

    const isHomeActive = location.pathname === "/";
    const isIntegrationsActive = location.pathname.startsWith("/integrations");

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
                    <Link to="/" className="flex items-center gap-2 group">
                        <div className="flex items-center justify-center text-foreground group-hover:text-foreground/70 transition-colors duration-200">
                            <LogoIcon className="w-8 h-8 drop-shadow-sm" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold leading-none tracking-tight">
                                Glancier
                            </h1>
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
                                    <Link
                                        to="/"
                                        className={navItemClass(false)}
                                    >
                                        <LayoutDashboard className="w-4 h-4 shrink-0" />
                                        <span className="sr-only">
                                            全部看板
                                        </span>
                                    </Link>
                                </TooltipTrigger>
                                <TooltipContent sideOffset={8}>
                                    <p>全部看板</p>
                                </TooltipContent>
                            </Tooltip>
                        )}

                        {isIntegrationsActive ? (
                            <Link
                                to="/integrations"
                                className={navItemClass(true)}
                            >
                                <Blocks className="w-4 h-4 shrink-0" />
                                <span className="text-sm">集成管理</span>
                            </Link>
                        ) : (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Link
                                        to="/integrations"
                                        className={navItemClass(false)}
                                    >
                                        <Blocks className="w-4 h-4 shrink-0" />
                                        <span className="sr-only">
                                            集成管理
                                        </span>
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
