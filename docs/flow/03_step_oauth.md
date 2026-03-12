# Glancier OAuth Step 专项说明

## 1. 适用范围

`oauth` step 用于需要授权码换令牌或设备授权的场景。Flow 侧负责“缺凭据时阻塞，授权完成后恢复”。

参考：
- [Flow 架构总览](./01_architecture_and_orchestration.md)
- [Flow Step 参考](./02_step_reference.md)

## 2. 执行阶段

1. 检查是否已有有效 token（Secrets）。
2. 无 token 或 token 失效时触发 OAuth 交互。
3. 用户完成授权后回传 token。
4. Flow 持久化 token 并恢复后续步骤。

## 3. 支持的复杂场景

- Authorization Code + PKCE
- Device Flow（RFC 8628）
- Client Credentials（服务端凭据）
- Callback 兼容 `?code=` 与 `#access_token=`

## 4. 建议输出与持久化

建议至少维护以下字段：
- `access_token`
- `refresh_token`（如有）
- `expires_at` 或 `expires_in`
- `token_type`

并在 `secrets` 中明确映射，保证续期与恢复可追踪。

## 5. 错误与恢复

常见失败：
- 用户拒绝授权
- `invalid_client`
- token 过期或刷新失败

建议处理：
- 保持 source 状态可恢复（不崩溃）
- 在 UI 提示明确“重连 OAuth”动作
- 失败样例见 [04_step_failure_test_inputs.md](./04_step_failure_test_inputs.md)
