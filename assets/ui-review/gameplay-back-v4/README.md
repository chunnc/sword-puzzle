# Back dialog: intrinsic button proportions

Exit confirmation now shares `GameplayDialogButton` with the win/loss popup.
Both gold and jade images use their own bundled width/height metadata and
`contain`, with image height derived from width. Touch height stays at least
44 points; press feedback changes opacity without scaling. Both dialogs use
168-point buttons on panels below 350 points and 184-point buttons otherwise.

The exit dialog retains its vertical action order, Vietnamese labels, text,
busy lock and Continue/Return behavior. The inventory panel and result
animations remain unchanged.

## Native review

The manifest covers exit confirmation at 320×568, 360×640, 360×780 and 390×844
points on the 3× iPhone 16e Simulator, plus a busy fixture. Captures use the
production dialog over independent board snapshots without store/ad mutations.
Full-screen captures are cropped without scaling; the contact sheet uses
scaled copies. The temporary review route is removed after capture.

[Comparison](review.png) · [Capture manifest](capture-manifest.json)

Save preservation is verified with AsyncStorage SHA-256 hashes before/after.
Validation: client TypeScript and all 16 Jest suites (230 tests) pass. Existing
exit tests check both intrinsic ratios, `contain`, minimum touch height and
absence of a press-scale transform, alongside cancel/return behavior.
