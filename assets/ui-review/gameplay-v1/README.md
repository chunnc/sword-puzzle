# Gameplay UI review

Native PNGs were captured from the installed Expo development app on the
3× iPhone 16e simulator. Viewport constraints cover 320×568, 360×640,
360×780 and 390×844 points. Each capture crops the requested viewport;
the individual screen PNGs are neither resized nor repainted. The four
`review-*.png` sheets are scaled contact sheets for comparing goal types.

`capture-manifest.json` records the 38 visual fixtures: collection, rocks,
seals, battle and boss at all four sizes; locked/empty/equipped skill sockets,
insufficient qi, targeting before/after selection, exit confirmation, a final
skill at zero moves, loss and already-used skills at the smallest/largest sizes.

A temporary React context supplied independent engine snapshots and disabled
all store mutations, ads and wallet changes. The run uses Trọng Nhạc even
when the live profile differs. All fixture routes, context imports and state
initializers were removed after capture. All real save-file hashes are identical
before and after review. The floating gear on some screenshots belongs to
the Expo development client.

`layout-stability.json` measures the board's continuous gold outline in the
unscaled native screenshots. Idle, targeting and selected-target states have
identical bounds at 320×568 and 390×844; the measured drift is zero pixels.
The board remains square. Instructions stay in the selected skill caption,
so no instruction banner covers the top row of tiles. Compact layouts reduce
the boss and equipment frames while keeping gameplay buttons at least 44×44.

Four source sprites and exact built-in ImageGen prompts are documented in
`assets/ui-source/README.md`. `asset-validation.json` records dimensions,
file sizes and preserved transparent alpha for the runtime WebP sprites.

Validation: client TypeScript and all 14 test suites (196 tests) pass.
Coverage includes all goal types, snapshot equipment, qi discounts, targeting,
cast confirmation, fixed control size, exit/cancel, Android back handling,
busy-state blocking, resuming the same saved run, and compact seal rendering.

`character-live-native.png` and `map-live-native.png` verify the existing shared
HUD/navigation outside gameplay. `game-live-native.png` is the final production
screen with the actual player's saved level 5 and unconstrained native layout.
