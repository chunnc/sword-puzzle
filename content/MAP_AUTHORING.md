# Map authoring · content v8

`game-config.json` stores global progression and registry data. `game-maps.json` stores
one map per numeric ID. The local catalog currently starts with two tutorial maps.

Layouts are top-first matrices: `0` is a permanent hole, `-1` draws a random ordinary
tile and positive values refer to `tiles[].id`. Explicit pieces cannot form a match before
the player acts. Seals use zero-based top-first coordinates; engine board coordinates have
their origin at the bottom. Firestore encodes layouts as `layoutRows: [{cells: [...]}]`.

Every map belongs to one chapter and has an immutable `mapVersion`, a tile registry, a
percentage star rule and spawn/retry policies. New versions go into `gameMaps/{mapId}`;
the document keeps a `versions` array and points `latestVersion` at the current map. Keep
the map ID stable when revising a layout. Raise `mapVersion` when changing a published map.

Tutorial maps add optional metadata:

```json
{
  "tutorial": {
    "type": "match-three",
    "steps": [{
      "from": { "row": 4, "column": 2 },
      "to": { "row": 5, "column": 2 },
      "text": "Kéo viên Kiếm xuống để ghép 3 viên."
    }]
  }
}
```

Tutorial coordinates are one-based from the top. The engine highlights both cells, shows
the direction, refills deterministically, and stabilizes any gravity match without reward.
`comboChance`, `setupChance`, collection/obstacle pressure and retry assistance are zero on
the first two maps. A different legal move dismisses the hint for that run; a retry starts it
again. The hint step is saved with the run snapshot.

Tutorial maps use percentage stars: 3 stars below 50% and 2 stars below 75% of the
original move budget. Extra moves do not enlarge that budget. Collect targets are capped at
30; all objectives must finish before the run wins.

## Seeding

```sh
npm run api:seed                         # validate locally; no writes
npm run api:seed -- --reset-catalog      # validate a catalog reset; no writes
npm run api:seed -- --project ID --firebase-cli --apply --reset-catalog
```

The reset flag is required to shrink a previous catalog. On apply it is accepted only when
`gameMaps` is empty. Seeding writes the current config and the two numeric map resources; it
does not recreate historical content. This repository currently contains the local catalog
only. Publishing to a shared project is a separate operation.

## Generated maps after the tutorials

Use `npm run maps:generate -- --difficulty medium --objective collect`,
`--objective boss`, `--objective break-rocks`, or `--objective break-seals`. Rock and
seal maps generate connected obstacle cells and keep placement and target count in
sync. The generator
adds the next contiguous local ID, defaults to the last chapter, and produces a
seed/config/report/preview bundle under `content/map-seeds/INDEX/`. Maps are bounded
to 7 columns × 8 rows, contain 12–40% holes, and use random normal cells rather than
a single fixed opening for every run.

Generation uses the P80/P50/P10/P4 successful-move quantile for easy/medium/hard/
very-hard as the 3-star move reference, derives a total budget near 60% of that
quantile, and places the 2-star cutoff near 80% of total moves. It never generates
more than 30 moves. The 3-star acceptance bands are easy >80%, medium 45–55%, hard
5–15%, and very-hard 2–6%; first-attempt win rate is reported as a diagnostic.
Training searches targets, chance and obstacle pressure, then a frozen candidate
must pass at least 1000 independent validation seeds. Obstacle pressure compares
0 as a control and saves rock/seal maps at 0.15 or 0.30; it discourages chains near
obstacles and weakens with retry assistance. Generation and
`maps:balance INDEX` also measure first-win and first-three-star retry sequences
with the server's consecutive-failure reset semantics.

Once the initial catalog is configured, `npm run maps:publish -- INDEX` publishes
that single generated map. It allocates immutable map revisions, appends one level
to a fresh immutable content version when necessary, and updates catalogRevision
transactionally. See [skill commands](../.agents/skills/generate-map/references/commands.md)
for fixed targets, custom bands, reference EXP, new chapters and emulator usage.
