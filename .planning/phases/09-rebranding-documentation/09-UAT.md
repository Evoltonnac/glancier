# Phase 09 UAT: 品牌重塑与文档 (Rebranding & Documentation)

**状态:** 进行中
**版本:** v0.1

## 测试用例 1: 核心品牌识别 (README & PROJECT.md)
**目标:** 验证主入口文档是否已正确切换到 "Glancier" 品牌。
- [ ] `README.md` 以 "Glancier (formerly Quota Board)" 开头。
- [ ] `.planning/PROJECT.md` 已更新定位为 "Personal Data Aggregator & Hub"。
- [ ] 核心竞争力部分不再仅局限于 API 配额。

## 测试用例 2: 术语源头与 AI 指令 (Terminology & Agent.md)
**目标:** 验证术语定义和 AI 指令是否一致。
- [ ] `docs/terminology.md` 存在且定义了 Quota -> Metric/Signal 的映射。
- [ ] `Agent.md` 已更新并引用了术语文档，强制执行新命名。

## 测试用例 3: 架构与配置文档 (ARCHITECTURE & CONFIG.md)
**目标:** 验证技术文档是否反映了新的语义模型。
- [ ] `ARCHITECTURE.md` 描述了 "Flow -> Bento Grid" 管道。
- [ ] `CONFIG.md` 记录了从 `quota_bar` 到 `progress_bar` 的过渡计划。
- [ ] 环境变量 `GLANCIER_DATA_DIR` 已在文档中提及。

## 测试用例 4: 深度文档清理 (docs/*.md)
**目标:** 验证所有深层文档是否已消除旧术语的误用。
- [ ] `docs/flow_configuration.md` 等文件已更新。
- [ ] `ui-react/README.md` 已反映新品牌定位。

---
## 测试执行记录

### 测试 1: 核心品牌识别
- **结果:** [通过]
- **发现:** `README.md` 和 `PROJECT.md` 已全面更新。
- **诊断:** 品牌重塑在主入口层面已完成。

### 测试 2: 术语源头与 AI 指令
- **结果:** [通过]
- **发现:** `docs/terminology.md` 提供了权威映射，`Agent.md` 已将新术语设为 AI 开发的硬性要求。

### 测试 3: 架构与配置文档
- **结果:** [通过]
- **发现:** `ARCHITECTURE.md` 和 `CONFIG.md` 成功建立了 "Flow -> Bento Grid" 的新叙事，并提供了清晰的迁移指南。

### 测试 4: 深度文档清理
- **结果:** [通过]
- **发现:** `docs/` 下的所有深度文件及前端 `README.md` 均已清理完毕，无术语残留。
