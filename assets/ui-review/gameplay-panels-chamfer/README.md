# Chamfered gameplay panels

Collection and boss backgrounds now use straight sides and four chamfered corners, following the Back button's silhouette. The slim gold rim, jade material, upper-left lighting and bottom-right cloud ornament are retained.

## Runtime assets and prompts

- Collection: [runtime PNG](../../../client/app-assets/ui/gameplay_collection_panel.png), [normalized source](../../ui-source/runtime/gameplay-collection-panel.png), [ImageGen prompts](../../ui-source/runtime/gameplay-collection-panel.prompt.txt), 1120 × 136 px.
- Boss: [runtime PNG](../../../client/app-assets/ui/gameplay_boss_panel.png), [normalized source](../../ui-source/runtime/gameplay-boss-panel.png), [ImageGen prompts](../../ui-source/runtime/gameplay-boss-panel.prompt.txt), 1120 × 154 px.

Both edits use Codex built-in ImageGen, followed by alpha-preserving crop/resize preparation. Four pixels of exterior padding match the previous sprites. End caps scale uniformly; the quiet middle alone changes its horizontal scale. Preparation places slice boundaries on whole output pixels to avoid partially transparent seams. The normalized source and runtime PNGs are identical.

## Visual review

`preview.png` shows both panels with representative content at a 390 px viewport. The six `panels-{320,360,390}-{normal,compact}.png` sheets cover one, two and three objectives, boss only, and boss with objectives, at 3× pixel density.

These are offline composition previews using the actual `gameplayPanelSlices` function and existing icon assets. Content is positioned from the current gameplay styles; text and HP rendering are illustrative. They are not native app screenshots. Simulator services were unavailable in this environment.

The follow-up spacing adjustment uses horizontal padding of 20/18 dp in normal/compact mode for both panels. The boss name and HP area has an additional 16 dp right inset, its vertical gap is 4 dp, and the HP track is 16 dp high. Collection height remains 48/44 dp; boss height remains 60/52 dp; width remains 100%. Artwork, avatar/icon sizes, font sizes, qi height, APIs, types and gameplay behavior remain unchanged.

## Validation

- 6 existing Jest suites passed, 85 tests: GameplayObjectivePanel, gameplayPanelSlices, GameplayChrome, GameplayProgressBar, GameLayout and GameplayScreen.
- `validation.json` records exact runtime dimensions, transparent corners, fully opaque middle, matching source/runtime bytes, and slice geometry at panel widths 296/336/366 dp and heights 44/48/52/60 dp.
- `preparation.json` records the generated-image crop and final export dimensions.
- `layout-validation.json` records padding, HP dimensions, right clearance, vertical containment and representative HP label fit at all three viewport widths in both modes.
