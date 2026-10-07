# Gameplay v2 native review

Captured from the rebuilt Expo development app on the 3× iPhone 16e
simulator. Native viewport constraints are 320×568, 360×640, 360×780 and
390×844 points. Individual screenshots are cropped to the viewport without
scaling or repainting. Contact sheets are scaled comparisons.

`capture-manifest.json` records 42 fixtures: collection, rocks, seals, battle
and boss at all four sizes; zero/partial/full bars, locked/empty/equipped
sockets, insufficient qi, targeting before/after selection, exit confirmation,
zero moves, loss and used skills at the smallest/largest sizes.

The same production GameScreen and components render independent engine
snapshots through a temporary React context. Store mutations, ads and wallet
changes are disabled in fixtures. All fixture routes, context imports and
initializers are removed after capture. Save hashes are checked before and
after review. The floating gear/Tools label is Expo development UI.

All goal types share 76/66-point objective and moves panels. Enemy avatars
are 48/40 points; the name appears above the 18-point HP pill. Sword qi
uses a 12-point native gradient pill. Full, partial and empty fills retain
the same geometry. Neither progress bar references a bitmap.

The equipment row has no background panel. Its original 60/44-point sockets
and run equipment remain. Cancel/Cast are 64×44 and 156×44, centered within
a permanently reserved 44-point row. Total controls are 202/166 points,
with compact equipment padding corrected to fit. Outlined item labels remain
legible over the game background.

`layout-stability.json` measures the largest connected component of the
board's exact gold outline in unscaled captures. It compares all goals and
idle/targeting/selected-target states at the smallest/largest sizes.
`asset-validation.json` records v2 WebP dimensions and preserved alpha.
`save-preservation.json` records the save-file comparison without save contents.

Source PNGs and exact built-in ImageGen prompts are linked from
`assets/ui-source/README.md`; `runtime-preview-gameplay-v2.png` reviews the
two rounded jade sprites with the existing sockets. Native development
client rebuild succeeds with `expo-linear-gradient` ~57.0.2.

Validation: TypeScript and all 15 Jest suites (211 tests) pass. New coverage
checks shared section sizes, empty fixed cast space, bounded native buttons,
clamped/measured fills, native gradient pills and HP animation configuration.
Existing targeting, final-skill, snapshot equipment, back and save regressions
remain covered.
