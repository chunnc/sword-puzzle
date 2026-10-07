# Inventory tab and sword icon refinement

The inactive tab is derived directly from the unchanged active PNG by scaling
each RGB channel with floor(channel * 7 / 10). Canvas size, all detail positions,
and every alpha pixel are preserved. The source recipe is recorded in
`assets/ui-source/runtime/inventory-tab-idle.recipe.txt`.

Source PNGs share dimensions 2172x724 and identical alpha. Runtime WebPs use
the same crop/resize pipeline, share dimensions 640x118 and identical alpha.
The active source PNG and runtime WebP SHA-256 hashes remained unchanged.
The inventory sword card omits only the square socket layer; its 56x56-point
container and 48x48-point icon retain their existing layout. Skill sockets,
character equipment, the slot chooser and equip behavior remain unchanged.

Native captures use the installed Expo development app on the 3x iPhone 16e
simulator, with temporary viewport constraints at 320x568, 360x640 and 390x844.
Each viewport was captured with both selected categories to inspect matching
tab ornamentation and frameless sword icons. Captures are cropped without
resizing or repainting. `inventory-live-native.png` uses the real player state
and normal production layout. Floating white gears belong to the Expo client.

Temporary read-only React context fixtures supplied inventory and HUD data.
Their equip and purchase handlers could not change the real store or save.
All fixture routes, context imports and viewport constraints were removed.

Validation: exact PNG color transformation, matching source/runtime alpha and
dimensions, unchanged active asset hashes, native review at all three widths,
TypeScript, and all 12 client test suites (147 tests).
