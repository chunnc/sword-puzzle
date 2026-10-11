# Map revisions and server-selected gameplay

## Storage and compatibility

`gameMaps/{mapId}` uses canonical numeric IDs (`1`, `2`, ...), with `id`, `chapterId`,
`orderInChapter`, `latestVersion`, `latestSummary` and a `versions` array. Entries have
independent `mapVersion` numbers and complete encoded maps (`layoutRows`, objectives,
moves, stars, spawn/assist policies and base EXP). Published entries are immutable.

`gameContent/{version}` remains immutable global configuration. Its current pointer
is `gameConfig/current.contentVersion`; new runs expose it as `configVersion`.
`gameConfig/current.catalogRevision` increases on map/config publication. Compatible
config can advance without republishing unchanged maps, and each map advances independently.

Historical map `contentVersion` is authoring provenance, not live config selection.
New entries store explicit `rulesMode` and `tileRegistry`; tuning revisions cannot
silently switch combo engines or remap layout/objective IDs. Star-threshold mode belongs
to the map. Publish validation rejects incompatible latest-map/current-config pairs.

## API and lifecycle

- `GET /v3/bootstrap`: current config plus `catalogRevision`.
- `GET /v4/chapters/{chapterId}/maps`: latest summaries; no requested version.
- `POST /v4/runs/start`: `{runId, levelId, previousRunId}`.
- `POST /v4/runs/{runId}/finish`: `{outcome, movesUsed, objectiveProgress, extraMovesUsed}`.

Start returns `{run, config}` with pinned `mapVersion`, `configVersion`, map, seed,
assistance, attempt and equipment/EXP. Client registers this config separately from
its live catalog. Wire payloads whitelist fields, including migrated journals.
Finish also returns `profileConfig` for interpreting the current profile/catalog;
updating it never replaces the gameplay snapshot's pinned configuration.

Mutable pointers and installation binding are read in the start transaction. Reusing
a `runId` returns the committed snapshot without selecting latest, incrementing stats,
or reactivating superseded runs. Finish uses the run's trusted snapshot and pinned
config; it does not depend on latest or composite map documents. Historical configs
must remain available. Receipt replay never grants rewards twice.

- Map entry/replay creates a new ID, including re-entry to an unfinished map.
- Confirmed back journals `abandoned`; a final loss journals `lost` instead.
- Pending wins are never overwritten by abandonment.
- Local `retiredRunId` makes departed gameplay non-playable while finish is pending.
- Pending results are drained before new start; uncertain requests retain exact IDs/reports.
- Background/foreground and rewarded extra moves retain the current snapshot/run.
- Cold boot returns to the map and recovers pending requests before another start.

Legacy `/v3` start/list and `/v2` profile-sync remain adapters during rollout. Old runs
infer config pins from their stored map. Old start journals discard selection versions,
preserving IDs. Pre-map snapshots retain their legacy profile-sync result path.

## Publication and migration

```sh
npm run api:seed                                      # local preflight
npm run api:seed -- --project sword-puzzle --firebase-cli --apply
```

Without an explicit authored `mapVersion`, publication compares payloads and increments
only changed maps. Repeated publication is idempotent; explicit revisions cannot replace
different historical data. Config changes require a new immutable config ID. Resources
and current pointers commit atomically.
Catalog growth is append-only: publication rejects shrinking `levelCount` and map
resources preserve stable chapter/order identity so existing progression is retained.

Migrate an existing composite-document database **before publishing**:

```sh
npm run maps:migrate -- --project sword-puzzle --firebase-cli
npm run maps:migrate -- --project sword-puzzle --firebase-cli --apply
npm run maps:migrate -- --project sword-puzzle --firebase-cli --apply --cleanup
```

Default is a read-only dry run. Migration groups `{configVersion}_{mapId}` documents,
validates each with its original config, and preserves historical revision numbers.
The v4 adapter retains legacy `comboPressure` and Collect targets above 30 in archived
entries; it adds a neutral `comboChance` decoder field while the engine continues to
apply the historical combo-pressure weighting for that classic rules mode.
It compares numeric entries, rejects conflicts and validates latest/current compatibility.
`--cleanup` deletes old documents in the same verified transaction. Repeat migration
is idempotent; inspect dry-run map/version totals before applying.

Firestore limits documents to 1 MiB. Publication/migration use a conservative 900 KiB
Firestore-value size estimate (including 8-byte numbers and nested-map overhead),
and exempt `versions`/`latestSummary` from indexing. Arrays provide
bounded historical storage, not unlimited archival storage.

## Rewards and cache

First-win eligibility/best stars belong to stable map ID, not revision. Replay coins
remain payable per accepted run. `profileV2.rewardCredits` records credited EXP and
star-bonus amounts per map; star improvements subtract actual amounts already credited.
Same-star replays do not regrant EXP/bonus, and decreases never claw back balances.

Existing profiles lazily seed credits from the frozen shipped v3–v7 schedule (base EXP
100, rates 30/60/80/100, bonuses 0/0/25/50), preserving stored coin/EXP totals exactly.
Stars-only legacy profiles use that schedule rather than current prices. New receipts
record level/map/config identities for attribution.

Chapter summaries refresh on map focus. Simulation cache format 2 uses
`v{configVersion}-r{catalogRevision}.json` (revision zero omits the suffix). Map-only
publication invalidates cache. Full sync rechecks the pointer and retries overlapping
publication, preventing mixed snapshots from being cached.

## Verification

```sh
npm run api:test
npm run maps:test
npm --prefix client run typecheck
npm --prefix client test
firebase emulators:exec --project demo-kiem-khai --only auth,firestore \
  "npm run api:test:integration:local"
```

Integration cases cover publication races, duplicate starts, old results after catalog
changes/removal, migration dry-run/apply/cleanup, and legacy reads after cleanup.
