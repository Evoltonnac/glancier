# Step failure test integrations (single-file-single-instance)

These presets follow the current integration spec:
- One integration object per YAML file
- Integration id comes from filename stem
- No top-level `id` field

## 1) `test_fail_step_api_key.yaml`
- Purpose: validate `api_key` invalid-credential path (`ERROR` + `input_text` re-entry)
- User input (interaction field):
  - `test_api_key`: `sk-test-invalid`
- Expected after refresh:
  - HTTP 401 at `fetch_unauthorized`
  - source status: `error`
  - interaction: `input_text` (ask user to re-enter API key)

## 2) `test_fail_step_oauth.yaml`
- Purpose: validate `oauth` missing/invalid credential handling
- User input (first interaction, if token missing):
  - `client_id`: `test-client-id-invalid`
  - `client_secret`: `test-client-secret-invalid`
- Optional direct failure seed:
  - `access_token`: `test-token-invalid`
- Expected after refresh:
  - HTTP 401 at `fetch_unauthorized` (when token exists)
  - source status: `error`
  - interaction: `oauth_start` (ask user to reconnect)

## 3) `test_fail_step_curl.yaml`
- Purpose: validate `curl` invalid-session path (`ERROR` + cURL re-entry)
- User input (interaction field):
  - `test_curl_command`: `curl 'https://example.com' -H 'Authorization: Bearer invalid-token'`
- Expected after refresh:
  - HTTP 401 at `fetch_unauthorized`
  - source status: `error`
  - interaction: `input_text` (ask user to paste fresh cURL)

## 4) `test_fail_step_webview.yaml`
- Purpose: validate web scraper blocked recovery (`SUSPENDED` + `webview_scrape` foreground/manual flags)
- User input (interaction payload):
  - `test_webview_data`: `{"session": "invalid", "note": "failure-test"}`
- Expected after refresh:
  - HTTP 403 at `fetch_blocked`
  - source status: `suspended`
  - interaction: `webview_scrape`
  - interaction data includes `force_foreground=true`, `manual_only=true`
