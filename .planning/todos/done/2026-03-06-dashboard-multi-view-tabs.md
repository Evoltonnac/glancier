---
created: 2026-03-06T14:15:00Z
title: dashboard-multi-view-tabs
area: ui
files:
  - ui-react/src/pages/Dashboard.tsx
  - ui-react/src/store/index.ts
---

## Problem

Currently, the system stores views with an ID, but there is no user interface to switch between or manage multiple views in the dashboard. Users need the ability to create, switch, and manage multiple views easily.

## Solution

Implement a multi-view feature in the dashboard view area based on the existing view ID storage:
1. View Tab Switching: Add a tabbed interface to switch between different views.
2. Tab Drag-and-Drop Sorting: Allow users to reorder view tabs.
3. Tab Management: Support creating new views, deleting existing views, and renaming views directly from the tabs.
