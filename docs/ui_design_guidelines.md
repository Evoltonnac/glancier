# UI Design Guidelines (High-Density Tech)

## Goal

Design a dense, reliable dashboard where **Metrics**, **Signals**, and **Integration Data** are the primary focus. Visual style should be precise, calm, and technical.

## Core Principles

- Maximum signal, minimum noise.
- Prefer density over empty space, but keep hierarchy clear.
- Use strict alignment and consistent spacing.
- Favor borders and contrast over heavy shadows.
- Keep copy, labels, and interactions direct.

## Motion and Interaction Feel

- Use smooth, short transitions (`150ms`-`200ms`).
- Prefer crossfade/state transitions over bounce/spring effects.
- Hover/focus/active states should be clear and low-noise.

## Visual System

### Theme and Contrast

- Support both light and dark modes with clear contrast.
- Avoid muddy mid-tone surfaces.
- Keep text readability as first priority.

### Data Emphasis

- Core values should be visually dominant (`text-3xl` to `text-5xl` as needed).
- Use `tabular-nums` for all changing numeric values.
- Use compact spacing (`p-3`, `p-4`, `gap-3`) to increase data density.

### Depth and Surfaces

- Primary depth model: `1px` borders + subtle surface shifts.
- Large emphasized areas may use subtle gradients.
- Keep glow/shadow effects minimal and only for status/focus cues.

### Status Color Usage

- Brand: primary emphasis and active state.
- Warning: near-limit or degraded state.
- Success: healthy state.
- Error: failures and destructive actions.
- Status colors should usually appear as accents, not full-surface blocks.

## Design Tokens

### Colors

- Background: `bg-background`
- Surface: `bg-surface`
- Muted: `bg-muted`, `text-muted-foreground`
- Border: `border-border`
- Brand: `text-brand`, `bg-brand`
- Status: `text-success`, `text-warning`, `text-error` (backgrounds typically with opacity)
- Semantic chart palette: `text-chart-blue`, `text-chart-orange`, `text-chart-green`, `text-chart-violet`, `text-chart-red`, `text-chart-cyan`, `text-chart-amber`, `text-chart-pink`, `text-chart-teal`, `text-chart-gold`, `text-chart-slate`, `text-chart-yellow`
- Chart widget `colors` config only accepts these 12 semantic names; raw hex, CSS variables, and native color values are not supported

### Typography

- Base font: Inter (or project default sans-serif).
- Numeric data: always `tabular-nums`.
- Micro labels: `text-xs`, uppercase, `tracking-wider`, `font-semibold`.
- Long values/text: truncate + tooltip.

### Radius

- Standard: `rounded-md` or `rounded-lg`
- Cards: `rounded-xl`
- Pills/nav items: `rounded-full`

## Component Rules

### Bento Card

- `BaseSourceCard` uses `bg-surface`, `border-border`, `rounded-xl`.
- Header (`qb-card-header`) is drag handle with stable height (`2.5rem`, ~40px at default root font size).
- Status indicator should be clear but subtle.
- Content area defaults to compact padding (`px-4 py-3`).

### Top Navigation

- Height: `h-16` (web) or `h-24` (Tauri with window padding).
- Active nav uses clear contrast inversion.
- Hover state should increase contrast without layout shift.

### Progress Bars

- Track: `bg-secondary` or `bg-muted`.
- Fill: thin (`h-1.5`), mapped to status color.
- Data changes may trigger a short highlight flash.

## Interaction Policy

1. Avoid layout shift for hover-revealed actions.
2. Keep clickable states obvious through contrast change.
3. Use `tabular-nums` to prevent metric jitter.
4. Add tooltips to icon-only buttons and truncated text.
5. Keep update animations brief and unobtrusive.
6. Hide global native scrollbars; keep Monaco editor scrollbar behavior intact.
