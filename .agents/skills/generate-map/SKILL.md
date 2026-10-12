---
name: generate-map
description: "Generate balanced sword-puzzle maps from difficulty and collection, battle or boss objectives. Use when asked to tạo map, generate map/layout, propose collection quantities or boss HP, balance moves with seeds, revalidate a local map seed, or publish a generated map by map index to Firestore. Produces diverse layouts up to 7 columns × 8 rows with holes, local seeds, balance reports and previews."
---

# Generate Map

Respond in the user's language. Use the repository scripts and its production
`BoardEngine`, not a separate implementation of match, refill, damage or skills.
Read [references/commands.md](references/commands.md) for CLI options and artifacts.

## Route the request

- **Generate:** determine difficulty and goal, then run `maps:generate`. Generation
  includes training, an independent validation pass and retry measurement.
- **Revalidate a saved seed:** run `maps:balance INDEX`; it freezes the map and
  measures it without selecting or generating a new candidate.
- **Publish:** run `maps:publish INDEX`. It reads the saved, validated map, preserves
  immutable revisions and extends the published catalog by one index when needed.

## Inputs

1. Map Vietnamese difficulty to `easy` (dễ), `medium` (trung bình), `hard` (khó),
   `very-hard` (cực khó/rất khó). Ask one concise question if difficulty or the
   objective type is missing. Goal types: `collect`, `battle`, `boss`.
2. For Collect, use named tile keys: `sword`, `fire`, `lightning`, `spirit`.
   Default to `sword` if a collection request does not specify a tile. Multiple
   collected types are supported; all must finish. Do not invent fixed quantities
   when the user wants the script to propose them.
3. Default index to the next contiguous local ID and append to the last chapter.
   Honor an explicit index/chapter/name/seed or move budget. Revising an existing
   non-tutorial map requires `--replace`; preserve the two tutorial maps.
4. Treat quantities/HP explicitly requested by the user as fixed (`--target`).
   Otherwise the script proposes and calibrates them. Collect is capped at 30 per
   tile by the current schema. Custom enemy metadata is optional; existing `beast`
   artwork is the default.
5. Translate custom balance requests into `--win-rate`, `--three-rate`, move
   bounds, and optional retry-median bands. Rates are fractions of **all first
   attempts**, including losses, not fractions of wins. Retry medians are **total
   attempts**: N retries means N+1 attempts.

## Default balance, approved by the user

| Difficulty | First-attempt win | First-attempt 3 stars |
| --- | --- | --- |
| easy | strictly >95% | strictly >80% |
| medium | strictly >80% | 45–55% (approximately 50%) |
| hard | 25–40% | 5–15% |
| very-hard | 10–20% | 2–6% |

These gates use the normal bot with no sword, skills, or passive skills and a
recorded reference EXP of `(index-1)*60`, unless `--total-exp` overrides it. The
basic, normal and strategic bots make a suboptimal choice 30%, 20% and 10% of the
time, sampling uniformly from up to the next three lower-ranked moves. Minimum and
strong EXP runs are diagnostics. Describe measurements as bot estimates, not
guaranteed human win rates. No extra moves are purchased.

## Generation workflow

1. Inspect `content/game-config.json`, `content/game-maps.json` and the user's
   constraints. Scripts require Node.js and the existing client/server TypeScript
   dependency. Generation is local and does not require Firebase credentials.
2. Run `npm run maps:generate -- ...` from the repository root. Record the printed
   generation seed so a failed run can be investigated.
3. Layout generation varies dimensions within 5–7 columns × 5–8 rows, shape family,
   orientation, asymmetry and holes. It rejects duplicate silhouettes (including
   reflections/rotations), disconnected regions, dangling cells and cells without
   a contiguous match-three line. Require 12–40% holes and at least 18 active cells.
4. The script searches layout, target/HP, move budget and spawn policy using only
   training seeds. Star cutoffs are fitted to that training distribution. It then
   freezes one candidate before using at least 1,000 separate validation seeds.
5. Retry simulation measures **first win** and **first 3-star win** separately. It
   continues after 1–2-star wins, resets consecutive failures after every win, and
   applies the existing server's spawn assistance only after consecutive losses.
   Show median/P90, cumulative success rates and unfinished/censored sequences.
6. Success writes a local seed bundle and updates the contiguous local catalog.
   Failure writes a `failed-*.json` report and leaves the catalog/successful seed
   intact. Inspect and explain a failure; do not relax balance or keep rerolling
   validation seeds until a map passes. Any later authoring revision must remain
   training-only and be identified as a new revision/experiment.

## Deliver

- Link `seed.json`, `config.json`, `balance.json` and `preview.html` under
  `content/map-seeds/INDEX/`.
- Summarize index, difficulty, dimensions, hole count, collection quantities/HP,
  moves, star cutoffs, generation seed and validation sample count.
- Include first-attempt win/3-star rates and measured attempts/retries to win and
  to reach 3 stars. If a quantile is censored, say it was not reached within the
  simulation limit; do not average unfinished sequences away.
- Distinguish the authoring seed from each runtime gameplay seed. Production
  still creates a fresh random seed per run; publishing does not pin all players
  to the authoring seed.
- For a generation-only request, provide `npm run maps:publish -- INDEX`. Execute
  publication when the user asks to publish; it is not an automatic generation step.

## Publish workflow

The initial tutorial catalog must be configured in the target Firestore project.
Use the single-index publisher for subsequent generated maps; publish new indices
in order. It reads `.firebaserc` and uses Firebase CLI login by default, or emulator
credentials when `FIRESTORE_EMULATOR_HOST` is present. `--adc` is also supported.

The publisher checks seed/report/config hashes, current engine compatibility and
passed validation. In one Firestore transaction it reads mutable pointers, verifies
the active map prefix, writes the selected map resource/revision, creates a new
immutable content version if the catalog grows, and increments `catalogRevision`
only on change. It does not expose unpublished later local maps through levelCount.
Repeated identical publication is idempotent. Inspect the saved publication receipt.

Do not change global gameplay rules or published identities to bypass a publish
error. A stale engine hash requires revalidating the frozen local map with
`maps:balance`, not deleting validation metadata.
