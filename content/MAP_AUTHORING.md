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

Content v8 maps use percentage stars: 3 stars below 50% and 2 stars below 75% of the
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
