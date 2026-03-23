---
status: diagnosed
phase: 04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures
source:
  - .planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-01-SUMMARY.md
  - .planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-02-SUMMARY.md
  - .planning/phases/04-improve-web-scraping-stability-remove-focus-stealing-fallback-and-allow-retry-for-uncertain-failures/04-03-SUMMARY.md
started: 2026-03-20T07:04:00Z
updated: 2026-03-20T07:32:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Auth-Wall Failure Creates Manual-Only Recovery Signal
expected: When scraping hits login/captcha/auth-wall behavior, the source should become suspended with a manual recovery signal (`auth.manual_webview_required`). The UI should indicate manual action is needed, and no scraper window should auto-focus or pop to foreground.
result: issue
reported: "403/401的数据源，抓取后先变成缺少凭证待操作（符合预期），然后变成了错误Scraper task cancelled by user（不符合预期）。另外在创建出scraper task时，会聚焦到主屏幕的那个1*1抓取窗口，很影响体验，这个必须想办法修复，请分析离屏webview渲染的可能性（因为在窗口hide时，虽然有些webview抓取会失败，但也是可以成功的，不可能在窗口show的时候创建的webview抓取非得抢夺用户焦点）"
severity: major

### 2. Uncertain Failure Is Classified as Retry-Required
expected: When scraping fails for a non-auth uncertain reason, the source should become `error` with `error_code=runtime.retry_required`, and there should be no manual webview interaction prompt.
result: issue
reported: "不应该是这样的结果。非鉴权类的错误也有可能是因为无法识别到需要鉴权，导致超时。所以即使出现这种状况，也不要变成 error，并且需要给用户 manual webview 的交互提示。"
severity: major

### 3. Retry-Required Errors Use Bounded Automatic Retries
expected: A `runtime.retry_required` source should auto-retry with increasing backoff windows and stop after the retry cap (3 attempts), rather than retrying forever.
result: issue
reported: "不知道为什么，这个超时的任务以稳定的80秒间隔在重试，并且已经超过三次重试。很显然，这是因为重试时会更新其 update 时间，而重试又依赖 update 时间进行判断。退避规则导致进入了无限循环。Update 时间是不能改动的，需要的话，加一个重试时间之类的标识吧。"
severity: major

### 4. Network Timeout Uses the Same Retry Policy
expected: A `runtime.network_timeout` failure should follow the same bounded retry behavior as retry-required failures (policy-driven retries with cap).
result: issue
reported: "和上述一样进行检查。"
severity: major

### 5. Repeated Identical Fail Callbacks Stay Idempotent
expected: Re-sending the same scraper fail callback should not create duplicate manual prompts or inconsistent state churn for the same source.
result: pass

### 6. Background/Default Queue Actions Do Not Foreground Window
expected: Scraper queue actions without explicit foreground intent should not bring the scraper window to front; the app should stay in current focus unless user explicitly asks otherwise.
result: issue
reported: "如前面所说，会聚焦到1*1的webview上"
severity: major

### 7. Explicit Foreground Action Still Works for Manual Recovery
expected: When user explicitly requests foreground/manual recovery, the scraper window should open and focus correctly for intervention.
result: pass

## Summary

total: 7
passed: 2
issues: 5
pending: 0
skipped: 0

## Gaps

- truth: "When scraping hits login/captcha/auth-wall behavior, the source should become suspended with a manual recovery signal (`auth.manual_webview_required`). The UI should indicate manual action is needed, and no scraper window should auto-focus or pop to foreground."
  status: failed
  reason: "User reported: 403/401的数据源，抓取后先变成缺少凭证待操作（符合预期），然后变成了错误Scraper task cancelled by user（不符合预期）。另外在创建出scraper task时，会聚焦到主屏幕的那个1*1抓取窗口，很影响体验，这个必须想办法修复，请分析离屏webview渲染的可能性（因为在窗口hide时，虽然有些webview抓取会失败，但也是可以成功的，不可能在窗口show的时候创建的webview抓取非得抢夺用户焦点）"
  severity: major
  test: 1
  root_cause: "Auth-required handoff does not end active-task timeout tracking; frontend watchdog cancels the claimed task and backend classifies cancellation text as retry_required error, which can override manual-required state."
  artifacts:
    - path: "ui-react/src/hooks/useScraper.ts"
      issue: "Task timeout watchdog cancels claimed task when no terminal stage is emitted."
    - path: "ui-react/src-tauri/src/scraper.rs"
      issue: "Auth-required handoff emits warning but does not clear active task or emit terminal lifecycle stage."
    - path: "core/api.py"
      issue: "Cancellation reason falls through classifier to retry_required and persists error status."
  missing:
    - "Stop timeout-driven auto-cancel after auth-required handoff."
    - "Mark auth-required transfer as terminal for timeout tracking."
    - "Handle cancellation reasons without overriding manual-required state."
  debug_session: ".planning/debug/phase04-auth-wall-state-overwritten-by-timeout-cancel.md"
- truth: "When scraping fails for a non-auth uncertain reason, the source should become `error` with `error_code=runtime.retry_required`, and there should be no manual webview interaction prompt."
  status: failed
  reason: "User reported: 不应该是这样的结果。非鉴权类的错误也有可能是因为无法识别到需要鉴权，导致超时。所以即使出现这种状况，也不要变成 error，并且需要给用户 manual webview 的交互提示。"
  severity: major
  test: 2
  root_cause: "Failure classification is binary keyword-based and defaults unmatched reasons to retry_required; there is no ambiguous branch that preserves manual recovery prompt for hidden-auth uncertainty."
  artifacts:
    - path: "core/api.py"
      issue: "Non-manual keywords always map to retry_required and error status."
    - path: "core/executor.py"
      issue: "Webview runtime error normalization mirrors strict manual-vs-retry split."
  missing:
    - "Introduce an ambiguous webview-failure branch with manual interaction guidance."
    - "Prefer structured failure codes from scraper runtime over plain-text keyword matching."
    - "Keep deterministic error_code while allowing suspended/manual flow for uncertain auth-like failures."
  debug_session: ".planning/debug/phase04-uncertain-failure-classification-too-aggressive.md"
- truth: "A `runtime.retry_required` source should auto-retry with increasing backoff windows and stop after the retry cap (3 attempts), rather than retrying forever."
  status: failed
  reason: "User reported: 不知道为什么，这个超时的任务以稳定的80秒间隔在重试，并且已经超过三次重试。很显然，这是因为重试时会更新其 update 时间，而重试又依赖 update 时间进行判断。退避规则导致进入了无限循环。Update 时间是不能改动的，需要的话，加一个重试时间之类的标识吧。"
  severity: major
  test: 3
  root_cause: "Retry budget lives in volatile in-memory state and is cleared on transient active status; backoff anchor uses mutable updated_at, so attempts can reset and repeatedly re-enter early retry windows."
  artifacts:
    - path: "core/refresh_scheduler.py"
      issue: "Retry state is dropped when status becomes active and backoff uses updated_at."
    - path: "core/data_controller.py"
      issue: "set_state rewrites updated_at on each transition, coupling retry timing to general state churn."
  missing:
    - "Persist retry metadata per source/signature (attempts, first_failed_at, next_retry_at)."
    - "Reset retry budget only after success or signature change, not transient active."
    - "Use stable retry timestamps rather than updated_at as backoff source."
  debug_session: ".planning/debug/phase04-retry-budget-resets-and-backoff-coupled-to-updated-at.md"
- truth: "A `runtime.network_timeout` failure should follow the same bounded retry behavior as retry-required failures (policy-driven retries with cap)."
  status: failed
  reason: "User reported: 和上述一样进行检查。"
  severity: major
  test: 4
  root_cause: "Shares the same retry-state reset and updated_at coupling defect as runtime.retry_required path because both codes follow the same scheduler branch."
  artifacts:
    - path: "core/refresh_scheduler.py"
      issue: "network_timeout and retry_required share allowlisted retry logic and the same state-reset behavior."
    - path: "core/data_controller.py"
      issue: "updated_at mutation affects timeout-path backoff calculation."
  missing:
    - "Apply the same persistent retry-metadata fix to network_timeout path."
    - "Decouple retry clock from updated_at updates."
  debug_session: ".planning/debug/phase04-retry-budget-resets-and-backoff-coupled-to-updated-at.md"
- truth: "Scraper queue actions without explicit foreground intent should not bring the scraper window to front; the app should stay in current focus unless user explicitly asks otherwise."
  status: failed
  reason: "User reported: 如前面所说，会聚焦到1*1的webview上"
  severity: major
  test: 6
  root_cause: "Background queue execution explicitly creates a visible 1x1 worker window to keep webview in hierarchy, which still causes focus activation side effects on desktop."
  artifacts:
    - path: "ui-react/src-tauri/src/scraper.rs"
      issue: "Background worker window is built as visible(true), size 1x1 at position (0,0)."
    - path: "ui-react/src/hooks/useScraper.ts"
      issue: "Background queue path delegates to backend daemon, which always uses worker window strategy."
  missing:
    - "Add non-activating background window behavior to prevent focus steal."
    - "Implement hidden-first/offscreen fallback strategy with deterministic manual recovery path."
    - "Evaluate sidecar/headless scraping option for true no-window background execution."
  debug_session: ".planning/debug/phase04-background-window-focus-steal-and-offscreen-feasibility.md"
