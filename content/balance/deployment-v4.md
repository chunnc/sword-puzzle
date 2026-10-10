# Firebase deployment — content v4

Verified on 2026-10-10 for project `sword-puzzle`.

- Function: `gameApi`, codebase `game-api`, Node.js 22, region `asia-southeast1`.
- API health: https://asia-southeast1-sword-puzzle.cloudfunctions.net/gameApi/health
- Global content: `gameContent/4`; current pointer is v4, minimum client `1.4.0`.
- Maps: 40 immutable documents in `gameMaps`, across four chapters.
- Chapter composite index is `READY`; Firestore rules deployed successfully.
- Historical `gameContent/3` matches its source catalog and remains available through the API.
- Ads and unrelated game configuration settings match the pre-deployment snapshot.

Production verification passed: map-free bootstrap, document equality and layout row encoding,
chapter 1 listing, locked chapter rejection, repeated start returning the same run, abandonment,
repeated finish returning the same receipt, and retry/statistics counters. The disposable smoke
Auth user, installation, profile, run and statistics were deleted and deletion was verified.
No win/reward was granted, and no existing player's progression was changed.

Seed used the Firebase CLI account with access tokens held in memory. No service-account key
or seed function was created. Mobile app publication was not part of this deployment.

Repeat the read-only checks with:

```sh
node tools/verify_live_game.mjs --project sword-puzzle
```
