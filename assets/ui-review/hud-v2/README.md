# Native HUD and character review

These captures use the installed Expo development app on the 3× iPhone 16e
simulator. Screens were rendered with temporary viewport constraints for
320×568, 360×640, 360×780 and the full 390×844-point screen. Images crop only
the requested native viewport; they are not resized or repainted.

A temporary read-only React context supplied visual fixtures without writing
the real Zustand store, save data or wallet. Fixtures cover 0, 760, 12,345 and
999,999 Linh Thach; the premium counter stays at 0. Character fixtures cover
500 EXP with a locked slot, 1,600 EXP with an empty/equipped second skill,
and 110,000 EXP with MAX progress. Gameplay includes exploration and boss.

All temporary route, context and viewport code was removed after capture.
`character-live-native.png` is the final scene using the actual player state
and unconstrained production layout.

The header stays 72 points tall. On short screens the character scene reduces
spacing, and gameplay moves the beast into its stats row to retain board
space. Selecting or cancelling a skill keeps board/control size stable.
The source assets and per-image generation prompts are documented in
`assets/ui-source/README.md` and `assets/ui-source/runtime/`.
