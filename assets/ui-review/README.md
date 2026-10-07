# UI review captures

`after/1080x1920/` and `after/1080x2340/` contain captures of the original Unity prototype's map, exploration, battle, boss, breakthrough, win, loss, and account screens. They remain visual references for the React Native migration; the migration has not yet added replacement screen captures.

`before/` preserves the two references supplied for this review. The exploration reference is a cropped top section rather than a full-screen capture.

## React Native character revamp

`character/` contains native captures of the revamped character scene, using
the installed Expo development app and the existing 500 EXP player profile.
`1080x1920.png` and `1080x2340.png` use temporary viewport constraints of
360×640 and 360×780 points on the 3× iPhone simulator. `small-320x568.png`
uses 320×568 points. The constraints and temporary HUD widths are removed
after capture. Images crop only the viewport, without resizing or repainting.
`native-1170x2532.png` is the full unconstrained iPhone 16e capture.

The scene has no ScrollView; the character uses contain and the remaining
flex height. Headers, EXP label, all three equipment slots, and bottom
navigation stay visible at each size. Navigation, realm boundaries, locked
and empty slots, and motion lifecycle are also covered by client tests.

## HUD v2 and equipment sockets

`hud-v2/` contains native review captures for the 72-point dual-currency HUD,
outlined cultivation text, and square sword / circular skill sockets. The
set includes character states and viewport sizes, map, inventory, shop,
account, win, exploration, and boss scenes. See `hud-v2/README.md` for fixture
and capture details. The read-only fixtures and viewport constraints were
removed after verification; the real save and wallet were not changed.

## Spiral currencies and simplified sockets

`currency-slots-v3/` contains the latest 30-pixel currency / 84-pixel socket
review sheet, native captures at 320×568, 360×640 and 360×780 points, and the
final unconstrained player scene. It covers the green Linh Thach / purple
Tien Ngoc discs, equipped items, and simplified empty/locked frames. See
`currency-slots-v3/README.md` for read-only fixture and capture details.

## Two-column shop

`shop-v1/` contains native captures at 320x568, 360x640 and 390x844 points of
both categories, purchase dialogs, locked and insufficient-balance states,
single-item final rows, extended descriptions, empty catalogues, and the
inventory regression review. See `shop-v1/README.md` for asset provenance,
read-only fixture details and validation.
