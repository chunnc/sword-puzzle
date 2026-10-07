# Gameplay v3 native review

The objective/boss and move panel PNGs are the exact two user-approved
attachments, preserving the original cloud ornaments. No refined panel
variant is consumed. `asset-validation.json` records their SHA-256 identity
alongside exported WebP dimensions and transparent alpha.

Cancel and Cast use separate generated jade/gold sprites with a clean
center for dynamic labels and qi prices. Images use `contain`; their
Pressable targets remain 64×44 and 156×44, with an 8-point gap. No native
background or border is drawn on either button. Press feedback and disabled
opacity remain. The permanently reserved action row stays 44 points high.

Enemy names remain above the native HP pill, with extra right padding to
keep the selected corner ornament visible. Info sections remain 76/66
points for every goal. HP/qi gradient components and the equipment row
without a background remain from v2.

Captures use the installed Expo development app on the 3× iPhone 16e
simulator, constrained to 320×568, 360×640, 360×780 and 390×844 points.
Individual screenshots are cropped without scaling or repainting; review
sheets are scaled comparisons. The floating gear is Expo developer UI.

`capture-manifest.json` lists 34 native fixtures: normal and boss goals,
targeting before/after selection and busy presentation for both goal types
at all four viewports, plus exit confirmation at the smallest/largest sizes.
Temporary review code supplies independent snapshots and disables store,
ad and wallet mutations. Busy fixtures show the locked presentation;
tests separately exercise a real pending async cast. All fixture routes,
context imports and initializers are removed after capture.

`layout-stability.json` compares native gold board bounds across goals,
target states and busy states at all four viewports. `save-preservation.json`
records the AsyncStorage SHA-256 comparison without save contents.

Source PNGs and exact built-in ImageGen prompts are linked from
`assets/ui-source/README.md`; button refinements are documented separately.
`runtime-preview-gameplay-v3.png` reviews all four sprites. The approved
panel originals and v2 assets remain available for comparison.

Validation: client TypeScript and all 15 Jest suites (212 tests) pass.
Coverage includes correct sprite sources, fixed button/action dimensions,
press feedback, disabled opacity during a pending cast, shared info sizes,
targeting/cancel/cast, back, saved run equipment and save resumption.
