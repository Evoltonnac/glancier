---
task: quick-16
description: 检查并修复数据按 source_id 存储；删除 source 时级联删除数据/密钥/视图绑定；补充二次确认提醒
created: 2026-03-12
---

# Quick Plan 16

## Task 1 - Data storage format by source_id
- files: `core/data_controller.py`, `tests/core/test_data_controller.py`
- action: 将数据落盘结构改为 `latest_by_source` / `history_by_source`，以 `source_id` 作为主键；兼容并迁移 legacy TinyDB 结构。
- verify: 新增单测校验落盘 key 为 source_id；legacy 数据可读取并在写入后迁移为新结构。
- done: 读取与写入都不再依赖序号 doc_id。

## Task 2 - Cascade cleanup on source deletion
- files: `core/resource_manager.py`, `core/api.py`, `tests/api/test_source_delete_api.py`
- action: 删除 source 时同步清理 data、secrets、view items（按 source_id 解绑）。
- verify: API 测试覆盖 source 删除后 data/secrets/view 绑定均被清理，其他 source 数据不受影响。
- done: 删除接口返回清理摘要，行为可观测。

## Task 3 - Secondary confirmation reminders in UI
- files: `ui-react/src/pages/Integrations.tsx`, `ui-react/src/pages/Integrations.test.tsx`, `ui-react/src/api/client.ts`
- action: 为 source 删除流程增加二次确认态，并在二次确认弹窗提示将清理数据、密钥与视图绑定信息。
- verify: 前端测试覆盖进入二次确认并执行删除调用。
- done: 删除动作需要二次确认且提醒信息明确。
