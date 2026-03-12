# 14-RISK-REGISTER

## Purpose
追踪 v1.0 发布前可能导致未来迭代破坏性改动的设计风险，并记录当前版本的一次性收敛策略。

## Policy (Pre-1.0)
- 当前阶段不承诺任何旧版本兼容。
- 所有配置与实现以当前 schema/组件契约为唯一标准。
- 发现旧语法时直接迁移或替换，不添加运行时兼容分支。

## Breaking Risk Register
| Risk ID | Area | Risk Description | Potential Breakage | Mitigation | Migration Strategy | Rollback |
|---|---|---|---|---|---|---|
| R-14-001 | Integration Schema | integration YAML 字段继续漂移（如 `steps/view` 与 `flow/templates` 混用）。 | 解析与编辑链路行为不一致，线上前后端语义分叉。 | 固化唯一 schema：`flow` + `templates`；不接受旧字段。 | 对存量配置一次性改写到新字段并提交。 | 若迁移导致异常，使用 git 回滚到迁移前提交并重跑迁移。 |
| R-14-002 | Flow DSL | Flow Step 参数语义未锁定，后续改动容易破坏执行。 | Source 刷新失败或状态机卡死。 | 在当前 DSL 上补充测试并冻结关键字段（`id/use/args/outputs`）。 | 所有旧 step 定义直接改写为当前约定，不保留别名。 | 回滚到最近稳定 commit。 |
| R-14-003 | Widget Contract | 组件类型契约不统一导致渲染崩溃。 | Dashboard 单卡片或整页不可用。 | 保留 widget 级错误边界，防止页面级崩溃。 | 旧组件名在配置文件中直接替换为现行类型；运行时不做别名映射。 | 回滚具体 widget 配置变更。 |
| R-14-004 | Release Operation | 文档与实现偏离（仍描述“兼容窗口”）。 | 开发和测试执行错误策略。 | 文档统一改为“pre-1.0 不兼容策略”。 | 删除过时兼容描述并补充迁移注意事项。 | 回滚文档提交并重新审阅。 |
