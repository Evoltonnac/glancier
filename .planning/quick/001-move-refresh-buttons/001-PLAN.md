---
phase: quick
plan: "001"
type: execute
wave: 1
depends_on: []
files_modified:
  - ui-react/src/components/TopNav.tsx
  - ui-react/src/pages/Dashboard.tsx
  - ui-react/src/pages/Integrations.tsx
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - "Refresh All button moved from TopNav to Dashboard sidebar"
    - "Reload file button moved from Integrations toolbar to Integrations sidebar"
    - "TopNav no longer contains refresh button"
  artifacts:
    - path: "ui-react/src/components/TopNav.tsx"
      provides: "Navigation without refresh button"
    - path: "ui-react/src/pages/Dashboard.tsx"
      provides: "Sidebar with refresh button"
    - path: "ui-react/src/pages/Integrations.tsx"
      provides: "Sidebar with reload button"
  key_links:
    - from: "TopNav.tsx"
      to: "Dashboard.tsx"
      via: "Removed refresh button, added to sidebar"
    - from: "Integrations.tsx toolbar"
      to: "Integrations.tsx sidebar"
      via: "Moved reload button"
---

<objective>
Move refresh buttons from top navigation and integration page editor toolbar to their respective sidebars.
</objective>

<execution_context>
@/Users/xingminghua/.claude/get-shit-done/workflows/execute-plan.md
@/Users/xingminghua/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@ui-react/src/components/TopNav.tsx (lines 148-161: Refresh button to remove)
@ui-react/src/pages/Dashboard.tsx (lines 744-773: Sidebar header section)
@ui-react/src/pages/Integrations.tsx (lines 1206-1221: Reload button to move)
@ui-react/src/pages/Integrations.tsx (lines 824-1015: Sidebar section)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove refresh button from TopNav</name>
  <files>ui-react/src/components/TopNav.tsx</files>
  <action>
Remove the refresh button block (lines 148-161) from TopNav.tsx. This includes:
- Remove the RefreshCw import if no longer needed
- Remove the entire Tooltip block containing the refresh button (onClick={handleRefreshAll})
- Keep the handleRefreshAll function in case it's needed elsewhere, or remove if unused

Current code to remove:
```tsx
<Tooltip>
    <TooltipTrigger asChild>
        <button
            onClick={handleRefreshAll}
            className={actionButtonClass}
            aria-label="全部刷新"
        >
            <RefreshCw className="w-4 h-4" />
        </button>
    </TooltipTrigger>
    <TooltipContent>
        <p>重新获取所有数据源的配额数据</p>
    </TooltipContent>
</Tooltip>
```
  </action>
  <verify>
    <automated>grep -n "RefreshCw.*w-4.*h-4" ui-react/src/components/TopNav.tsx | wc -l should return 0</automated>
  </verify>
  <done>TopNav no longer contains refresh button, compiles without errors</done>
</task>

<task type="auto">
  <name>Task 2: Add refresh button to Dashboard sidebar</name>
  <files>ui-react/src/pages/Dashboard.tsx</files>
  <action>
Add the refresh button to the Dashboard sidebar header section (after the toggle button). The sidebar header is around lines 746-773.

Add after the toggle Tooltip block (around line 772):
```tsx
<Tooltip>
    <TooltipTrigger asChild>
        <button
            onClick={handleRefreshAll}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
            aria-label="全部刷新"
        >
            <RefreshCw className="h-4 w-4" />
        </button>
    </TooltipTrigger>
    <TooltipContent side="right">
        <p>重新获取所有数据源的配额数据</p>
    </TooltipContent>
</Tooltip>
```

Note: handleRefreshAll is already defined in Dashboard.tsx (line 564), so no new function needed.
  </action>
  <verify>
    <automated>grep -n "handleRefreshAll" ui-react/src/pages/Dashboard.tsx | head -5</automated>
  </verify>
  <done>Dashboard sidebar shows refresh button in header area</done>
</task>

<task type="auto">
  <name>Task 3: Move reload button to Integrations sidebar</name>
  <files>ui-react/src/pages/Integrations.tsx</files>
  <action>
Two changes needed:

1. Remove the reload button from the toolbar (lines 1206-1221):
   - Remove the Tooltip block containing the reload button (onClick={handleReloadFile})
   - Keep the RotateCcw import if needed elsewhere

2. Add reload button to sidebar header (after the sidebar toggle button, around line 1013):
   Add after the toggle Tooltip block:
```tsx
<Tooltip>
    <TooltipTrigger asChild>
        <button
            onClick={handleReloadFile}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
            aria-label="Reload file"
        >
            <RotateCcw className="h-4 w-4" />
        </button>
    </TooltipTrigger>
    <TooltipContent side="right">
        Reload file from disk
    </TooltipContent>
</Tooltip>
```

Note: RotateCcw import is already present (used elsewhere in the file). handleReloadFile is already defined (line 431).
  </action>
  <verify>
    <automated>grep -n "RotateCcw.*h-4.*w-4" ui-react/src/pages/Integrations.tsx | wc -l</automated>
  </verify>
  <done>Integrations toolbar no longer has reload button, sidebar has reload button in header</done>
</task>

</tasks>

<verification>
- [ ] TopNav.tsx compiles without errors
- [ ] Dashboard.tsx compiles without errors, refresh button visible in sidebar
- [ ] Integrations.tsx compiles without errors, reload button visible in sidebar
- [ ] Both sidebars have the action buttons in their header sections
</verification>

<success_criteria>
- Refresh All button now in Dashboard sidebar (not TopNav)
- Reload file button now in Integrations sidebar (not toolbar)
- No console errors on both pages
</success_criteria>

<output>
After completion, create .planning/quick/001-move-refresh-buttons/001-SUMMARY.md
</output>
