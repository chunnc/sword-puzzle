# Auth scene and popup review

Screenshots: iPhone 17 Pro simulator, iOS 26.3, October 15, 2026.
The isolated `com.kiemkhaitienlo.acceptance` build connects only to the demo Firebase Emulator through the local acceptance proxy.

- `welcome.png`: cold launch with a linked account stays on the scene until Play.
- `login.png`: shared transparent popup over the welcome illustration.
- `register.png`: account creation adds password confirmation and a readable secondary button.

Verified using real screen callbacks through the development acceptance bridge (not native taps): mismatched confirmation shows an inline error; registration keeps the guest UID and enters the map; closing the in-game popup returns to the map; logout returns to welcome; closing the welcome popup allows Play to enter as a guest. Background/foreground was exercised by launching Safari and returning to the same app process; the map remained visible. A terminated/relaunched process showed welcome again with the linked session restored.

Checks: client typecheck, 52 Jest suites / 865 tests, and native iOS simulator build passed. Android, a small-screen native device, hardware Back and native keyboard/touch interaction were not exercised; validation and navigation guards have automated component coverage.

Artwork and exact imagegen prompts are in `assets/ui-source/auth-welcome/README.md`.
