# Phase 8 Context: UI Refactoring

## 1. Baseline Component Selection & Strategy
- **Baseline Components**: 
  - `TopNav`: The primary top-level navigation framework.
  - `BaseSourceCard`: The core dashboard card container (including its header, delete actions, and resizing/stretching controls).
  - `QuotaBar`: The representative micro-component for tracking usage data.
- **Refactoring Strategy**: Completely rewrite the selected components from scratch using the new Design System tokens. Discard old styles to ensure a clean DOM structure while preserving existing business logic and functionality.
- **Long Data Handling**: For exceptionally long numbers or text (e.g., remaining quota), strictly use **Truncate + Tooltip** to maintain the integrity of the high-density layout.
- **Preview & Coexistence**: Proceed with a direct mixed preview on the main dashboard. The new components will coexist with un-refactored ones on the homepage during the transition phase.

## 2. Layout & Information Density
- **Grid Gap**: Use a moderate gap of `12px` (`gap-3`) by default. Architecture should account for a future toggle switch allowing users to change layouts (Compact / Moderate / Loose).
- **TopNav Design**: Standard height of approximately `64px`, acting as a flat, clean anchor for the application.
- **Card Padding**: Use an evenly distributed, compact padding (`p-4` or `p-5`) inside `BaseSourceCard`.
- **Responsive Behavior (Narrow Screens)**: Switch to a single column layout with adaptive height (driven by content) rather than forcing arbitrary heights or scaling down proportionally.
- **Iconography & Text Density**: Use icons to represent functions instead of text to save available display space and prevent distracting the user with excessive visual noise. Always use tooltips to provide the text description for these icons.

## 3. Interaction & Animation Details
- **Hover States & Buttons (Classic Inversion)**: Buttons and clickable areas must use a classic contrast inversion on hover. Default state: very faint light background (or transparent) with dark text/icon. Hover state (using a fast 150ms transition): background instantly fills with a dark color, and text/icon inverts to white.
- **Non-intrusive Action Peek**: Hovering over a card reveals an action bar (e.g., edit, delete, archive) that slides out smoothly. It must overlay the content (via absolute positioning) or use pre-allocated padding space, ensuring the original content layout **does not shift or jump**.
- **Menu Depth & Operations**: Avoid using click-to-open secondary menus that increase user operations, unless an area has too many functional buttons. Instead, use hover-slide-out panels or other inline display methods.
- **Soft Elevation**: Do not use `transform: scale`. Instead, apply a multi-layered, soft Z-axis `box-shadow` to create a subtle lifting effect when hovering over cards. *(Note: This is a deliberate exception to the strict "No Shadows" rule in the baseline design doc, implemented specifically to provide better interaction feedback for actionable cards).*
- **Focus & Accessibility**: Use the brand's purple focus ring (`ring-2 ring-brand/50`) to clearly indicate keyboard focus or active states.
- **Data Update Animation**: When data (like quotas or metrics) updates dynamically, apply a brief background color flash to the numeric area, then restore smoothly.
- **Limit/Warning States**: Keep it minimal. When a quota hits a dangerous threshold, change the color (to red/orange) without adding pulse animations or extra icons.

## Code Context
- **Design Document**: Reference `@docs/custom_design_prompt.md` for core tokens (True Light/Dark mode duality, `tabular-nums` for metrics, strict semantic colors: Violet/Orange/Green/Red).
- **Target Files for Baseline**:
  - `ui-react/src/components/TopNav.tsx`
  - `ui-react/src/components/BaseSourceCard.tsx`
  - `ui-react/src/components/widgets/QuotaBar.tsx`
- **Theme/Token Integration Strategy**: The new design tokens (colors, tabular-nums, spacing) should be mapped into Tailwind configuration and CSS variables (`ui-react/src/index.css`) to ensure global consistency across the refactoring journey.