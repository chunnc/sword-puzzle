# Spiral currencies and simplified equipment sockets

Six assets were generated individually with the built-in ImageGen tool. The
source PNGs and exact prompts live in `assets/ui-source/runtime/`; runtime
sprites are 512×512 WebP, quality 90, with alpha. The existing 72-point HUD
tray was retained. Premium currency is now named Tien Ngoc and stays at 0.

`asset-scale.png` shows the currencies at 30 pixels beside existing game art,
the four socket frames at 84 pixels, and equipped icons at 72 pixels inside
their frames. This sheet only composes the generated runtime art for review.

Native captures use the installed Expo development app on the 3× iPhone 16e
simulator with temporary viewport constraints. Captures crop the requested
viewport without resizing or repainting:

- `character-320x568-locked.png`: 0 Linh Thach, 500 EXP, locked second skill.
- `character-360x640-empty.png`: 12,345 Linh Thach, 1,600 EXP, empty second skill.
- `character-360x780-equipped.png`: 999,999 Linh Thach, both skills equipped.
- `character-live-native.png`: real player state and full native viewport.

The fixtures used a temporary read-only React context. They did not call store
mutations, persist fake balances, change real loadouts, or make purchases.
All fixture routes, context imports and viewport overrides were removed after
capture. The floating white gear on some captures belongs to the Expo
development client, not the game UI.

Review confirmed readable spiral shapes, distinct currency colors, quiet
frame interiors, clear plus/lock states, and equipment art inside the rims.
The scene fits without scrolling or overlapping the fixed HUD/navigation.
TypeScript and all 11 client test suites (130 tests) passed, including currency
accessibility labels, shop/menu navigation, equipment layers and locked slots.
