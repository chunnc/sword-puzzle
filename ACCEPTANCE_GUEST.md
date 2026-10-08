# Acceptance: guest sessions, client 1.3

Run in the separate Codex chat with **gpt-6-luna / high**. Test only: do not edit source, tests, environment/configuration, dependencies, commits or deployments. If a prerequisite is absent, report BLOCKED. Save evidence under `/private/tmp/sword-guest-acceptance/`, never in source. The parent chat owns all fixes.

## Prepared environment

- Repo: `/Users/trung/Projects/sword-puzzle`; record `git status --short` and a hash of tracked/untracked source before/after. The parent freezes source during this run.
- App bundle: `com.kiemkhaitienlo.acceptance`, isolated from the normal app and its Keychain.
- Device A: iPhone 16e, `F5086A4F-4E4B-4517-8BB3-0D007BE6438F`.
- Device B: iPhone 17 Pro, `F366F9C2-27CA-44B2-98D4-13747012D76A`.
- Metro: `http://127.0.0.1:8097`; demo Firebase Emulator: `127.0.0.1:5001/8080/9099`; local fault proxy: `http://127.0.0.1:8787`. Do not connect to production.
- Development bridge is enabled only for the explicit acceptance flag plus localhost proxy. No tokens or device secrets are returned by `state()`.

Native Device Hub automation may be unavailable. Use the supplied CDP tool against the actual simulator Hermes runtime, and simulator screenshots. Distinguish runtime callback coverage from native touch coverage. Never claim a native tap occurred when a callback was invoked through the bridge.

## Existing tools (do not modify)

List runtime IDs:

```sh
node tools/acceptance-cdp.mjs --list
```

Run an action, using the page ID or exact deviceName from the list:

```sh
node tools/acceptance-cdp.mjs --device DEVICE --expression '__swordAcceptance.state()'
```

Bridge actions: `fresh()`, `recover()`, `initializeTwice()`, `register(email,password)`, `login(email,password,confirmed)`, `logout()`, `start(levelId)`, `purchase(category,id)`, `equip(loadout)`, `sync()`, `expire(refreshAlso)`, `rememberSession()`, `probeStale()`, `wrongKey()`, `legacy()`, `route(path)`.

`route('/account')` opens the real account screen. Once mounted, `account.credentials(email,password)`, `account.login()`, `account.register()`, `account.switch()` invoke that screen's actual callbacks. `alert()` returns the native alert's title/body/action labels; `chooseAlert(label)` invokes the corresponding callback. The actual native alert is still shown; terminate/reopen the test app to dismiss it if native UI input is unavailable.

Restart without clearing data:

```sh
xcrun simctl terminate DEVICE_UDID com.kiemkhaitienlo.acceptance
xcrun simctl launch --terminate-running-process DEVICE_UDID com.kiemkhaitienlo.acceptance --initialUrl http://127.0.0.1:8097
```

Capture evidence:

```sh
xcrun simctl io DEVICE_UDID screenshot /private/tmp/sword-guest-acceptance/AT01.png
```

Control the disposable emulator through POST `/__control` with JSON. Supported actions:

- `{"action":"reset"}` clears fault settings/log and throttling, preserves profiles.
- `{"action":"offline","value":true}`; set false to reconnect.
- `{"action":"fault","path":"/v2/auth/login","drop":true}` forwards one request, then drops its response.
- `{"action":"fault","path":"/v2/profile/sync","drop":true}` creates a pending request after server commit.
- `{"action":"account","uid":"UID","mode":"disable"}`; modes enable/delete/revoke also available.
- `{"action":"profile","uid":"UID","coins":250,"levels":8}` prepares known wallet/unlocks; call `recover()` on both devices afterward.
- GET `/__control` returns sanitized events (paths/statuses only).

Use disposable emails such as `luna-a-RUN@acceptance.test` and `luna-b-RUN@acceptance.test`, password `acceptance-password-123`. Do not output real credentials, Firebase tokens or device secrets.

## Scenarios

| ID | Steps | Expected |
|---|---|---|
| AT01 | Inspect a clean acceptance app on A; use fresh() if previous disposable fixtures exist. | Map is usable, isGuest=true, initialized=true, no mandatory login. |
| AT02 | start(1), capture UID/runId/signature; terminate and reopen. | Same UID and board signature; server profile retained. |
| AT03 | Reset proxy events; initializeTwice(). | Same UID; one device-session initialization request, no extra guest. |
| AT04 | Start a guest board; register disposable A email. | Same UID, profile and runId/signature; isGuest=false. |
| AT05 | Keep registered A as target; on B open /account, set target credentials, call account.login(). Inspect native warning and alert(). Invoke Hủy (or terminate to dismiss); verify UID unchanged. Repeat and choose Chuyển tài khoản. | Warning only when leaving guest; cancellation preserves guest. Confirmation loads A's profile without merging B's wallet/progress. Seed distinct wallets if needed. |
| AT06 | Create/register a separate disposable B account, then switch linked A to B account. Use actual account callback or bridge login. | No guest loss warning; binding changes once and target data appears. |
| AT07 | On a usable session call expire(false), then recover(). Inspect proxy events. | Refresh succeeds; same UID/board; authRequired=false. |
| AT08 | Call expire(true), then recover(). | Refresh fails, device-session restores same UID/board; no mandatory login. Repeat with a pending equip request if available. |
| AT09 | Arm response drop for /v2/auth/login; login to another linked disposable account. | Reconciliation or restart restores target account; one binding increment, no duplicate switch. |
| AT10 | Log both devices into the same disposable account. Seed coins=250, levels=8; recover both. Concurrently buy skill hoa-lien on A and dan-loi on B. | One purchase succeeds; no negative wallet. After recover both show the same canonical profile. Boards remain local. |
| AT11 | On A rememberSession(); logout or switch. probeStale(); inspect/recover B. | Old A token receives 401; B keeps access to original account. |
| AT12 | Arm drop for /v2/profile/sync; equip valid default loadout. Record pending ID, then set proxy offline=true, recover; reconnect and sync/recover. | Identity is unchanged. Pending operation resolves with original ID; canonical profile, no duplicate charge/reward. |
| AT13 | wrongKey(). Disable current account using control; expire(true), recover. Re-enable, explicitly login if necessary. Revoke and recover; finally delete a disposable account and recover. | Invalid key/disabled/revoked/deleted recovery is denied; account screen provides recovery/new guest actions. Explicit fresh() creates a distinct guest; old deleted UID is not recreated. |
| AT14 | Call legacy(), record no credentials; terminate/reopen. | Legacy fixture is adopted with the same UID; bound session and usable map. State UID should begin with legacy emulator's generated UID, not guest_installation; use profile/run evidence if needed. |

Do not replace a simulator scenario with a shell-only API test. The parent already ran unit/integration tests. When a step cannot be driven or observed, label that part BLOCKED and explain why.

## Report

One final report only: scenario ID, PASS/FAIL/BLOCKED, reproducible steps, expected/actual, evidence paths. Include native UI vs runtime callback limitations, source fingerprint before/after, and any missing prerequisites. Do not fix failures or change models. The parent chat collects the final report through wait_threads and owns triage/retesting.
