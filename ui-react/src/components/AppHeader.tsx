import { useCallback } from "react";
import type { ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "../lib/utils";

interface AppHeaderProps {
    children?: ReactNode;
    className?: string;
    contentClassName?: string;
}

// Interactive elements that should NOT trigger window dragging
const INTERACTIVE_SELECTORS =
    "button, a, input, select, textarea, [role='button'], [data-no-drag]";

export function AppHeader({
    children,
    className = "",
    contentClassName = "flex items-center justify-between w-full",
}: AppHeaderProps) {
    const inTauri = isTauri();
    const isMacTauri =
        inTauri &&
        typeof navigator !== "undefined" &&
        /mac|darwin/i.test(navigator.userAgent);
    const containerClasses = isMacTauri ? "h-24 pt-6" : "h-16";

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (!inTauri) return;
            // Only trigger drag on primary (left) mouse button
            if (e.button !== 0) return;

            // Check if the click target or any of its ancestors (up to the header) is interactive
            const target = e.target as HTMLElement;
            if (target.closest(INTERACTIVE_SELECTORS)) return;

            // Prevent text selection during drag
            e.preventDefault();

            getCurrentWindow().startDragging();
        },
        [inTauri],
    );

    return (
        <header
            onMouseDown={handleMouseDown}
            className={`${containerClasses} flex-shrink-0 border-b border-border px-6 bg-background/80 backdrop-blur-md z-50 flex items-center ${className}`}
        >
            <div className={`${contentClassName}`}>{children}</div>
        </header>
    );
}
