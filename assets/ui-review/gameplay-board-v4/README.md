# Gameplay board UI review

Verified on the running iPhone 16e iOS simulator:

- `game-live-native.png`: the existing saved level, with the generated sword move icon and scene visible through board holes.
- `boss-native-preview.png`: local preview of a 7 × 8 board with holes, a boss row, and three collection objectives.
- `boss-compact-preview.png`: the same components within a 320 × 568 content viewport, with zero moves and a completed collection objective.

The temporary preview route and its map fixture were removed after capture; saved game data was not modified by the preview.

The icon was created with Codex's built-in ImageGen. Full prompt and references are recorded in `../../ui-source/runtime/gameplay-moves-icon.prompt.txt`; the original transparent image is beside that prompt. The 112 × 112 runtime PNG is displayed at 28 dp.

Validation: the ten relevant UI, board, motion, result, progress, and spirit-particle test suites passed (217 tests across the final runs). Application TypeScript passed with test files excluded. Wider checks still report existing `boardPresenter` fixture failures (`NO_PLAYABLE_LAYOUT`) and six TypeScript errors in map/save/API/store tests; those unrelated files were not changed.
