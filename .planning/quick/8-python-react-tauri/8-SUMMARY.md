---
phase: quick
plan: 8
subsystem: architecture
tags:
  - python
  - react
  - tauri
  - build
  - repository-hygiene
dependency_graph:
  requires: []
  provides:
    - current-state map of folders/scripts/artifacts
    - staged cleanup recommendations
  affects:
    - .planning/quick/8-python-react-tauri/8-SUMMARY.md
    - .planning/STATE.md
tech_stack:
  added: []
  patterns:
    - build-path normalization
    - command entrypoint consolidation
key_files:
  created:
    - .planning/quick/8-python-react-tauri/8-PLAN.md
    - .planning/quick/8-python-react-tauri/8-SUMMARY.md
  modified:
    - .planning/STATE.md
key_decisions:
  - "This quick task is analysis-only: no codebase restructuring in this step."
  - "Prioritize path/command contract first, then physical folder migration."
metrics:
  duration: 25m
  completed_at: "2026-03-09T15:00:00Z"
---

# Phase quick Plan 8: Python/React/Tauri 路径现状梳理与整改建议

## 1) 现状快照（目录、命令、产物）

| 层级 | 主目录/入口 | 常用命令 | 主要产物路径 |
|---|---|---|---|
| Python backend | `main.py` + `core/` + `scripts/dev_server.py` | `python main.py` / `python scripts/dev_server.py` | `dist/glancier-server/`、`build/glancier-server/`（PyInstaller） |
| React frontend | `ui-react/src` | `npm --prefix ui-react run dev` / `build` | `ui-react/dist/` |
| Tauri shell | `ui-react/src-tauri` | `npm --prefix ui-react run tauri:dev` / `tauri:build` | `ui-react/src-tauri/target/release/bundle/` |
| Sidecar bridge | `scripts/build.sh` + `ui-react/src-tauri/src/lib.rs` | `npm --prefix ui-react run tauri:build`（内部调用） | 中间归档写入 `ui-react/src-tauri/binaries/glancier-server-<triple>.tar.gz` |
| Runtime data | `GLANCIER_DATA_DIR`（默认 `.`；Tauri 下指向 app_data_dir） | 启动时注入 env | `${GLANCIER_DATA_DIR}/data`、`${GLANCIER_DATA_DIR}/config`、`${GLANCIER_DATA_DIR}/logs` |

## 2) 当前“混乱感”来源（有证据）

1. 产物目录跨层回写：`scripts/build.sh` 在仓库根执行 PyInstaller，但把 sidecar 归档写回 `ui-react/src-tauri/binaries/`，导致“源码目录夹构建产物”。
2. 产物分散且命名域不统一：同时存在 `build/`、`dist/`、`ui-react/dist/`、`ui-react/src-tauri/target/`，缺少统一 `out/` 契约。
3. 命令入口分裂：根目录 shell 脚本、`ui-react/package.json` scripts、Tauri CLI 各自维护，调用链隐式（如 `tauri:build -> ../scripts/build.sh -> npx tauri build`）。
4. ignore 规则和产物策略不一致：`ui-react/src-tauri/binaries/README.md` 被保留但目录常出现未跟踪状态；`.gitignore` 同时存在多层规则，心智负担高。
5. 状态记录也受影响：`.planning/STATE.md` 的 quick task 记录出现编号重复和目录格式混用，说明流程产物约定未统一。

## 3) 修改建议（先易后难）

### 短期（1-2 次迭代，不迁大目录）

1. 建立单一命令入口（建议根目录 `Makefile` 或 `justfile`）
   - 统一为：`make dev`, `make dev-tauri`, `make build-backend`, `make build-desktop`, `make test`。
   - 内部再调用 `npm --prefix ui-react ...` 和 `scripts/*.sh`，避免团队记忆多套入口。
2. 定义构建路径契约文档（新增 `docs/build-path-contract.md`）
   - 明确每个阶段的 `input -> temp -> output -> release`。
   - 明确哪些目录可提交、哪些必须忽略。
3. 收敛 sidecar 规则
   - `ui-react/src-tauri/binaries/` 仅作为“最终打包输入目录”。
   - 所有中间产物先放 `.artifacts/sidecar/`，最后一步再复制到 `binaries/`。
4. 修补 ignore 与清理脚本
   - 增加 `scripts/clean_artifacts.sh`，统一清理 `build/ dist/ ui-react/dist ui-react/src-tauri/target ui-react/test-results`。
   - 明确保留 `binaries/README.md`、其余归档默认忽略。

### 中期（有计划迁移，建议单独 phase）

1. 目录分层重组（建议目标）
   - `apps/backend/`（Python）
   - `apps/web/`（React）
   - `apps/desktop/`（Tauri）
   - `artifacts/`（所有构建产物）
2. 将跨层路径改为显式变量
   - `BACKEND_DIST_DIR`、`SIDECAR_STAGING_DIR`、`DESKTOP_BUNDLE_DIR`。
   - `scripts/build.sh` 不再硬编码 `../ui-react/src-tauri/...`。
3. 把 quick task 记录格式标准化
   - 为 `.planning/STATE.md` quick table 补一个“唯一编号 + 目录链接格式”校验脚本，防止持续漂移。

## 4) 建议的落地顺序

1. 先做命令入口收口 + 文档契约（低风险，高收益）
2. 再做产物路径统一与 clean 脚本（降低仓库噪音）
3. 最后再做目录物理迁移（避免一次性重构失控）

## Deviations from Plan

- None. 本次按 quick 目标仅进行现状梳理与建议输出，不改业务代码。

## Self-Check: PASSED
