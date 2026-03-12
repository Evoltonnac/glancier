---
created: 2026-03-09T15:23:08.115Z
title: project-structure-reorganization
area: planning
files:
  - Makefile
  - scripts/build.sh
  - scripts/clean_artifacts.sh
  - ui-react/package.json
  - ui-react/src-tauri/tauri.conf.json
  - .planning/quick/8-python-react-tauri/8-SUMMARY.md
---

## Problem

当前 Python / React / Tauri 的目录与构建产物路径跨层耦合，命令入口分散，导致维护成本高、构建行为不透明、仓库噪音大（如多个产物目录并存、源码目录夹带构建产物）。

## Solution

按“先契约、后迁移”推进项目重组：
1. 统一根级命令入口（Makefile/脚本层）。
2. 明确 build path contract（input/temp/output/release）。
3. 先收敛 sidecar 与构建产物路径，再进行物理目录迁移（apps/backend、apps/web、apps/desktop、artifacts）。
4. 为 `.planning/STATE.md` 的 quick/todo 记录增加格式校验，避免后续继续漂移。
