# Glancier OAuth Step Guide

## 1. Scope

The `oauth` step is used for authorization-code exchange and device authorization.
Flow is responsible for blocking when credentials are missing and resuming after authorization completes.

References:
- [Flow Architecture](./01_architecture_and_orchestration.md)
- [Flow Step Reference](./02_step_reference.md)

## 2. Execution Stages

1. Check whether a valid token already exists in secrets.
2. If missing/expired, start OAuth interaction.
3. Receive user-authorized token data.
4. Persist token and resume downstream Flow steps.

## 3. Supported Advanced Scenarios

- Authorization Code + PKCE
- Device Flow (RFC 8628)
- Client Credentials
- Callback compatibility for both `?code=` and `#access_token=`

## 4. Recommended Outputs and Persistence

Canonical output/persistence field:
- `oauth_secrets` (dictionary payload, including `access_token` and optional refresh/expiry fields)

Flow references should use dotted paths (for example `oauth_secrets.access_token`) instead of flat token fields.

## 5. Errors and Recovery

Common failures:
- User denied authorization
- `invalid_client`
- Expired token or refresh failure

Recommended handling:
- Keep source state recoverable (no crash path)
- Provide a clear “Reconnect OAuth” UI action
- Failure examples: [04_step_failure_test_inputs.md](./04_step_failure_test_inputs.md)
