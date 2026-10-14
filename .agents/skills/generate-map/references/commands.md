# Generate-map commands

All commands run from the repository root. The existing Node.js and TypeScript
dependencies under `client/node_modules` or `server/node_modules` are required.
Live publication uses the existing Firebase CLI login (`firebase login`).

## Generate and balance

```sh
# Next index, current chapter; quantities proposed automatically.
npm run maps:generate -- --difficulty medium --objective collect --tiles sword,fire

# Boss HP proposed automatically; a fixed seed makes the authoring search repeatable
# against the same source catalog, config and code.
npm run maps:generate -- --difficulty hard --objective boss --seed 12345 \
  --name "Huyền Nham Yêu Vương" --enemy-name "Huyền Nham Yêu Vương"

# BreakRocks generates candidate rock clusters and balances their count automatically.
npm run maps:generate -- --difficulty easy --objective break-rocks --index 4 \
  --name "Đường đá chắn"

# BreakSeals generates candidate seal clusters and balances their count automatically.
npm run maps:generate -- --difficulty medium --objective break-seals --index 5 \
  --name "Phong ấn cổ"

# Fixed collection targets; balance is found through budget/spawn/star cutoffs.
npm run maps:generate -- --difficulty easy --objective collect --tiles sword,lightning \
  --target 8,6 --min-moves 8 --max-moves 16

# Bias spawned tiles toward sword while preserving the default weight for other tiles.
npm run maps:generate -- --index 5 --difficulty easy --objective collect \
  --tiles sword:4 --target 1 --weights sword=150

# Explicit custom target bands (inclusive), reference power and retry expectation.
# Retry band is total attempts: 4–10 attempts means 3–9 retries.
npm run maps:generate -- --difficulty hard --objective boss \
  --win-rate 0.3,0.4 --three-rate 0.08,0.15 --total-exp 1500 \
  --retry-three-median 4,10

# Explicit revision of an existing non-tutorial ID.
npm run maps:generate -- --index 3 --replace --difficulty medium --objective collect

# Start a new chapter at the next index.
npm run maps:generate -- --difficulty hard --objective boss \
  --chapter chapter-2 --chapter-name "Huyền Nham Cốc"

npm run maps:generate -- --help
```

### Options

| Option | Default / meaning |
| --- | --- |
| `--difficulty` | Required: `easy`, `medium`, `hard`, `very-hard` |
| `--objective` | Required: `collect`, `battle`, `boss`, `break-rocks`, `break-seals` |
| `--tiles` | `sword`; CSV tile keys, collection only |
| `--target` | Automatic; one target per enemy/obstacle objective or one per collected tile; Collect 1–30, obstacles up to 56 |
| `--weights` | Per-tile spawn weights as `key=weight` CSV; normal tile keys only, each 1–10,000; unspecified tiles default to 100 |
| `--index` | Next contiguous local ID, maximum 1000 |
| `--replace` | Explicitly revise an existing non-tutorial map |
| `--name` | `Map INDEX` |
| `--seed` | Random nonzero uint32; authoring seed recorded in output |
| `--chapter`, `--chapter-name` | Last chapter, or a new chapter at the next ID |
| `--enemy-id`, `--enemy-name`, `--enemy-art` | Generated identity/name and `beast` artwork |
| `--min-moves`, `--max-moves` | 6, 30; each is 3–30, set equal for a fixed budget |
| `--win-rate`, `--three-rate` | CSV `MIN,MAX` fractions in 0–1; win is diagnostic, three-star is an acceptance band |
| `--total-exp` | `(INDEX-1)*60`, recorded reference power |
| `--layouts` | 8 distinct layouts, range 1–24 |
| `--training-seeds` | 150, range 40–1000; coarse search uses up to 40 |
| `--validation-seeds` | 1000, range 1000–10000, no tolerance relaxation |
| `--retry-seeds` | 100 independent retry sequences, range 20–1000 |
| `--retry-attempts` | 100 attempts per sequence, range 10–100 |
| `--retry-win-median`, `--retry-three-median` | Optional `MIN,MAX` total-attempt gates, range 1–100 |

New generation policy uses the normal bot's P80/P50/P10/P4 successful-move quantile
for easy/medium/hard/very-hard, respectively. The generator derives total moves as
`ceil(Pq/0.6)`, rounds the star cutoffs to 60% and 80% of that budget, and rejects
budgets above 30. All first-attempt losses remain right-censored in the quantile.
First-attempt 3-star gates remain easy >80%, medium 45–55%, hard 5–15%, very-hard
2–6%; first-attempt win rates are reported as diagnostics. Base chance caps are
15% combo and 35% setup; retries retain server assistance. Rock and seal maps compare
`obstaclePressure` at 0, 0.15 or 0.30; zero is a control measurement, saved obstacle
maps use positive pressure, and retry assistance reduces its effect. Auto-generated
obstacle placements and targets change together.
All bots use an empty loadout and no passive skills. They choose a lower-ranked move
30% (basic), 20% (normal), and 10% (strategic) of the time, uniformly from up to
the next three lower-ranked moves. Reports include the model version and observed
suboptimal choices. Power diagnostics use EXP 0 and `(INDEX-1)*100+1500`. Retry
sequences keep reference EXP fixed to isolate seed/spawn assistance.

## Revalidate a frozen map

```sh
npm run maps:balance -- 3
npm run maps:balance -- 3 --validation-seeds 2000 --retry-seeds 200
npm run maps:balance -- 3 --win-rate 0.85,1 --three-rate 0.45,0.55
```

Revalidation does not change layout, goals, budget or star cutoffs. It uses the
saved generation seed and deterministic, separate gameplay seed suites. It writes
a new report and updates the seed's report/engine hashes; a failed report blocks
publication. The generation workflow uses these approved profiles independently
of the historical `maps:calibrate`/`maps:check` profile bands; use `maps:balance`
for verifying generated bundles.

## Publish by map index

```sh
# Default project from .firebaserc and current Firebase CLI login.
npm run maps:publish -- 3

# Dry run reads Firestore and validates the transaction, without database writes.
npm run maps:publish -- 3 --dry-run
npm run maps:publish -- 3 --project sword-puzzle

# Application Default Credentials instead of CLI login.
npm run maps:publish -- 3 --project PROJECT_ID --adc

# Emulator; the initial tutorial catalog must already exist there.
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run maps:publish -- 3 --project demo-kiem-khai
```

The initial catalog can be published with the existing `tools/seed_game_content.mjs`
workflow documented in `content/MAP_AUTHORING.md`. The single-index publisher
requires `gameConfig/current`, its active `gameContent` and a valid active map prefix.
For additions it exposes only the next published ID, creates a fresh content version
above known published versions and appends chapter/EXP metadata from the seed's
snapshot. Later generated local maps remain outside the published levelCount until
their own publication. Revisions preserve map identity and all old map versions.

## Output

```text
content/map-seeds/INDEX/
  seed.json               # MapDefinition, authoring request/seed/shape, hashes
  config.json             # Immutable local config snapshot used for simulation
  balance.json            # Training, holdout, retries, power diagnostics, status
  preview.html            # Top-first layout and balance/retry tables
  revisions/HASH/...      # Prior successful/verified artifact bundles
  published/PROJECT.json  # Latest publication receipt per project
  failed-TIMESTAMP.json   # Failed generation/search/holdout details
```

On generation success, `content/game-maps.json` and `content/game-config.json` are
updated. Adding an ID grows the last chapter or starts the requested new chapter
and increments the local content version. Existing tutorial map payloads are kept.
The local authoring mapVersion is not assumed to be the live Firestore revision;
the publisher allocates live revisions transactionally and records the result.

The authoring lock `content/.map-generation.lock` prevents concurrent local catalog
writes. If a process is interrupted, confirm that its recorded PID is no longer
running before removing a stale lock and resuming.

Seed/report/config mismatches stop publication. After editing a map manually,
regenerate it as an explicit revision instead of editing hashes. After an engine
change, use frozen-map revalidation. A failed holdout is retained and not used to
automatically choose another candidate or reroll validation seeds.
