# Gameplay dialogs: inventory panel and shared buttons

This records the horizontal result-action layout. The current result popup
stacks its actions vertically and preserves each button's intrinsic ratio;
see [gameplay-dialog-v3](../gameplay-dialog-v3/README.md).

The win/loss popup and exit confirmation both use the existing
`inventory_dialog.webp`. `InventoryDialogPanel` reads the bundled image's
dimensions (800×671) and keeps an aspect ratio of 800/671, a maximum width
of 360 points and `contain` image fitting. Content padding and spacing adapt
to the shorter panel without changing its proportions.

Result actions reuse the exit dialog's `button_primary.webp` (gold with dark
text) and `button_secondary.webp` (jade with ivory text). The action row uses
92% of the content width, sprite height is 42 points, and touch targets remain
44 points high. Labels use 12-point text with space reserved for the side
ornaments. Exit actions retain their original 48-point minimum height and
vertical layout.

The generated gold star, grayscale/color sequence, panel zoom, positive
rewards, animation/action locks and save/backend behavior are unchanged.
No new images were generated. The previous generated panel/button assets
and v1 review remain as historical references.

## Native review

The capture manifest lists wins, losses and exit confirmation at 320×568,
360×640, 360×780 and 390×844 points on the 3× iPhone 16e Simulator, plus zero-star
and busy fixtures. Captures use real production components and independent
board snapshots without store/ad mutations. Full-screen images are cropped
without scaling; contact sheets are scaled comparisons. Expo's developer gear
may remain visible outside the game UI.

[Small-screen comparison](review-320x568.png) · [Capture manifest](capture-manifest.json)

The temporary fixture route is removed after capture. Save preservation is
verified by comparing SHA-256 hashes of AsyncStorage files before and after.

Validation: TypeScript and all 16 Jest suites (229 tests) pass. Existing popup
tests now verify inventory artwork, its intrinsic ratio, the shared button
sprites, 42-point visual height and 44-point touch targets; exit tests verify
the same panel and preserve its navigation behavior.
