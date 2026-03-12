---
status: awaiting_human_verify
trigger: "tauri-tray-menu-not-working: Tauri托盘图标右键菜单一直无法生效"
created: 2026-03-08T00:00:00Z
updated: 2026-03-08T00:19:00Z
---

## Current Focus

hypothesis: App needs to be configured as LSUIElement (background/accessory app) to have tray menu work in fullscreen contexts
test: add LSUIElement to Info.plist or configure activation policy to make app a background app
expecting: changing to background app will allow tray menu to appear in fullscreen
next_action: configure app as LSUIElement/background app via tauri.conf.json or build configuration

## Symptoms

expected: Right-click on tray icon should show menu with items (显示窗口, 集成管理, 设置, 退出) in ALL contexts including fullscreen apps
actual: Menu appears on main desktop but NOT when user is in fullscreen applications (browser, IDE, etc). Other apps' tray menus work fine in fullscreen.
errors: No error messages in console or logs
reproduction: Launch app, enter fullscreen app (e.g., fullscreen browser), right-click tray icon - no menu appears
started: Partial fix applied - works on desktop but not in fullscreen contexts
platform: macOS

## Eliminated

- hypothesis: Menu not attached to TrayIconBuilder
  evidence: Line 132 shows .menu(&tray_menu) is present, menu is properly attached
  timestamp: 2026-03-08T00:03:00Z

- hypothesis: .show_menu_on_left_click(false) preventing all menu display
  evidence: Removing this line fixed menu on desktop, but not in fullscreen contexts
  timestamp: 2026-03-08T00:10:00Z

## Evidence

- timestamp: 2026-03-08T00:01:00Z
  checked: lib.rs lines 85-120 (tray setup)
  found: Menu is built with MenuBuilder (lines 85-103) with 4 items, but TrayIconBuilder (lines 105-120) only has .icon(), .tooltip(), .on_tray_icon_event() - NO .menu() call
  implication: Menu exists in memory but is never attached to the tray icon, so right-click shows nothing

- timestamp: 2026-03-08T00:03:00Z
  checked: lib.rs lines 119-168 (actual create_tray function)
  found: Menu IS attached at line 132 with .menu(&tray_menu), and .on_menu_event() handler exists at line 135-137
  implication: Previous hypothesis was WRONG - menu is properly attached, issue must be elsewhere

- timestamp: 2026-03-08T00:04:00Z
  checked: Tauri GitHub issues and documentation
  found: Issue #4002 mentions "tray menu pops up when you right-click on both Windows and macOS" - but code has .show_menu_on_left_click(false) at line 134
  implication: Setting show_menu_on_left_click(false) might be disabling ALL menu display on macOS, not just left-click

- timestamp: 2026-03-08T00:10:00Z
  checked: User verification after removing .show_menu_on_left_click(false)
  found: Menu now works on main desktop but NOT in fullscreen applications. Other apps' tray menus work fine in fullscreen.
  implication: This is a window level or permissions issue specific to how Tauri creates tray menu windows vs native macOS apps

- timestamp: 2026-03-08T00:11:00Z
  checked: StackOverflow questions about NSStatusItem menus in fullscreen
  found: Multiple reports of NSStatusItem menus not showing in fullscreen (SO #47674502, #29153729). Solution involves NSWindowCollectionBehaviorFullScreenAuxiliary for custom windows, but NSMenu (used by NSStatusItem) should work automatically
  implication: This is a known macOS issue, but native NSMenu attached to NSStatusItem should work in fullscreen without special configuration

- timestamp: 2026-03-08T00:12:00Z
  checked: Tauri GitHub and tray-icon library documentation
  found: No specific issues about tray menus not working in fullscreen contexts. Tauri uses tray-icon crate which wraps native NSStatusItem on macOS
  implication: This might be a Tauri/tray-icon bug or limitation not yet reported, or there's a configuration issue

- timestamp: 2026-03-08T00:13:00Z
  checked: Cargo.toml dependencies
  found: cocoa-foundation and objc crates are available for macOS-specific code
  implication: Could potentially use native macOS APIs to fix the issue if Tauri's abstraction is insufficient

- timestamp: 2026-03-08T00:14:00Z
  checked: StackOverflow #7157145 - NSStatusItem menu in fullscreen
  found: CRITICAL - "Your app is considered a foreground app, so all its UI is disabled while another app is in full screen. You should file a bug if you feel that status items in foreground apps should still be available"
  implication: This is the root cause - Tauri apps are foreground apps by default, and macOS disables foreground app UI (including tray menus) when another app is fullscreen

- timestamp: 2026-03-08T00:15:00Z
  checked: Tauri GitHub issue #2258 and discussion #6093
  found: Tauri has set_activation_policy() API available. Discussion #6093 shows it's set to NSApplicationActivationPolicyRegular by default. Issue #2258 discusses exposing this API.
  implication: Need to change activation policy to Accessory or Prohibited to make tray menu work in fullscreen contexts

- timestamp: 2026-03-08T00:16:00Z
  checked: Tauri GitHub issue #5122 about set_activation_policy
  found: Bug report that set_activation_policy(Accessory) breaks window.show(). This is a known issue with Accessory policy.
  implication: Using Accessory policy may cause issues with showing the main window. Need to test carefully or find workaround.

## Resolution

root_cause: Tauri apps use NSApplicationActivationPolicyRegular by default, making them foreground apps. macOS disables all UI (including tray menus) from foreground apps when another app is in fullscreen mode. Need to change to Accessory policy, but this breaks window.show() (Tauri issue #5122). Solution: dynamically switch activation policy - use Accessory when window hidden, Regular when window shown.
fix: Implemented dynamic activation policy switching - start with Accessory in setup(), switch to Regular when showing window, switch back to Accessory when hiding window
verification: Need to test - rebuild app and verify tray menu works in fullscreen contexts
files_changed: ["/Users/xingminghua/Coding/tools/quota-board/ui-react/src-tauri/src/lib.rs"]
