# Glanceus SDUI Widget Layout and Responsive Shell Contract

## 1. Goal

In a grid-based dashboard where card heights are discrete (e.g., 2 rows, 4 rows) and user-resizable, the layout system must guarantee:
- Content remains readable and operable.
- Widgets are never "squashed" into an unusable state.
- When the allocated physical height is insufficient, the system provides a predictable "fallback global scroll" behavior.

This specification relies purely on **CSS Flexbox `flex-shrink: 0` + `min-height`** and **Nested Flex Layouts**, completely decoupling from JS-based dynamic height calculations.

## 2. Component Layout Categories (Widget Contract)

All SDUI components must explicitly declare their layout metadata during rendering. They fall into three categories:

### 2.1 Structural Widgets
- **Characteristics**: Height is basically fixed, driven by its internal text or basic elements. It should not expand to fill remaining space, nor should it be compressed.
- **Representative Components**: `TextBlock`, `FactSet`, `ActionSet`, `Badge`, `Image`, `Progress`.
- **Behavioral Constraints**: In a Flex container, must behave as `flex-none` (`flex: 0 0 auto`).

### 2.2 Container Widgets
- **Characteristics**: Pure layout containers (`Container`, `ColumnSet`, `Column`) that divide space for child widgets. They don't have an intrinsic minimum height baseline themselves but need to adapt to the parent's allocated space.
- **Representative Components**: `Container`, `ColumnSet`.
- **Behavioral Constraints**:
  - Should **skip** the standard `sdui-widget-shell` wrapper to avoid redundant nesting.
  - Must apply `flex: 1 0 auto` (or `flex-grow shrink-0 basis-auto` in Tailwind) and `min-h-0` to their own root element to fill available space while ensuring they **never** shrink below their content's intrinsic height.

### 2.3 Content Widgets
- **Characteristics**: Responsible for displaying primary data, occupying the remaining space of the card. When multiple content widgets exist, they share the remaining space based on weight. Every component class has a strict "minimum usable height".
- **Minimum Height Base**: Uses **Grid Row Height** as the base unit instead of absolute pixels. For example: `2` means 2 grid rows high. This allows components to adapt to different grid density settings.
- **Representative Components**: `List`, `Chart.*`, `Progress` (in some scenarios).
- **Behavioral Constraints**:
  - In a Flex container, must behave as `flex: var(--widget-weight, 1) 0 0px` (shares space equally based on weight, refuses to shrink below baseline, ignores intrinsic height).
  - Must set `min-height: calc(var(--qb-grid-row-height) * var(--widget-min-height-rows))`.
  - To ensure `flex-grow` correctly fills remaining space in complex flex chains, the wrapper must apply `height: 0` (or `flex-basis: 0px`) and be a full Flex container (`flex flex-col overflow-hidden`).
  - The internal scrollable area must apply `min-h-0` to provide a boundary for internal scrolling.

## 3. Component-Specific Implementation Guidelines

### 3.1 Tables (`Chart.Table`)
- To maintain context during scrolling, the `thead` must use `sticky top-0` positioning with a high `z-index` and a solid background color.

### 3.2 Responsive Charts (`Chart.*`)
- Do **not** use fixed pixel heights for charts.
- Use Recharts `ResponsiveContainer` with `width="100%" height="100%"`.
- For `PieChart`, use percentage strings for radii (e.g., `outerRadius="80%"` and `cx/cy="50%"`) to ensure the pie scales proportionally to the container dimensions.

## 4. The Card Shell Layout

The outer dimensions of a card are absolutely assigned by the Dashboard grid system. The root node inside the card (the Shell) is responsible for executing the fallback scrolling and space allocation.

**Core CSS Implementation:**
```css
/* Card Shell: flex flex-col h-full w-full overflow-y-auto overscroll-contain */
.sdui-card-shell {
  display: flex;
  flex-direction: column;
  height: 100%;         /* Strictly controlled by outer grid allocation */
  width: 100%;
  overflow-y: auto;     /* [Fallback scroll layer] */
  overscroll-behavior: contain;
}
```

## 4. Space Allocation & Scroll Strategy

This spec uses a **dual-layer scroll with explicit priorities**:

1. **Priority Layer: Component Internal Scroll**
   - Applies to components like `List` that naturally require scrolling.
   - When card space is sufficient, `List` gets enough height, and its items scroll within its own bounds.
   - Key implementation detail: The scrollable area inside a content widget must apply `min-h-0` to prevent Flex children from blowing out the container height.

2. **Fallback Layer: Card Global Scroll**
   - Triggered when the total card height is **less than** "Fixed height of Structural widgets + Sum of minimum heights of Content widgets".
   - Flexbox will refuse to compress content widgets further due to `flex-shrink: 0`, causing the internal total height to exceed the Shell's `100%` height.
   - At this point, the Shell's `overflow-y: auto` kicks in. Components maintain their minimum usable form without being squashed, and the user scrolls the entire card to see the full content.

## 5. Development Constraints
- **Zero JS Height Calculation**: No `ResizeObserver` or manual pixel math. All layouts must rely on Flexbox rules.
- **CSS Variable Dependency**: The calculation for `min-height` must rely on the system CSS variable `--qb-grid-row-height` to ensure proportional scaling.
