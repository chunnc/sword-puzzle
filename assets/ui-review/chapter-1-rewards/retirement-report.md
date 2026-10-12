# Retired starter cleanup — 2026-10-12

Project: `sword-puzzle`.

- Removed the per-player migration marker from shared profile types and initialization. Normalization now excludes catalog items whose acquisition is `retired` and removes them from equipment.
- Deployed the updated `game-api:gameApi` function in `asia-southeast1` successfully.
- Published config v10 over v9 using the configuration-only publisher. All three map documents remained unchanged; no map generation or publication occurred.
- Dry run: 1 account scanned, 1 affected. Applied: 1 scanned, 1 updated. Repeated apply: 1 scanned, 0 affected, 0 updated.
- Verified that Thanh Phong/Nhat Kiem were absent from ownership and equipment and that no obsolete marker remained. EXP, currency, best stars, reward credits and progress projections matched the pre-cleanup data.
- Firestore map checksum before and after: `5f3c1ae9ec47a4ad6b87ac3dfe6104ea4d2b9617244c97dad025196845993b07`.
- Local map JSON checksum remained `dd03ec971652b65b10bd45ca3bf9c80df3669d3143dd3badfdddd1e4b6a3f2fa`. Existing map authoring changes remain separate.

Validation: 21 server/script tests and 91 related client tests passed. Production client/server TypeScript, shared-domain generation check and diff whitespace checks passed. Tests cover repeat execution, missing fields, preserving unrelated data and transaction retries with concurrent equipment/purchases.

Live health and bootstrap returned HTTP 200 with config v10 and four milestones. Load/sync domain rules were also evaluated against the actual account data and published config; no starters or migration marker were reintroduced.

Authenticated HTTP profile/sync verification could not complete because the Firebase CLI identity lacked permission to sign a custom test token (`auth/insufficient-permission`). No IAM grants or access policies were changed. This limits the authenticated smoke test, not the completed database cleanup.

Reusable commands (dry run unless `--apply` is supplied):

```sh
node tools/publish_game_config.mjs --project sword-puzzle --firebase-cli
node tools/retire_starter_items.mjs --project sword-puzzle --firebase-cli
node --test tools/test_retired_starters.mjs server/test/milestone-rewards.test.cjs server/test/profile.test.cjs
```
