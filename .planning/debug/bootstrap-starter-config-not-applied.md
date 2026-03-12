---
status: resolved
trigger: "Bootstrap 启动流程未带上新修改的开箱配置"
created: 2026-03-12T03:00:00Z
updated: 2026-03-12T03:25:00Z
---

## 问题

启动流程在 Tauri 运行时未加载最新开箱 starter 配置，首启未按预期 seed 新配置。

## Root Cause

- `seed_first_launch_workspace()` 通过 `_resolve_examples_dir()` 优先使用 `integration_manager.config_root/examples`。
- Tauri 运行时将 `GLANCIER_DATA_DIR` 指向用户数据目录，默认仅创建 `config/integrations`，没有 `config/examples`。
- 旧逻辑在 `config_root` 存在时不会回退到打包内置 `config/examples`，导致读取失败并跳过 seed。

## Fix Applied

### 后端修复 (`core/bootstrap.py`)

1. `_resolve_examples_dir()` 调整为：
   - 若显式传入 `examples_dir`，优先使用；
   - 若 `config_root/examples` 存在，使用该目录；
   - 否则回退到内置 `DEFAULT_EXAMPLES_DIR`（打包资源内的 `config/examples`）。

### 测试修复与回归 (`tests/core/*.py`)

1. 新增回归测试覆盖“data root 下无 examples 目录”场景，确保 fallback 生效。
2. 更新启动相关测试中的 starter integration 文件断言，适配当前 examples 目录包含 `github_device_oauth.yaml` 的现状。

## Verification

- `pytest tests/core/test_bootstrap_starter_bundle.py tests/core/test_app_startup_resilience.py -q`
  - 结果：`6 passed`

