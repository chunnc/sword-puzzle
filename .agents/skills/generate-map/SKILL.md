---
name: generate-map
description: "Generate balanced sword-puzzle maps from difficulty and collection, battle, boss, BreakRocks or BreakSeals objectives. Use when asked to tạo map, generate map/layout, propose collection quantities, obstacle counts or boss HP, balance moves with seeds, revalidate a local map seed, or publish a generated map by map index to Firestore. Produces diverse layouts up to 7 columns × 8 rows with holes, local seeds, balance reports and previews."
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
   objective type is missing. Goal types: `collect`, `battle`, `boss`, `break-rocks`,
   `break-seals`.
2. For Collect, use named tile keys: `sword`, `fire`, `lightning`, `spirit`.
   Default to `sword` if a collection request does not specify a tile. Multiple
   collected types are supported; all must finish. Do not invent fixed quantities
   when the user wants the script to propose them. BreakRocks and BreakSeals candidates
   place connected obstacle clusters; automatic candidates keep obstacle placement and
   objective target counts in sync.
3. Default index to the next contiguous local ID and append to the last chapter.
   Honor an explicit index/chapter/name/seed or move budget. Revising an existing
   non-tutorial map requires `--replace`; preserve the two tutorial maps.
4. Treat quantities/HP explicitly requested by the user as fixed (`--target`).
   Otherwise the script proposes and calibrates them. Collect is capped at 30 per
   tile by the current schema. Custom enemy metadata is optional; existing `beast`
   artwork is the default.
5. Translate custom balance requests into `--win-rate`, `--three-rate`, move
   three-star band and optional retry-median bands. `--win-rate` is a diagnostic band
   for new generation policies, not an acceptance gate. Rates are fractions of **all
   first attempts**, including losses, not fractions of wins. Retry medians are **total
   attempts**: N retries means N+1 attempts. Generated budgets cannot exceed 30.

## Default balance, approved by the user

| Difficulty | 3-star move quantile | First-attempt 3-star rate gate |
| --- | ---: | --- |
| easy | P80 | strictly >80% |
| medium | P50 | 45–55% (approximately 50%) |
| hard | P10 | 5–15% (approximately 10%) |
| very-hard | P4 | 2–6% (approximately 4%) |

The first-attempt win rate is reported but is not a generation gate. Star and move
measurements use the normal bot with no sword, skills, or passive skills and a
reference EXP of `(index-1)*60`, unless `--total-exp` overrides it. The basic, normal
and strategic bots make a suboptimal choice 30%, 20% and 10% of the time, sampling
uniformly from up to the next three lower-ranked moves. Minimum and strong EXP runs
are diagnostics. Describe measurements as bot estimates, not guaranteed human win
rates. No extra moves are purchased.

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
   training seeds. It measures the difficulty's nearest-rank move quantile on all
   first attempts; losses are right-censored at the simulation limit, not dropped.
   It derives total moves as `ceil(Pq/0.6)`, recomputes at that budget for up to eight
   rounds, and rejects censored, over-budget or cycling candidates. If a budget is
   too large, it tests higher base chance up to combo 15% / setup 35%, then lower
   automatically proposed objectives. Explicit user targets stay fixed. It rounds
   the 3-star and 2-star move cutoffs to 60% and 80% of total moves and encodes the
   inclusive integer cutoffs in the existing percentage schema. Total moves are at
   most 30. Custom `--three-rate` uses that band's midpoint as Pq. It freezes a
   candidate before using at least 1,000 separate validation seeds.
5. Retry simulation measures **first win** and **first 3-star win** separately. It
   continues after 1–2-star wins, resets consecutive failures after every win, and
   applies the existing server's spawn assistance only after consecutive losses.
   Obstacle maps compare `obstaclePressure` at 0, 0.15 and 0.30 independently of
   combo/setup chance. Zero is a control measurement; saved BreakRocks/BreakSeals
   candidates use positive pressure so retries can weaken it. The engine suppresses
   refill chains near live rocks or seals, and retry assistance reduces its effect.
   The base chance caps apply before retry assistance.
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
