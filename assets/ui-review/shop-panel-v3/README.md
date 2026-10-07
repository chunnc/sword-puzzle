# Fixed-ratio shop purchase panel

The shop panel keeps its existing width (20-point screen margins, maximum
340 points) and uses the exported background's 824:1000 aspect ratio. Its
height is independent of item text and purchase status. Item content flows
from the top, with a 104-point illustration, or 96 points and 6-point gaps at
320-point screen widths. Card artwork retains its existing 92-point cap.

The existing close sprite now renders at 44x44 points in a 56x56-point target,
12 points above and to the right of the panel. A transparent outer wrapper
contains the entire target. The purchase button is 80% of its previous width,
centered horizontally and anchored 20 points above the panel's bottom. A
fixed 36-point message area above it prioritizes saving, purchase errors,
unlock requirements, then insufficient currency.

The 15 PNGs are native captures at 320x568, 360x640 and 390x844 points from
the installed Expo development app on an iPhone 16e simulator, iOS 26.3, at
3 physical pixels per point. Each viewport covers a sword, Ngự Kiếm (the
longest current catalogue description), a locked item, insufficient currency,
and a save error. Captures crop only the viewport, without resizing or
repainting. Floating gray gears belong to the Expo development client.

`layout-stability.json` contains 132 native rectangle samples across 21
openings: the 15 capture cases, the first opening, two repeat openings and
three state-change sequences. Each sequence samples the initial committed
native layout and approximately 100, 250 and 500 ms later. State-change
sequences repeat these measurements while saving, after a save failure, and
after balance and progress changes. Maximum position or size drift is 0 px.
Aspect ratio, button width, centering and bottom offset are within the
1-physical-pixel rounding tolerance. The smallest gap between the full item
content and the message area is 9.67 points. The close target lies entirely
inside the wrapper in every sample.

Read-only fixtures used separate saves, no-op notice/equipment handlers and
a purchase handler that only rejects locally. The player's real save,
wallet, loadout and operation queue were not modified. All temporary routes,
contexts, refs, timers, profile overrides and localhost measurements were
removed from the client after capture.

Validation includes TypeScript and all 13 client suites (180 tests), full
catalogue descriptions, purchase/retry/in-flight guards, X/backdrop/Back
handlers and geometry changes across purchase states. Native review verifies
the visible X and its enclosing hit bounds; direct native tapping was not
available because the Device Hub computer-use connection timed out.
