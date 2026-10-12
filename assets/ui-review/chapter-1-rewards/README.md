# Chapter 1 equipment and sword forms

Four new icons were generated individually with the built-in `image_gen` tool.
Existing Thanh Phong, Nhat Kiem, Ngu Kiem and Hoa Lien PNGs and prompts were inspected first and supplied as style references. No existing artwork was replaced.

| Asset | Source and prompt | Runtime |
| --- | --- | --- |
| Basic sword | [PNG](../../ui-source/runtime/icon-sword-co-ban.png), [prompt and references](../../ui-source/runtime/icon-sword-co-ban.prompt.txt) | `icon_sword_co_ban.webp` |
| Thu | [PNG](../../ui-source/runtime/icon-skill-thu.png), [prompt and references](../../ui-source/runtime/icon-skill-thu.prompt.txt) | `icon_skill_thu.webp` |
| Thieu | [PNG](../../ui-source/runtime/icon-skill-thieu.png), [prompt and references](../../ui-source/runtime/icon-skill-thieu.prompt.txt) | `icon_skill_thieu.webp` |
| Van | [PNG](../../ui-source/runtime/icon-skill-van.png), [prompt and references](../../ui-source/runtime/icon-skill-van.prompt.txt) | `icon_skill_van.webp` |

All source PNGs are RGBA with alpha spanning 0–255. Runtime WebPs use the existing `copy_runtime_art(names)` pipeline: alpha-aware padded crop, proportional fit into a 410 px footprint, centered 512×512 canvas, WebP quality 90. Only the four new files were exported.

[Contact sheet](contact-sheet.png) compares the old set (top) with the new set (bottom), at 176 px and 48 px. Visually checked: consistent painted gold/jade rendering, highlights, transparency and margins; distinct bare sword, forward thrust, upward hook and flowing cloud silhouettes.

## Validation

- 91 focused client tests passed, including combat, empty loadout restore, passive inventory, item reward popup and navigation.
- 7 new server tests passed: retired-item cleanup, all four milestones, star improvement, receipt retry, backfill, merging and purchase/equip restrictions. Future milestones use test fixtures only.
- Production client TypeScript and server TypeScript passed; generated shared domain check and `git diff --check` passed.
- Full client comparison: baseline 329 passed / 191 failed; current 350 passed / 191 failed, with no newly failing test cases. The pre-existing Board test module load failure also remains. Full client typecheck retains the same six pre-existing errors in old test code.
- Full server suite: 36 passed / 4 failed. Existing failures are stale map count, map objective and progress fixtures; the same map/progress failures reproduce before this change.
- Native screenshot verification was attempted using a temporary in-memory preview entry and an existing iPhone 17 Pro simulator. An iOS open-app dialog blocked the preview, and the computer-use tool could not access Simulator. No native preview screenshot is claimed. The temporary entry and failed screenshot were removed, Metro stopped, and the simulator returned to shutdown. Component rendering and asset bindings are verified by tests.
- `content/game-maps.json` SHA-256 remained `dd03ec971652b65b10bd45ca3bf9c80df3669d3143dd3badfdddd1e4b6a3f2fa`, matching the start of this task. Existing map and map-seed work was preserved.

No deployment, seed or publish was performed.
