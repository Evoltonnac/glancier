# Glancier Frontend (React + TypeScript + Vite)

This is the frontend layer for **Glancier**, a high-density personal data aggregator. It is designed around the **Bento Grid** philosophy, focusing on providing a "surgical" view of your Metrics and Signals.

## Design Philosophy: Bento Grid

- **Modular Cards**: Each data source is represented as a **Bento Card** (Source Card).
- **Micro-Widgets**: Cards are composed of single-purpose widgets like `HeroMetric`, `ProgressBar`, and `MetricSignals`.
- **High Density**: Designed to maximize information display without clutter, following the Swiss Design aesthetic.

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** for fast HMR
- **Tailwind CSS** for surgical styling
- **shadcn/ui** for accessible primitives
- **Tauri v2** for the desktop bridge
- **Lucide React** for consistent iconography
- **Recharts** for trend visualization

## Component Guidelines

All frontend development must adhere to the rules in:
1. `docs/view_micro_widget_architecture.md`
2. `docs/custom_design_prompt.md`
3. `Agent.md` (AI Assistance Rules)

## Terminology

- **Metric**: Numeric data point (e.g., usage, balance).
- **Signal**: State data point (e.g., active, error, success).
- **Progress Bar**: Replaces legacy quota bars.
- **Bento Card**: Replaces legacy quota cards.
