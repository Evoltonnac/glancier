# Phase 8: UI Refactoring - Research

**Researched:** 2026-03-02
**Domain:** Frontend UI/UX, Component Refactoring, TailwindCSS, React
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Baseline Components**: Completely rewrite `TopNav`, `BaseSourceCard`, `QuotaBar` from scratch using new Design System tokens. Discard old styles.
- **Long Data Handling**: For exceptionally long numbers/text, strictly use **Truncate + Tooltip**.
- **Preview & Coexistence**: Proceed with a direct mixed preview on the main dashboard alongside un-refactored components.
- **Grid Gap**: Use a moderate gap of `12px` (`gap-3`) by default. Architecture should account for future layout toggles.
- **TopNav Design**: Standard height of approximately `64px`.
- **Card Padding**: Use evenly distributed, compact padding (`p-4` or `p-5`).
- **Responsive Behavior**: Single column on narrow screens with adaptive height (content-driven).
- **Iconography**: Use icons instead of text to save space. Always use tooltips to provide text descriptions.
- **Hover States**: Buttons/clickable areas must use a classic contrast inversion on hover (150ms transition).
- **Non-intrusive Action Peek**: Card hover reveals absolute positioned action bar (no layout shifts).
- **Menu Depth**: Avoid click-to-open secondary menus unless necessary; use hover-slide-out or inline.
- **Soft Elevation**: Apply a multi-layered soft Z-axis `box-shadow` on card hover (exception to the "No Shadows" rule).
- **Focus & Accessibility**: Use purple focus ring (`ring-2 ring-brand/50`).
- **Data Update Animation**: Brief background color flash on numeric area, smooth restore.
- **Limit/Warning States**: Change color to red/orange when quota hits threshold (no pulse animations).
- **Tokens/Theme**: Map new design tokens (colors, tabular-nums, spacing) into Tailwind config and CSS variables (`ui-react/src/index.css`).

### Claude's Discretion
- Implementation details of the CSS variable mapping and specific Tailwind class compositions for "soft elevation" and "data update animation" are up to us as long as they meet the visual requirements.

### Deferred Ideas (OUT OF SCOPE)
- N/A
</user_constraints>

## Summary

The UI Refactoring phase centers on migrating the core dashboard interface to a "High-Density Minimalist" design system. The overarching goal is to present complex metric data clearly using strong typography, explicit true light/dark duality, semantic colors, and tabular numbers, while entirely avoiding decorative shadows (except for specific interaction feedback). 

The effort is initially focused on a baseline of three critical components: `TopNav`, `BaseSourceCard`, and `QuotaBar`. These will serve as the architectural standard for all subsequent components. A critical requirement is ensuring existing components and refactored components can coexist during the transition.

**Primary recommendation:** Define the core CSS variables in `index.css` immediately to align with the new design tokens (background, surface, muted, borders, and strictly semantic brand/warning/success/error colors) and enforce `tabular-nums` via Tailwind utilities on all metric displays.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | Component rendering | Existing project standard |
| TailwindCSS | 3.x | Styling and Design Tokens | Allows rapid mapping of the new design system via custom colors and utility classes |
| Lucide React | Current | Iconography | High quality, consistent, standard in the codebase. Fits the "Maximum Signal" aesthetic |
| Radix UI / shadcn | Current | Primitives (Tooltip, etc.) | Existing usage for accessible overlay and tooltip components, which is critical for the text-truncation requirements |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| clsx / tailwind-merge | Current | Classname composition | Building flexible internal base components with conditional hover/focus states |

**Installation:**
No new dependencies are needed. Existing stack supports all requirements.

## Architecture Patterns

### Recommended Project Structure
Since this is an in-place refactor of existing components, the structure remains intact, but styles will change.
```
ui-react/
├── src/
│   ├── index.css            # Will contain the new CSS variables (Light/Dark duality)
│   ├── components/
│   │   ├── TopNav.tsx       # Rebuilt from scratch
│   │   ├── BaseSourceCard.tsx # Rebuilt from scratch with absolute positioned action bar
│   │   └── widgets/
│   │       └── QuotaBar.tsx # Rebuilt with strict thin progress tracks and tabular nums
```

### Pattern 1: High-Density Metric Display
**What:** Using `tabular-nums` and stark text sizing to display updating quotas without horizontal layout shift.
**When to use:** In `QuotaBar` and any other numerical displays inside `BaseSourceCard`.
**Example:**
```tsx
<div className="flex items-baseline gap-2">
  <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
    {usage.toLocaleString()}
  </span>
  <span className="text-xs text-muted-foreground uppercase tracking-wider">
    / {limit.toLocaleString()}
  </span>
</div>
```

### Pattern 2: Tooltip-Driven Icon Actions
**What:** Replacing text buttons with icon buttons wrapped in tooltips to increase data density.
**When to use:** In headers, navigation, and card action bars.
**Example:**
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-foreground hover:text-background transition-colors duration-150">
        <RefreshCw className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top">
      <p>Refresh Data</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Anti-Patterns to Avoid
- **Decorative Shadows:** Avoid `shadow-md` or `shadow-lg` on static elements. Only use shadow (`box-shadow`) for interactive hover states.
- **Pill-shaped Corners:** Avoid `rounded-full` on cards (stick to `rounded-xl`).
- **Colorful Backgrounds:** Do not use `bg-orange-500` for cards. Use semantic colors strictly for progress bars, tiny badges, or text indicators.
- **Text-heavy Buttons:** Avoid `<Button>Edit</Button>` in tight grids; use icons instead.
- **Layout Shift on Hover:** Actions appearing on hover must use `absolute` positioning or pre-allocated space.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Truncated Text with Tooltip | Custom CSS hover reveals | Radix UI Tooltip / shadcn `Tooltip` | Accessibility, robust boundary collision detection |
| Complex Class merging | Template literals | `cn()` utility (`clsx` + `tailwind-merge`) | Prevents conflicting Tailwind utility classes during hover state generation |

**Key insight:** The project already utilizes shadcn-like primitives (`Tooltip`, `Button`, `Card`). The refactoring should heavily leverage these but adjust their default Tailwind classes to meet the new minimalist design constraints (e.g., removing default borders or adjusting hover states).

## Common Pitfalls

### Pitfall 1: Tabular Numbers Breaking Container Width
**What goes wrong:** Extremely long numbers overflow the card padding despite `tabular-nums`.
**Why it happens:** Lack of `min-w-0` or `truncate` on flex containers containing dynamic numbers.
**How to avoid:** Ensure parent containers have `min-w-0` and use scaling typography or truncation for exceptionally large limits.

### Pitfall 2: Layout Shift on Hover Actions
**What goes wrong:** The card content jumps down or shrinks when the hover-action bar appears.
**Why it happens:** Conditionally rendering DOM nodes without absolute positioning or reserved space.
**How to avoid:** Position the hover action bar `absolute top-2 right-2` inside a `relative` container, and control visibility via `opacity-0 group-hover:opacity-100`.

### Pitfall 3: Broken Dark Mode Contrast
**What goes wrong:** "Muddy" backgrounds or unreadable text in dark mode.
**Why it happens:** Hardcoding specific tailwind gray colors (e.g., `bg-gray-800`) instead of semantic variables.
**How to avoid:** Strictly use `bg-background`, `bg-surface`, `border-border`, and `text-foreground`. Ensure `index.css` maps these correctly for `.dark`.

## Code Examples

Verified patterns from official sources:

### CSS Variable Definition (`index.css`)
```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 0%;
    --surface: 0 0% 98%; /* FAFAFA */
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --border: 240 5.9% 90%;
    --ring: 262.1 83.3% 57.8%; /* Violet / Brand focus ring */
    /* Semantic Colors */
    --brand: 262.1 83.3% 57.8%; /* Violet 600 */
    --warning: 24.6 95% 53.1%; /* Orange 500 */
    --success: 142.1 70.6% 45.3%; /* Emerald 500 */
    --error: 0 84.2% 60.2%; /* Red 500 */
  }
 
  .dark {
    --background: 240 10% 3.9%; /* Zinc 950 */
    --foreground: 0 0% 98%;
    --surface: 240 5.9% 10%; /* Zinc 900 */
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
    --ring: 262.1 83.3% 57.8%;
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Multi-color gradient headers | Strict semantic minimal borders/backgrounds | Phase 8 | Reduced visual noise, higher data emphasis |
| Text-based navigation | Icon-based with Tooltips | Phase 8 | Higher screen real estate for metrics |

**Deprecated/outdated:**
- `qb-header-gradient-*` classes: Removed in favor of pure semantic minimalist design.
- Click-to-open secondary menus: Replaced by non-intrusive action peeks.

## Open Questions

1. **Card Layout Toggles**
   - What we know: Architecture must account for future toggles (Compact/Moderate/Loose).
   - What's unclear: How the state for this toggle is passed to the cards (Context API vs LocalStorage vs global state).
   - Recommendation: Use a React Context wrapper for dashboard layout preferences, falling back to `12px` (gap-3) and `p-4` as the default.

## Sources

### Primary (HIGH confidence)
- `docs/custom_design_prompt.md` - Core design system rules, colors, typography, and philosophy.
- `08-CONTEXT.md` - Phase constraints, target components, interaction requirements.
- Existing UI codebase (`ui-react/src/components/*`) - Identified current component props and React/Tailwind usage patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Confirmed via codebase inspection.
- Architecture: HIGH - Derived directly from the strict constraints in the design doc.
- Pitfalls: HIGH - Based on common Tailwind/React high-density layout issues and specific hover action constraints.

**Research date:** 2026-03-02
**Valid until:** Next major architectural change