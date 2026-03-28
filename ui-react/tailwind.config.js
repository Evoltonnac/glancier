/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                surface: "hsl(var(--surface))",
                brand: "hsl(var(--brand))",
                warning: "hsl(var(--warning))",
                success: "hsl(var(--success))",
                error: "hsl(var(--error))",
                chart: {
                    blue: "hsl(var(--chart-blue))",
                    teal: "hsl(var(--chart-teal))",
                    green: "hsl(var(--chart-green))",
                    cyan: "hsl(var(--chart-cyan))",
                    yellow: "hsl(var(--chart-yellow))",
                    gold: "hsl(var(--chart-gold))",
                    orange: "hsl(var(--chart-orange))",
                    amber: "hsl(var(--chart-amber))",
                    red: "hsl(var(--chart-red))",
                    violet: "hsl(var(--chart-violet))",
                    pink: "hsl(var(--chart-pink))",
                    slate: "hsl(var(--chart-slate))",
                },
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
            },
            borderRadius: {
                xl: "12px",
                lg: "8px",
                md: "6px",
                sm: "4px",
            },
            boxShadow: {
                "soft-elevation":
                    "0 2px 4px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.06), 0 8px 16px rgba(0,0,0,0.06)",
            },
        },
    },
    plugins: [],
};
