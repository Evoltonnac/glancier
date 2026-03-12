---
status: resolved
trigger: "github-device-oauth-persistence: GitHub device flow 状态持久化"
created: 2026-03-11T09:00:00Z
updated: 2026-03-11T09:50:00Z
---

## 问题

1. 弹窗关闭后轮询停止
2. 前端刷新后丢失 device flow 状态

## Root Cause

- 前端完全依赖弹窗打开状态来轮询
- 没有后端持续轮询机制
- 状态没有持久化

## Fix Applied

### 后端修改 (core/auth/oauth_auth.py)

1. 添加 `_save_device_flow_status()` - 将 device flow 状态持久化到 secrets
2. 添加 `get_device_flow_status()` - 获取状态，如果是 pending 自动触发轮询
3. 修改 `start_device_flow()` - 启动时保存 pending 状态
4. 修改 `poll_device_token()` - 每次轮询后保存状态

### API 添加 (core/api.py)

1. 添加 `GET /oauth/device/status/{source_id}` - 查询 device flow 状态
2. 修改 `GET /sources/{source_id}/auth-status` - 返回 pending 状态

### 前端修改 (ui-react)

1. api/client.ts - 添加 `getDeviceFlowStatus()` 方法
2. FlowHandler.tsx - 打开弹窗时检查已有状态，恢复轮询

## Verification

重启后端和前端测试：
1. 打开设备授权弹窗
2. 关闭弹窗
3. 再次打开弹窗 - 应该恢复状态并继续轮询
