# Compact shop purchase panel

The panel now uses a fixed-size corner X instead of the bottom close button.
The separate currency price row and unlock caption are removed. The purchase
button contains the app-rendered Mua label, price and existing Linh Thach icon.
Locked items show “Cần vượt qua màn X”.

The new close sprite was generated using the built-in ImageGen tool, with
the existing shop secondary button and dialog as style references. The
source PNG and exact prompt are `assets/ui-source/runtime/shop-close-icon.*`.
The runtime WebP retains alpha, is at most 256 pixels per edge, and uses
quality 90. It is displayed at 32x32 points in a 44x44-point corner target.

The content uses an ordinary View, a 72-point item illustration and 8-point
gaps. The modal reads the existing screen safe-area insets before opening
and applies them as padding to a plain View. There is no native SafeAreaView
in the modal, no content ScrollView, no post-show size update and no animation.
The shop catalogue keeps its existing scrolling behavior and card labels.

Native captures use the installed Expo development app on the 3x iPhone 16e,
iOS 26.3. Temporary viewport constraints render 320x568, 360x640 and 390x844
points. Captures are cropped without resizing or repainting. The five cases
at every viewport are sword, skill, locked, short balance and save error.
Floating white gears belong to the Expo development client.

`layout-stability.json` records all native position and size samples at the
initial layout and approximately 100, 250 and 500 ms afterward. It covers
18 openings, including the first review opening and two repeated openings.
All 18 cases retained identical x, y, width and height: maximum drift 0 px,
below the 1-pixel acceptance threshold. The measurement callbacks never
changed the panel dimensions or visibility.

A temporary React context supplied read-only profile fixtures and HUD widths.
Its purchase/equip/notice handlers could not mutate the real save, wallet,
loadout or operations queue. Error fixtures injected only an ephemeral panel
message. All review routes, contexts, viewport constraints, measurement refs,
timers and localhost telemetry calls were removed from the production code.

Validation includes TypeScript and all 13 client test suites (175 tests), purchase and
retry behavior, X/backdrop/Back dismissal, in-flight guards, complete catalogue
descriptions, safe-area padding, the new button content, and the unchanged
inventory and navigation behavior.
