# Gameplay result actions: vertical, intrinsic proportions

Wins and losses put Continue/Retry above Return in a centered vertical stack.
The gold and jade buttons retain their own intrinsic aspect ratios, resolved
from bundled metadata: 1400×363 and 1400×356. Images use `contain`; their heights
are derived from their widths instead of stretching into a fixed-height slot.

Normal button width is capped at 184 points. Panels narrower than 350 points
use a 168-point cap, 56-point star canvases, a 26-point title line, and tighter
spacing. Normal panels keep the 72-point star canvases. All touch targets stay
at least 44 points high. Press feedback changes opacity without a button scale
transform. The inventory panel's 800/671 ratio, generated star colors, popup
choreography, action locks and rewards remain unchanged.

## Native review

The capture manifest covers 24 iPhone 16e fixtures (3×): wins with 0–3 stars,
losses and busy actions at 320×568, 360×640, 360×780 and 390×844 points. Fixtures
use real production UI with independent board snapshots and do not mutate the
store, save or ad state. Full-screen captures are cropped without scaling;
the comparison sheet uses scaled copies. Expo's developer gear may be visible
outside the game UI.

Each capture waits for the Simulator to settle and verifies its visible EXP
reward (or loss heading) with macOS Vision OCR before advancing. The manifest
marks verified captures with `ocr_verified: true` to avoid recording a previous
route state during rapid fixture changes.

[Small-screen comparison](review-320x568.png) · [Capture manifest](capture-manifest.json)

The temporary review route is removed after capture. AsyncStorage hashes are
compared before and after to verify save preservation.

Validation: client TypeScript and all 16 Jest suites (230 tests) pass. Popup
coverage checks primary-before-return order on win/loss, vertical alignment,
both native image ratios, normal/compact sizing, minimum touch height,
opacity feedback without scaling, and the existing animation/action locks.
