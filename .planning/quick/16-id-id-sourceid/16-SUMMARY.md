# Quick Task 16 Summary

## Goal
将数据存储从序号键改为按 `source_id` 主键，并在删除数据源时级联删除同 `source_id` 的数据、密钥与视图绑定；同时在前端删除流程中补充二次确认提醒。

## What Changed
- `core/data_controller.py`
  - 从 TinyDB doc_id 结构切换为 JSON `latest_by_source` / `history_by_source`。
  - 读写全部以 `source_id` 为主键。
  - 兼容 legacy TinyDB 格式（`latest`/`history`）并在写入时迁移为新结构。
- `core/resource_manager.py`
  - 新增 `remove_source_references_from_views(source_id)`，删除视图中绑定该 source 的组件引用。
- `core/api.py`
  - `DELETE /api/sources/{source_id}` 增加级联清理：
    - 清理 source 数据（data）
    - 清理 source 密钥（secrets）
    - 清理绑定该 source 的视图项（view items）
  - 返回 cleanup 摘要（affected views/warnings）。
- `ui-react/src/api/client.ts`
  - `deleteSourceFile` 返回删除结果与 cleanup 信息。
- `ui-react/src/pages/Integrations.tsx`
  - source 删除改为二次确认流程。
  - 二次确认弹窗增加级联删除提醒，并要求输入 source ID 才可最终删除。
- `ui-react/src/pages/Dashboard.tsx`
  - 删除确认文案补充“数据/密钥/视图绑定一并清理”。

## Tests
- Passed:
  - `pytest tests/core/test_data_controller.py tests/api/test_source_delete_api.py`
- Frontend test blocked by environment dependency resolution:
  - `npm --prefix ui-react run test -- --run src/pages/Integrations.test.tsx`
  - Error: `Failed to resolve entry for package "monaco-editor"`

## Commits
- Code changes: `dabc242`
