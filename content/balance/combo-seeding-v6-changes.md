# Combo v6 — local implementation and acceptance

Implemented on 2026-10-11. Local content v6 / client 1.6.0. No production publish,
deploy or store release was performed.

## Gameplay

- New rules apply only to non-legacy maps in content v6 and later (currently maps 1–10).
  Historical v3/v5 runs and legacy maps 11–40 retain their existing gameplay/RNG paths.
- Retry assist keeps 3/5/7-loss boundaries at 10/20/30%, adds assistance to direct-match
  and prepared-combo probability, and reduces collection/obstacle pressure. No damage,
  move-budget or objective-target bonus is granted.
- Direct-match probability is `min(1, comboChance + assist) × 1/.5/.25/0` after
  waves 1/2/3/4. Four refill candidates discourage natural matches in later waves.
- Every swap/skill ends within four resolution waves, including the first wave.
  Remaining matches are stabilized without rewards, retaining barriers and all charged
  pieces. The constructive fallback avoids the captured naive-cap NO_PLAYABLE_BOARD case.
- An optional settlement snapshot lets the UI show landing before two 75ms fade phases.
  Settlement does not add a clear wave; reduced motion presents the final board directly.
- `setupChance` is required in v6 maps, optional in historical v5 maps. A successful
  post-cascade search prepares a legal swap making a group of at least four ordinary
  tiles without an immediate match. Length preference is 70/30 for four/five, with
  five falling back to four. At most 64 candidate boards are tested.
- Setup only edits ordinary cells spawned in the final refill. A constructive
  rearrangement skips setup because those cell identities are no longer retained.
- Map 1 collects 30 swords; map 2 collects 30 fire; map 3 collects 30 lightning and
  30 swords; map 4 collects 30 spirit and 30 fire. Every objective must complete.

## Calibration decision

The agreed training grid is retained. Collect searches comboChance .05/.10/.15,
collectionPressure 0/.15/.30/.45/.60 and budgets 8–14, with target 30 per kind and
winning paid-swap median 6–10. Calibration uses 40 coarse and 150 refinement training
seeds, with validation kept separate. Battle/Boss damage-prefix candidates are confirmed
with real training runs. Obstacle puzzles search budgets 3–24.

**Training calibration FAILED for maps 3 and 8.** Successful candidates were applied to
maps 1/2/4/5/6/7/9/10; failed maps retain their initial v6 configurations. The full search
results and failures are in [calibration-v6.json](calibration-v6.json).

The user explicitly chose to keep the original grid and hand off with balance FAILED,
rather than extend map 3 collectionPressure or map 8 comboChance. The cap of 30 per
Collect objective, four-wave maximum, and win/three-star acceptance bands were not relaxed.
Validation outcomes do not feed back into parameter selection.

## Validation and artifacts

- The local simulator supports `--source local`; default behavior still syncs server content.
- Reports include paid-swap median, wave histograms per action, settlement rate, prepared
  setup/fallback/use counts, charge creation/activation and actual assist mechanisms.
- Paired assist compares the same 2,000 seeds at 0/10/20/30% on maps 5/7/10. Maximum
  assist must lift win rate by at least five percentage points, with intermediate regression
  at most two points.
- Full acceptance runs 1,000 seeds × three bots × three power profiles × ten maps,
  plus 100 retry sequences per map. Failed gates remain FAILED and are never hidden.
- Reports are bound to the engine, canonical content and per-map hashes. The merger writes
  a FAILED pilot report and exits nonzero when acceptance does not pass.

Acceptance results: [pilot-v6.md](pilot-v6.md), [JSON](pilot-v6.json),
[interactive HTML](pilot-v6.html). Device playtesting of animation timing and small-screen
layout remains outstanding; component tests cover settlement timing and separate Collect
progress/compact layout.

Reproduce locally:

```sh
node tools/calibrate_maps.cjs --apply
node tools/simulate_maps.cjs --source local --seeds 1000 --powers minimum,expected,strong --retry-seeds 100 --assist-seeds 2000 --check --jobs 8 --output .balance-reports/v6-release.json
node tools/merge_balance_reports.cjs .balance-reports/v6-release.json
```

The calibration and validation commands are expected to exit nonzero for the intentionally
retained FAILED balance state. No production command is needed to inspect this handoff.
