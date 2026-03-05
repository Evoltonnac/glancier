# 10-RESEARCH: Codebase Semantic Update (代码语义更新与组件重构)

## 1. 目标与范围 (Goal & Scope)
本阶段的核心任务是将 "Quota Board" 品牌彻底从代码、配置和 UI 中抹除，并代之以新的 **Glancier** (Personal Data Aggregator & Hub) 身份。同时，通过重构 `App.tsx` 等复杂组件来偿还技术债。

## 2. 关键变更点 (Key Changes)

### 2.1 品牌与 UI 更名 (Branding & Identity)
- **前端名称更新**：
    - `ui-react/src-tauri/tauri.conf.json`: `productName`, `title` (Quota Board -> Glancier).
    - `ui-react/index.html`: `<title>`.
    - `ui-react/src/components/TopNav.tsx`: 品牌文字更新。
- **后端名称更新**：
    - `main.py`: FastAPI `title` 和日志消息。
    - `Agent.md`: 已完成，确保代码生成遵循之。

### 2.2 配置与环境变量 (Configuration & Environment)
- **环境变量兼容性**：
    - 引入 `GLANCIER_DATA_DIR` 替代 `QUOTA_BOARD_ROOT`。
    - 后端在 `core/config_loader.py` 等文件中应同时检查这两个变量，优先使用新变量。
- **组件类型别名**：
    - 在 `core/config_loader.py` 中，`quota_card` 映射到 `source_card`，`quota_bar` 映射到 `progress_bar`。
    - 保持别名以支持现有 YAML 配置。

### 2.3 前端组件重构 (Component Refactoring)
- **`App.tsx` 拆分**：
    - 目前 `App.tsx` 逻辑过重（约 900 行），应拆分为 `src/pages/Dashboard.tsx`。
    - 抽离 `Sidebar` 和 `Scraper` 逻辑为独立 Hooks。
- **Widget 重命名**：
    - `ui-react/src/components/widgets/QuotaBar.tsx` -> `ProgressBar.tsx`。
    - `ui-react/src/components/widgets/WidgetRenderer.tsx`: 更新组件映射。

### 2.4 构建与 Sidecar (Build & Sidecar)
- **Sidecar 命名**：
    - `scripts/build.sh` 和 `tauri.conf.json`: 将 sidecar 二进制名从 `quota-board-server` 更新为 `glancier-server`。

## 3. 兼容性策略 (Compatibility Strategy)
1. **别名支持**：在 Pydantic 模型中使用 `alias` 支持旧的配置键。
2. **渐进式重命名**：首先更新对外展示的部分（UI/文档），然后逐步更新内部变量名。
3. **数据目录检查**：启动时检测旧目录并提示或自动迁移。

## 4. 风险点 (Risks)
- **硬编码路径**：可能存在未发现的 `.quota-board` 字符串。
- **Tauri IPC**：重命名 sidecar 或事件可能导致通信中断。
- **构建脚本**：`scripts/build.sh` 的重命名必须与 `tauri.conf.json` 同步。

## 5. 结论 (Conclusion)
研究表明，第 10 阶段不仅是简单的文本替换，更涉及到后端配置模型的兼容性处理和前端核心逻辑的拆分。建议分为 3-4 个 Plan 逐步执行，确保每步都经过验证。
