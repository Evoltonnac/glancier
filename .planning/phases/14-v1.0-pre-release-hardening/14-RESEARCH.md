# Phase 14: v1.0 Pre-release Hardening Research

## 1. Goal and Requirements
- 在发布前清理会引发后续破坏性改动的设计隐患。
- 确定并落地 4 种 Integration Preset 的具体模板与配置约束。
- 提供一个可运行的初始演示配置（Integration + Source + Dashboard）。
- 完成文档与代码一致性检查、UI/交互细节补全。

## 2. Candidate Presets
- `api_key`: 面向标准 Header 鉴权 API。
- `oauth2`: 面向授权码流程（含回调）。
- `curl`: 面向脚本化 HTTP 拉取与定制 Headers。
- `webscraper`: 面向 WebView 抓取场景与会话态页面。

## 3. Risks to Eliminate
- 配置 schema 无版本边界导致升级破坏旧配置。
- Source Step 参数语义不稳定，导致已有 Flow 重放失败。
- Widget 布局/序列化变更缺少迁移策略。
- 文档示例与实现不一致，导致用户首次配置失败。

## 4. Implementation Strategy
1. 固化核心数据契约（schema + migration policy + deprecation policy）。
2. 逐个实现并验证四种 Preset 模板自动填充。
3. 实现并验证首启初始配置注入逻辑（可幂等）。
4. 运行完整性检查并补齐 UI/交互细节。

## 5. Validation
- Preset 模板可通过编辑器 schema 校验。
- 初始配置可一键展示至少一个成功数据链路。
- 文档命令可执行、示例可跑通、关键截图/描述与当前 UI 对齐。
