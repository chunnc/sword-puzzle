# Inventory UI review

Six individual assets were generated with the built-in ImageGen tool. Original
PNGs and exact prompts are in `assets/ui-source/runtime/inventory-*`; compressed
runtime WebPs preserve alpha and total approximately 125 KiB. The inventory
uses the existing sword and skill mappings and their equipment sockets.

Native captures use the installed Expo development app on the 3x iPhone 16e
simulator. Temporary viewport constraints rendered 320x568, 360x640 and
390x844-point scenes. Screenshots were cropped to each viewport without
resizing, repainting, or changing the generated art.

A temporary React context supplied read-only fixtures to inventory and HUD.
Fixture equip handlers changed only ephemeral React state, never the real
Zustand store, persisted save, wallet, operations queue, or live loadout.
All temporary routes, context imports and viewport constraints were removed
after capture. `inventory-live-native.png` uses the real state and normal
production layout. Floating white gears belong to the Expo development client.

Captures cover a few/all owned items, both tabs, long descriptions, the end of
the scroll list, one unlocked skill slot, an empty second slot, and two equipped
skills with an available swap. Cards fit below the fixed HUD and above the
navigation. Equip artwork is 88x34 points inside a 44-point touch target.

Validation: TypeScript and all 12 client test suites (147 tests) passed. Inventory
tests cover mapped item art, ownership filtering, sword equip, slot limits,
empty-slot equip, replacement, swapping without duplication, cancellation and
Back, repeated presses during saving, failed save/retry, category changes,
and the existing shop purchase flow. The skill loadout remains contiguous:
an already-equipped sole skill offers a swap only after another skill fills
the second slot.
