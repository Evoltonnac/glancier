---
quick_task: 1
title: Integration editor config error surfacing
date: 2026-03-06
mode: quick
status: planned
---

## Goal
当 integration 配置异常时：
1. 后端返回结构化错误（包含文件、行列、错误类型、可读描述、字段路径）。
2. Integrations 页面侧边栏对异常文件显示状态标识。
3. 右侧详情区域展示异常描述与定位信息。
4. 在 Monaco Editor 中按标准代码错误格式显示 marker（行/列/message/severity）。

## Scope
- 仅针对 integration YAML 编辑与 reload 流程。
- 优先支持 YAML 语法错误与 Pydantic schema 错误。
- 不做全局配置重构，不改变现有 Dashboard 业务逻辑。

## Tasks

### Task 1: Backend diagnostics contract
- files:
  - `core/config_loader.py`
  - `core/api.py`
  - `tests/core/test_config_loader_resilience.py`
  - `tests/api/test_reload_error_boundary.py`
- action:
  - 在配置加载阶段保留并聚合诊断信息（yaml parser + schema validation）。
  - `POST /api/system/reload` 失败时返回结构化 `diagnostics`（包含 `file`, `line`, `column`, `code`, `message`, `field_path`）。
  - 保留已有 400 语义并增强 detail payload。
- verify:
  - 构造缩进错误 YAML，断言返回 line/column。
  - 构造字段非法值，断言返回 field_path（如 `auth.type`）。
- done:
  - API 错误响应可被前端直接消费，无需解析日志文本。

### Task 2: Frontend error propagation + sidebar/detail state
- files:
  - `ui-react/src/api/client.ts`
  - `ui-react/src/pages/Integrations.tsx`
  - `ui-react/src/pages/Integrations.test.tsx`
- action:
  - `reloadConfig` 非 2xx 时读取后端 JSON 错误并抛出结构化异常对象。
  - Integrations 页面维护 per-file health 状态（ok/error）。
  - 侧边栏文件项显示 error badge/icon；右侧新增错误详情区（message + file/line/column/field_path）。
- verify:
  - 保存后 reload 失败时，当前文件在侧边栏出现错误标识。
  - 页面详情区可见完整错误描述。
- done:
  - 用户不看控制台也能定位配置异常。

### Task 3: Monaco markers (standard code error format)
- files:
  - `ui-react/src/pages/Integrations.tsx`
  - `ui-react/src/pages/Integrations.test.tsx`
- action:
  - 将 diagnostics 映射为 Monaco markers（`startLineNumber/startColumn/endLineNumber/endColumn/message/severity`）。
  - 选中文件切换时只显示该文件 markers，修复后清除 markers。
- verify:
  - 错误文件显示红色 marker；无错误时 marker 清空。
- done:
  - 编辑器内提供与常见 IDE 一致的报错体验。

## Risks
- schema 错误默认只提供字段路径，若要精准映射到 YAML 行号需要额外 AST/path 映射实现。
- 多文件合并加载场景需确保 `file` 字段准确，不然侧边栏状态会错位。

## Exit Criteria
- 能稳定返回结构化诊断并前端可展示。
- 侧边栏状态、右侧详情、Monaco markers 三处联动一致。
- 相关后端与前端测试新增/更新通过。
