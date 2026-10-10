# Map authoring and balance (content v4)

`game-config.json` is the global versioned configuration, without map layouts.
`game-maps.json` is the authoring catalog, with top-first `number[][]` matrices.
`game-content.json` is the immutable v3 historical catalog; do not rewrite it.

## Tiles and layout

`0` is a permanent hole, `-1` draws from `normalTileIds`, and positive values reference
`tiles[].id`. IDs need not be contiguous or ordered. The shipped registry maps 1/2/3/4/5
to sword/fire/lightning/spirit/rock. Behaviors and artwork resolve through semantic keys;
adding a new behavior requires client implementation before it can be published.

Explicit IDs describe initial pieces only. Gravity and refill can subsequently replace them.
A rock remains an obstacle until broken. `initialSeals` uses zero-based `{row,column}`,
where row 0 is the top. Seals cannot cover holes or rocks. Derived engine coordinates use
y=0 at the bottom. Runtime snapshots store version-specific tile IDs.

Author layouts without pre-existing matches. Initialization only redraws `-1` positions,
never moves explicit pieces, and tries up to 200 boards before rejecting a dead layout.
Do not publish content which fails seed validation. Runtime reshuffles after a player action
may move previously explicit ordinary pieces, since they are no longer initial constraints.

Firestore encodes `layout` as `layoutRows: [{cells: [...]}]` because nested arrays are not
supported. Both `gameMaps` and the map pinned inside `runs` use that encoding. API clients
receive the original matrix. No second width/height/mask is persisted.

## Versioned collections and loading

- `gameContent/{version}`: global rules, registry, chapter metadata and historical base EXP.
- `gameMaps/{version}_{id}`: one immutable map with chapter ID and chapter order.
- `gameConfig/current`: active version, minimum client version, ads flag.
- `players/{uid}/runs/{runId}`: pinned map/rules reference, seed, assist, frozen loadout,
  installation, attempt, status, normalized report and idempotent reward receipt.
- `players/{uid}/mapStats/{id}`: starts, retries, wins, losses, abandoned runs, failure streak,
  best stars/moves and first recorded win time. No historical attempts are invented.

Deploy the composite index in `firestore.indexes.json`. Bootstrap contains no maps; chapter
queries are server-side filters on version + chapter ID, ordered by `orderInChapter`.
Map summaries exclude layout. Run start reads the selected map directly and returns details.
Client cache keys contain version and chapter only; player stars/unlocks are separate.

## Runs and rewards

Start persists a client operation ID before calling the server. A retry of that operation
returns the same seed and attempt, even across a catalog change. A deliberate restart creates
a new operation ID. Starting another run abandons the previous active server run without
increasing the failure streak. `installations.activeRunId` also finds an unfinished run after
a local journal is lost, without affecting other installations. Returning to the map during play retains the local snapshot.

A loss is submitted only when the player leaves the result or chooses retry, after any
extra-move opportunity. Won results are submitted automatically. All outcomes are journaled
before sending, and server transactions make starts/finishes idempotent. The client is trusted
for gameplay reports in this release; the server verifies report structure, checks objectives,
and computes stars/rewards. This is not replay-based anti-cheat.

Swap usage = initial budget + granted extra moves - moves remaining. Skills do not count as
paid swaps. Wins always earn 1 star; thresholds use paid swaps, including those after ads.
Retry assistance reduces spawn pressure by 10/20/30% after 3/5/7 consecutive losses. It does
not grant moves or change star thresholds, and wins reset the streak. Abandonment does neither.

Maps 11–40 carry `legacy` seed-generation/obstacle rules. Their original random sequence can
be reproduced using the historical seed; server-issued seeds vary across new attempts.
Historical v3 snapshots and pending wins still use the old registry and rules.

## Validation and calibration

```sh
npm run api:build
npm run api:seed                      # validation only; no writes
npm run maps:check                    # sync server content, then 100 validation seeds, all three bots
npm run maps:release                  # sync server content, then 1000 seeds, three power profiles and retries
npm run maps:test                     # report, retry aggregation, content cache and CLI checks
CALIBRATION_SEEDS=150 npm run maps:calibrate # dry run, training seeds only
node tools/calibrate_maps.cjs --apply # updates authoring data; never Firestore
```

Reports include win/star rates, move histograms, failed-objective progress, cascade waves,
reshuffles and retry attempts. Basic bots sometimes select weaker moves; normal bots prioritize
objectives/resources; strategic bots evaluate independent sampled futures. None sees the actual
future RNG. Minimum, expected and stronger loadouts retain progression benefits.

Calibration searches objective targets and sensible move budgets, then star thresholds. Maps
with authored obstacle puzzles vary move budgets instead of moving obstacles. Validation seeds
are disjoint from training. A release check fails if normal expected-power win/3-star rates fall
outside the selected difficulty bands, a star tier is unobserved, or strategic bots substantially
underperform basic bots. CI no longer runs bot simulations; it validates authoring data and the
report tooling only. Device playtests and actual user metrics are still needed before expanding
gameplay changes beyond maps 1–10.

### Server sync and local cache

`maps:simulate`, `maps:check`, and `maps:release` always run against the content published on
the game server, never directly against the authoring files:

1. Read `gameConfig/current` to learn the active `contentVersion` (one Firestore read per run).
2. Look for a local cache of that exact version at
   `.balance-reports/content-cache/{project}/v{version}.json`.
3. If the cache matches the active version, run all seeds from the cached file with no further
   Firestore reads.
4. Otherwise fetch `gameContent/{version}` and every `gameMaps` document of that version,
   validate them, and atomically replace the cache before running seeds.

Cache files are validated again on every load, so a corrupt or outdated file is refetched
instead of trusted. When the server publishes a new `contentVersion`, the next run syncs the
new version; previous version files are kept so a rollback can serve from cache.

```sh
npm run maps:simulate -- --project sword-puzzle --seeds 100 --check     # default project from .firebaserc
BALANCE_CACHE_DIR=/tmp/balance-cache npm run maps:simulate -- --offline # fail unless cache exists; no network
```

`--project ID` selects the Firebase project; it defaults to the `.firebaserc` project.
`--offline` skips the version check and runs from the newest cached version for that project.
`BALANCE_CACHE_DIR` overrides the cache location. Authentication uses the existing Firebase CLI
login via `tools/firebase_cli_credentials.mjs`; emulators are used when `FIRESTORE_EMULATOR_HOST`
is set. A sync failure stops the run before any seed executes.

Every report records its data source: project, content version, sync time, last version check,
cache file, a SHA-256 hash per map and config, and a combined snapshot hash. The overview header
shows whether the run used a freshly synced server snapshot or the local cache.

### Viewing a simulation report

Every `maps:simulate`, `maps:check`, and `maps:release` invocation automatically writes a
self-contained HTML report and a JSON data file. The terminal prints both paths. By default,
files are saved under `.balance-reports/maps-<UTC timestamp>-<process ID>.*`. Open the HTML in
a browser; it works offline and opens on an overview with exactly one row per map. Each row
shows difficulty/move budget, first-attempt win/star rates, retry completion, mean attempts,
conditional win rates at each assist level, and assessment status. Reports still export when
`--check` fails, and a runtime failure exports the profiles completed before the error. The
report header shows the synced or cached server snapshot that produced the numbers.

```sh
npm run maps:simulate -- --seeds 100 --powers minimum,expected,strong --retry-seeds 100 --check
open .balance-reports/maps-<timestamp>-<process-ID>.html
```

`--output path.json` sets the JSON path; the timestamped HTML is saved alongside it.
`--html-output path.html` sets an explicit HTML path; default HTML names preserve run history
even when `ci.json` or `release.json` is overwritten by a later run. The report embeds its data
and offers a JSON download. Its header records the command, data source (project, version, sync
and check times), config/map/snapshot hashes, seed suite, sample counts, duration, and check
status. JSON retains the fields used by the pilot merge tool.

The overview defaults to normal/expected when that profile is present, otherwise an available
profile. Selecting another bot or power updates values in place without duplicating map rows.
A missing profile shows dashes and "Chưa chạy profile" while retaining the map and its retry
data. Retry metrics always use normal/expected. Click a map to open all of its bot/power
comparisons, move histograms, cascade/reshuffle metrics, and detailed retry results.

Rebuild the current overview from an existing simulation JSON without running seeds again:

```sh
node tools/render_balance_report.cjs --input .balance-reports/report.json
# Writes .balance-reports/report.overview.html
node tools/render_balance_report.cjs --input .balance-reports/report.json --output .balance-reports/overview.html
```

Retry simulation is enabled with `--retry-seeds N`. Each map runs N independent sequences
using normal/expected, a new deterministic seed for each attempt, and the map's retry assist
policy. A sequence stops on its first win or after 30 attempts. The report includes:

- Completed and unfinished sequences; mean attempts among completed sequences (null if none).
- Per-assist-level attempts, wins, losses, win rates, and star rates; unused levels show no rate.
- Per-attempt reach counts, wins, conditional win rate, and cumulative completion rate.
- A flag identifying maps without effective spawn pressure, where retry assist has no effect.

Assist-level rates are conditional on attempts that reach that level; 0% includes first attempts.
They do not measure causal uplift versus an unassisted run on the same seeds. Assistance reduces
spawn pressure, not the move budget or star thresholds. Cascade metrics count both skill and
swap resolutions; failed-objective progress is reported separately from all-attempt progress.

## Publishing

```sh
node tools/seed_game_content.mjs --apply --project PROJECT_ID
```

The seed tool validates all 40 maps and publishes the global config, immutable maps, historical
v3 catalog and current pointer in one transaction. Existing unequal documents cause rejection;
increment the content version instead. Deploy compatible client/API and Firestore indexes before
switching the pointer. Implementation/testing does not deploy or write production data.

Local API integration:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH \
  firebase emulators:exec --project demo-kiem-khai --only auth,firestore 'npm run api:test:maps'
```

The checked-in pilot evidence is [balance/pilot-v4.md](balance/pilot-v4.md), with the full
JSON report alongside it. `tools/merge_balance_reports.cjs` verifies per-map hashes and
combines independently run validation batches; it rejects stale or incomplete evidence.
For all new and historical API integration tests, use `npm run api:test:integration:local`
inside the same Auth/Firestore emulator command above.

### Using an existing Firebase CLI login

When Application Default Credentials are not configured, seed with the CLI account selected
for this workspace:

```sh
node tools/seed_game_content.mjs --firebase-cli --apply --project sword-puzzle
```

`--firebase-cli` uses short-lived access tokens in memory. It does not create a service-account
key, print tokens, or install a seed function. Without `--apply`, the command remains an offline
dry run. The default credential path remains available for CI/service-account environments.

After deployment and seeding, verify the live version and index without creating users:

```sh
node tools/verify_live_game.mjs --project sword-puzzle
```

Add `--smoke` to create one disposable guest, check chapter access and idempotent start/abandon,
then delete that test Auth user, installation, profile, runs and statistics. It never grants a
win/reward or modifies another player's data. The normal shared auth throttle remains governed
by its existing expiration policy. Results are saved under ignored `.balance-reports/`.
