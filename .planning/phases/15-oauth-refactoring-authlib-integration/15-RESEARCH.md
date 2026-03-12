# Phase 15 Research: OAuth Refactoring & Multi-Flow Support (Authlib Integration)

## Current State

### Backend Implementation
- `core/auth/oauth_auth.py`: Manual implementation of OAuth 2.0 Authorization Code flow with PKCE.
- `core/auth/manager.py`: Manages `OAuthAuth` instances per source.
- `core/api.py`: 
  - `/api/oauth/authorize/{source_id}`: Returns `authorize_url`.
  - `/api/sources/{source_id}/interact` (type `oauth_code_exchange`): Exchanges code for token.
- `core/steps/auth_step.py`: Checks for `access_token` and triggers `OAUTH_START` interaction if missing.
- `core/executor.py`: Handles `RequiredSecretMissing` and converts it to `InteractionRequest`.

### Frontend Implementation
- `ui-react/src/components/auth/FlowHandler.tsx`: Responds to `oauth_start` by opening a new window for authorization.
- `ui-react/src/components/auth/OAuthCallback.tsx`: Receives code/state and calls backend to exchange code.
- `ui-react/src/api/client.ts`: API client for interacting with the backend.

### Limitations
- Only supports Authorization Code flow.
- Manual PKCE and token management.
- No support for Device Flow (RFC 8628).
- No support for Client Credentials or Implicit flows.
- Polymorphic response handling for different OAuth flows is missing.

## Requirements for Phase 15

1. **Authlib Integration**:
   - Use Authlib's `AsyncOAuth2Client` to replace manual OAuth logic.
   - Leverage Authlib for standard compliance (PKCE, token refreshing, etc.).

2. **Multi-Flow Support**:
   - **Authorization Code + PKCE**: Existing, but needs refactoring.
   - **Device Authorization Grant (RFC 8628)**:
     - New flow: Request device code -> Display user code/URI -> Poll for token.
     - Backend: Start polling or handle async callback.
     - Frontend: New `DeviceFlowModal`.
   - **Client Credentials**: Support for service-to-service auth.
   - **Implicit Flow**: Support for cases where only a fragment is returned (though less common now).

3. **Frontend Upgrades**:
   - `DeviceFlowModal`: Verification URL, user code, countdown, polling status.
   - Unified OAuth interceptor: Handle both `?code=` and `#access_token=`.

4. **Tauri Integration**:
   - Use Tauri events for device flow notifications if needed.
   - Improve URL opening and callback handling in the desktop environment.

## Proposed Architecture Changes

### Backend
- Refactor `OAuthAuth` to use Authlib.
- Update `oauth_authorize` API to return polymorphic responses based on flow.
- Implement device flow polling in `OAuthAuth` or a separate background task.

### Frontend
- Update `FlowHandler` to handle new interaction types (e.g., `oauth_device_flow`).
- Implement `DeviceFlowModal` component.
- Refactor `OAuthCallback` to handle implicit flow fragments.

## Research Questions
- How to best integrate Authlib with the existing `SecretsController` for token persistence?
- Should device flow polling happen on the backend or frontend? (Backend is safer for secrets, but frontend needs the token).
- How to handle multiple active OAuth flows for the same source?

## Next Steps
- Implement Authlib-based `OAuthAuth`.
- Add Device Flow support to backend.
- Create frontend components for Device Flow.
- Update API and interaction handlers.
