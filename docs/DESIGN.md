# Design System: Glanceus

## 1. Visual Theme & Atmosphere

**Dense, Technical Dashboard** — A high-density information dashboard optimized for displaying metrics, signals, and integration data. The aesthetic is precise, calm, and utilitarian with a focus on data legibility over decorative elements. The interface prioritizes maximum signal with minimum noise, using strict alignment, consistent spacing, and borders over shadows for depth.

---

## 2. Color Palette & Roles

### Light Mode

| Token | Hex (approx) | Role |
|-------|-------------|------|
| `--background` | `#FAFAFA` | Page background |
| `--foreground` | `#262626` | Primary text |
| `--surface` | `#F5F5F5` | Card surfaces |
| `--muted` | `#EDEEF0` | Subtle backgrounds |
| `--muted-foreground` | `#757575` | Secondary text |
| `--border` | `#E5E5E5` | Dividers, outlines |
| `--primary` | `#171717` | Primary actions (dark) |
| `--primary-foreground` | `#FAFAFA` | Text on primary |
| `--secondary` | `#E6F5FA` | Secondary surfaces |
| `--secondary-foreground` | `#003366` | Text on secondary |
| `--accent` | `#E6F5FA` | Accent surfaces |
| `--accent-foreground` | `#003366` | Text on accent |
| `--destructive` | `#DC2626` | Error/destructive |

**Semantic Colors (Light & Dark)**

| Token | Light Hex | Dark Hex | Role |
|-------|-----------|----------|------|
| `--brand` | `#00BBD3` (Cyan) | `#00C4E0` | Primary brand, focus rings |
| `--warning` | `#F97316` (Orange) | `#F97316` | Warning states |
| `--success` | `#22C55E` (Emerald) | `#22C55E` | Healthy/active states |
| `--error` | `#DC2626` (Red) | `#DC2626` | Failures, destructive |

---

## 3. Typography Rules

- **Font Family**: Inter (with system-ui, Avenir, Helvetica, Arial fallbacks)
- **Font Smoothing**: `antialiased`, `-moz-osx-font-smoothing: grayscale`
- **Numeric Display**: Always use `tabular-nums` for changing metric values to prevent jitter
- **Card Labels**: `text-xs uppercase tracking-wider font-semibold` for micro labels
- **Body Text**: Default Inter at `text-sm` with `text-muted-foreground` for secondary content
- **Headers**: `text-lg font-semibold leading-none tracking-tight`

---

## 4. Component Stylings

### Buttons

- **Shape**: `rounded-md` (medium rounded corners)
- **Variants**:
  - `default`: Dark fill (`bg-primary`), white text, hover darkens
  - `brand`: Animated gradient fill (`bg-brand-gradient`), white text, subtle shadow
  - `destructive`: Red fill (`bg-destructive`)
  - `outline`: Border only, transparent bg, hover fills with muted
  - `secondary`: Ghost-like, transparent with muted text, hover shows muted bg
  - `ghost`: Fully transparent, muted text, hover shows muted bg
  - `link`: Text-only with underline on hover
- **Sizes**: `h-9` (default), `h-8 sm`, `h-10 lg`, `h-9 w-9 icon`
- **Focus**: Cyan ring with `focus-visible:ring-brand/50 focus-visible:ring-offset-2`

### Cards / Containers

- **Shape**: `rounded-xl` (generously rounded corners)
- **Background**: `bg-surface` with subtle `border-border`
- **Depth**: Hover state adds `hover:border-foreground/20 hover:shadow-soft-elevation` with 150ms transition
- **Header**: Fixed `2.5rem` height acting as drag handle (`qb-card-header`), cursor changes `grab` → `grabbing`
- **Padding**: Internal card padding uses CSS variables `qb-card-pad-x: 0.75rem`, `qb-card-pad-y: 0.5rem`
- **Status Indicator**: Small pill (`w-[4px] h-3 rounded-full`) in top-left corner with colored glow shadows

### Inputs / Forms

- **Border Style**: `border border-input` with `rounded-md`
- **Background**: Transparent in ghost contexts, `bg-background` for opaque contexts
- **Focus State**: Cyan ring via `focus-visible:ring-brand/50`

### Progress Bars

- **Track**: `bg-secondary` or `bg-muted`
- **Fill**: Thin `h-1.5` bar mapped to status color
- **Animation**: Short highlight flash on data changes

### Navigation

- **Top Nav Height**: `h-16` (web), `h-24` (Tauri with padding)
- **Active State**: Clear contrast inversion
- **Hover**: Contrast increase without layout shift

### Badges / Pills

- **Shape**: `rounded-full` for status pills, `rounded-md` for badges
- **Status Colors**: Use semantic colors with opacity backgrounds and matching `shadow-[0_0_8px_hsl(var(--color)/0.5)]` glow

---

## 5. Layout Principles

### Grid System

- **Grid Row Height**: `60px` (defined in CSS variable `--qb-row-height`)
- **Grid Gap**: `0.75rem` between grid items
- **Card Margin**: `0.25rem` inside grid items via GridStack

### Spacing Scale

Uses density-aware CSS variables multiplied by `--qb-density`:

| Token | Value (1x) |
|-------|-----------|
| `--qb-gap-1` | `0.25rem` |
| `--qb-gap-2` | `0.5rem` |
| `--qb-gap-3` | `0.75rem` |
| `--qb-gap-4` | `1rem` |
| `--qb-gap-5` | `1.25rem` |
| `--qb-gap-6` | `1.5rem` |

### Density Presets

Three density modes controlled via `[data-density]` attribute:

- `compact`: `--qb-density: 0.5`
- `normal`: `--qb-density: 0.75`
- `relaxed`: `--qb-density: 1`

### Scrollbar Policy

- Global native scrollbars hidden: `-ms-overflow-style: none; scrollbar-width: none`
- Monaco Editor scrollbars preserved and styled: `width: 10px; height: 10px`

### Motion & Transitions

- **Duration**: Short, unobtrusive (`150ms` to `200ms`)
- **Easing**: Smooth `ease` transitions
- **Type**: Crossfade/state transitions preferred over bounce/spring effects
- **Focus Rings**: Fade in smoothly via `focus-visible` states

---

## 6. Dark Mode

Dark mode inverts the palette with muted surfaces and higher contrast text:

- **Background**: `hsl(240, 5%, 12%)` (Zinc 900)
- **Surface**: `hsl(240, 5%, 16%)` (slightly lighter)
- **Border**: `hsl(240, 3.7%, 20%)`
- **Text**: `hsl(0, 0%, 90%)` (off-white)
- **Brand Ring**: Brighter cyan `hsl(190, 100%, 60%)`

---

## 7. Visual Assets

### Brand Gradient

```css
.bg-brand-gradient {
  background: linear-gradient(135deg, hsl(var(--brand)), hsl(210, 100%, 50%));
  background-size: 200% 200%;
  animation: gradientFlow 8s ease infinite;
}
```

### Delete Button Overlay

- Position: `top-0.375rem right-0.375rem`
- Size: `28px × 28px` with `border-radius: 8px`
- Background: `rgba(239, 68, 68, 0.12)` with hover brightening
- Visibility: Hidden (`opacity: 0`) until parent `.group/card:hover` reveals it

### Background Accent

Subtle radial gradient in bottom-right: `radial-gradient(circle at 85% 100%, hsl(40 100% 50% / 0.08), transparent 40%)`
