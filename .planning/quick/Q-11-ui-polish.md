# Quick Task: UI Polish

## Goal
1. Unify dialog styles across the project, replacing all `alert()` calls with a global `Toast` system.
2. Update the loading animation in the Settings page to match the main interface (spinning loader).
3. Improve information density in the Settings page by inlining inputs and unifying UI style.

## Changes
- **`ui-react/src/store/index.ts`**: Added global `toast` state and `showToast`/`hideToast` actions.
- **`ui-react/src/components/ui/toast.tsx`**: Implemented `Toast` component using `lucide-react` icons and absolute positioning.
- **`ui-react/src/App.tsx`**: Integrated `Toast` provider into the root component.
- **`ui-react/src/pages/Settings.tsx`**:
    - Replaced simple loading text with `EmptyState` + `RefreshCw` animation.
    - Unified background (`bg-surface`) and border radius (`rounded-xl`).
    - Inlined input labels and descriptions for better density.
    - Replaced 7 `alert()` calls with `showToast()`.
- **`ui-react/src/hooks/useScraper.ts`**: Replaced 3 `alert()` calls with `showToast()`.
- **`ui-react/src/components/ui/dialog.tsx`**: Updated dialog border radius to `sm:rounded-2xl` for a more modern look.

## Verification
- [x] Typecheck passed (`npm run typecheck`).
- [x] `alert()` calls eliminated (0 matches in `grep`).
- [x] Loading state in Settings matches Dashboard pattern.
- [x] Settings layout is more compact and visually consistent.
