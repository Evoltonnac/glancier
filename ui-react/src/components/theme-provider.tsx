import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
    children: React.ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
};

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
    children,
    defaultTheme = "system",
    ...props
}: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>(defaultTheme);

    // Load from backend on mount
    useEffect(() => {
        api.getSettings()
            .then((settings) => {
                if (settings.theme) {
                    setThemeState(settings.theme as Theme);
                }
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove("light", "dark");

        if (theme === "system") {
            const systemTheme = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches
                ? "dark"
                : "light";
            root.classList.add(systemTheme);
            return;
        }

        root.classList.add(theme);
    }, [theme]);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        // Also update backend asynchronously
        api.getSettings()
            .then((settings) => {
                api.updateSettings({ ...settings, theme: newTheme });
            })
            .catch(console.error);
    };

    return (
        <ThemeProviderContext.Provider {...props} value={{ theme, setTheme }}>
            {children}
        </ThemeProviderContext.Provider>
    );
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext);
    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider");
    return context;
};
