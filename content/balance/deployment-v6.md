# Firebase deployment — content v6

Deployed on 2026-10-11 to Firebase project `sword-puzzle`.

- Function: `gameApi`, codebase `game-api`, Node.js 22, region `asia-southeast1`.
- API endpoint: https://asia-southeast1-sword-puzzle.cloudfunctions.net/gameApi
- Cloud Run URL: https://gameapi-cfoom2lkqa-as.a.run.app
- Active content: v6; `minClientVersion` is `1.6.0`.
- Published maps: 40 across four chapters.
- Historical content v3/v5 remains available. All 40 active v5 map documents match their pre-deploy hashes.
- Existing configuration outside the content pointer and minimum client version was preserved.

Deployment verification passed: API health, map-free bootstrap, chapter index, all 40 v6
maps matching the local catalog, historical v3 preservation, and an idempotent smoke run.
The smoke player's auth and Firestore data were deleted and cleanup verified.

Server-sourced simulator smoke passed for maps 1, 3, 5, 8 and 10 with 10 validation seeds
each. Results are in `.balance-reports/v6-server-smoke.json`.

```sh
node tools/simulate_maps.cjs --source server --project sword-puzzle --maps 1,2,3,4,5,6,7,8,9,10 --seeds 100 --bots normal --powers expected --output .balance-reports/v6-server-maps-1-10.json
```

Balance remains **FAILED** by the retained training grid: maps 3 and 8 had no candidate
meeting the agreed win/star and Collect median gates. No calibration expansion or app release
was performed as part of this deployment.
