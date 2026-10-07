# Shop UI review

Five sprites were generated individually with the built-in ImageGen tool:
the portrait item card, purchase dialog, enabled and disabled purchase buttons,
and secondary close button. Source PNGs and exact prompts are saved as
`assets/ui-source/runtime/shop-*`; runtime WebPs preserve alpha, use quality 90,
and total about 206 KiB. The existing inventory tab assets and per-item icons
are reused without modification.

Native captures use the installed Expo development app on the 3x iPhone 16e
simulator. Viewport constraints render 320x568, 360x640 and 390x844-point scenes.
Captures are cropped to those viewports without resizing or repainting.
`shop-live-native.png` uses the real player state and normal production layout.
Floating white gears belong to the Expo development client.

The captures cover both categories at all three sizes, purchase details,
locked items, insufficient balance, an empty catalogue, and the end of both
lists with a single final card. Explicit card widths keep the final row equal
to the paired rows. Inventory captures verify the unchanged list layout.
The long-name and long-description captures use deliberately extended,
ephemeral catalogue values. The description scrolls independently while the
purchase and close buttons remain fixed; the final capture shows the price
and unlock requirement at the bottom of the content.

A temporary React context supplied read-only profile fixtures and HUD widths.
Its purchase, equip and notice handlers could not mutate the real store,
wallet, loadout, save or operations queue. All fixture routes, context imports,
viewport constraints and local layout telemetry were removed after review.

Validation: TypeScript and all 13 client test suites (170 tests). Coverage
includes ownership filtering, art mappings, equal two-column widths, details
before purchase, lock and balance checks, live ownership updates, purchase
success, failed persistence and retry, duplicate presses, dismissal and tab
changes, empty catalogues, hidden indicators, and existing inventory equip
and swap behavior.
