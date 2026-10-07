# Gameplay result popup

This records the original generated panel/button version. The current gameplay
dialogs reuse inventory artwork and the shared primary/secondary buttons;
see [gameplay-dialog-v2](../gameplay-dialog-v2/README.md).

Wins and losses stay on the gameplay screen. The final board remains behind a
modal jade panel. Wins show three copies of the newly generated gold star,
positive EXP/Linh Thach rewards, and Continue/Return. Losses show Retry/Return.
The old result route and loss ad action are removed.

The same generated star is desaturated with Skia ColorMatrix before earning
its color; RGB saturation animates without changing alpha or sprite geometry.
The panel opens over 340 ms; earned stars animate left to right for 300 ms each,
with 100 ms gaps; rewards appear over the final 160 ms. Buttons and Android Back
remain blocked until completion. Reduced motion shows the completed state.

## Generated assets and prompts

Four sprites were generated separately with the built-in ImageGen tool. The
buttons were refined to simplify cloud decoration. All runtime text is native.

- [Panel PNG](../../ui-source/runtime/gameplay-result-panel.png) · [prompt](../../ui-source/runtime/gameplay-result-panel.prompt.txt)
- [Primary button PNG](../../ui-source/runtime/gameplay-result-continue.png) · [prompt](../../ui-source/runtime/gameplay-result-continue.prompt.txt) · [refinement](../../ui-source/runtime/gameplay-result-continue.refine.prompt.txt)
- [Return button PNG](../../ui-source/runtime/gameplay-result-back.png) · [prompt](../../ui-source/runtime/gameplay-result-back.prompt.txt) · [refinement](../../ui-source/runtime/gameplay-result-back.refine.prompt.txt)
- [Gold star PNG](../../ui-source/runtime/gameplay-result-star.png) · [prompt](../../ui-source/runtime/gameplay-result-star.prompt.txt)

The preparation pipeline crops alpha margins, resizes and exports WebP quality
90 while retaining alpha. Panel: maximum 1000 px; buttons: 512 px; star: 256 px.
The four runtime WebPs total 204,196 bytes. Exact dimensions and alpha ranges
are recorded in [asset-validation.json](asset-validation.json).

## Native review

[capture-manifest.json](capture-manifest.json) lists 22 iPhone 16e captures at
320×568, 360×640, 360×780 and 390×844 points (3×): wins with 0–3 stars, losses,
and busy buttons. Full-screen captures are cropped without rescaling. The Expo
developer gear may be visible; it is outside the game's interface.

[Native animation video](animation-native.mov), [GIF preview](animation-preview.gif)
and [animation contact sheet](animation-review.png) verify the zoom, successive
star colors and reward/button reveal. The contact sheet uses cropped frames
from the actual Simulator video; timestamps are relative to video recording,
which starts before the popup is triggered. The GIF begins with the new popup.

Temporary native fixtures used independent board snapshots and real production
UI components, without store/ad mutations. The fixture route and capture hooks
were removed after review. [save-preservation.json](save-preservation.json)
confirms all four AsyncStorage files retain their original SHA-256 hashes.

Validation: client TypeScript and all 16 Jest suites (229 tests) pass. Tests cover
real final-skill board animation before the popup, loss timing, rewards matched
by run ID, sequential stars, grayscale alpha, reduced motion, Back blocking,
duplicate actions, retry failures, realm increases and the final level.
