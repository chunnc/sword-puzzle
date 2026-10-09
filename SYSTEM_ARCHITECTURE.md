# System Architecture — Sword Puzzle (Kiếm Khai Tiên Lộ)

Agent-oriented map of the codebase. Read this before changing code. It covers the
repository layout, the client/server boundary, the main runtime flows, the
invariants you must not break, and where to make changes. Deep references:
[README.md](README.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md),
[GAME_CONCEPT.md](GAME_CONCEPT.md), [ACCEPTANCE_GUEST.md](ACCEPTANCE_GUEST.md).

## 1. Overview

- Genre: match-3 cultivation (tu tiên) game for iOS/Android.
- Client: Expo SDK 57, React Native 0.86, React 19, TypeScript, expo-router,
  Zustand, Reanimated/Skia. App version `1.3.0` (`client/package.json`,
  `client/app.config.ts`).
- Backend: Firebase Functions v2 (Express) on `asia-southeast1`, Firebase Auth +
  Firestore via Admin SDK (`server/package.json`).
- Content: versioned catalog (content v3), 40 seeded maps, 8 skills, 8 swords,
  10 realms.
- Monorepo root scripts (`package.json`): `api:build`, `api:test`, `api:serve`,
  `api:deploy`, `api:seed`.

### Ownership boundary (the single most important rule)

- The **client runs all gameplay**: board generation, RNG, moves, cascades,
  skills, scoring, and animation. The server never simulates moves.
- The **server is the only network authority** for identity, profile, economy,
  purchases, and win validation. It is reached over one HTTPS API (`gameApi`).
- The client has **no Firebase SDK**. It never talks to Firestore/Auth directly;
  `firestore.rules` / `storage.rules` deny all direct client access.
- The client does **not** restore coins/EXP from local state. Profile comes from
  the server on every boot.

```text
Expo app ──HTTPS JSON──▶ gameApi (Express on Cloud Functions)
                              │
                              ├─ firebase-admin/auth   (custom tokens, users, refresh)
                              └─ firebase-admin/firestore (profiles, receipts, ads)
```

## 2. Repository map

```text
sword-puzzle/
├── client/                     Expo / React Native app
│   ├── app/                    expo-router routes (screens)
│   │   ├── _layout.tsx         Stack + auth guards, AppState wiring
│   │   ├── index.tsx           boot / splash
│   │   ├── map.tsx             level select
│   │   ├── game/[levelId].tsx  gameplay screen
│   │   ├── character.tsx  inventory.tsx  shop.tsx  account.tsx
│   ├── src/
│   │   ├── state/gameStore.ts  Zustand store: the client's single source of truth
│   │   ├── game/
│   │   │   ├── BoardEngine.ts  gameplay engine (swap, skills, cascade, animation)
│   │   │   ├── types.ts        board/save/animation types
│   │   │   ├── domain.ts       GENERATED — do not edit
│   │   │   ├── save.ts         local journal v3 (+ backup), schema validation
│   │   │   ├── skillTargets.ts skill targeting rules by ID
│   │   │   └── levels.ts       level lookup helpers
│   │   ├── services/
│   │   │   ├── api.ts          HTTP client, auth headers, 401 refresh, identity calls
│   │   │   ├── session.ts      SecureStore session + generation counter
│   │   │   ├── device.ts       installation key + identity-operation receipt
│   │   │   ├── ads.ts          rewarded ad SDK wrapper
│   │   │   └── acceptance.ts   dev-only test bridge (never in release)
│   │   ├── components/         UI: Board, chrome, dialogs, progress, result popup
│   │   ├── assets.ts  theme.ts
│   ├── app.config.ts           Expo config (AdMob IDs, API URL, version)
│   └── package.json
├── server/
│   ├── src/
│   │   ├── index.ts            Express app + all routes + error middleware
│   │   ├── identity.ts         device-bound sessions, requireAuth, rebinding
│   │   ├── content.ts          catalog loader (current + published versions)
│   │   └── domain/
│   │       ├── game.ts         GENERATED — do not edit
│   │       ├── profile.ts      operations, receipts, idempotent processing
│   │       ├── progress.ts     legacy progress helpers
│   │       └── admob.ts        SSV callback verification
│   └── package.json
├── content/
│   ├── game-domain.ts          SOURCE of shared schema + pure rules
│   └── game-content.json       seed catalog (40 levels)
├── tools/
│   ├── generate_game_content.mjs  copies game-domain.ts → client + server
│   ├── seed_game_content.mjs      validate/publish catalog to Firestore
│   ├── generate_ui_assets.py      WebP UI asset export
│   └── acceptance-*.mjs           local acceptance emulator proxy
├── firestore.rules  storage.rules  firebase.json  .firebaserc
└── SYSTEM_ARCHITECTURE.md  DATABASE_SCHEMA.md  README.md  GAME_CONCEPT.md
```

## 3. Client architecture

### 3.1 Routes and guards (`client/app/`)

`_layout.tsx` mounts a Stack and a global `ConnectionDialog`. Screens under
`map`, `game/[levelId]`, `character`, `inventory`, `shop` are wrapped in
`Stack.Protected guard={initialized}`; `account` is guarded by `bootstrapLoaded`.
An `AppState` listener updates `foreground` without changing connection state
or calling the server on resume. There is no health polling interval.

### 3.2 Store (`client/src/state/gameStore.ts`)

Single Zustand store. Key ideas:

- **`available()`** — gate for all gameplay/mutations: requires `initialized`,
  `bootstrapLoaded`, `online`, `foreground`, no `recovering`, no `authRequired`,
  and (unless explicitly allowed) no pending operation.
- **`serialize()`** — every mutation goes through one promise queue so the store
  never runs concurrent mutations.
- **`lifecycle` epoch** — incremented on identity changes; async results from an
  older epoch are discarded.
- **`hydrate()`** — the boot sequence: fetch bootstrap → install content →
  load/repair session → device session if needed → load journal → fetch profile →
  persist → `submitPending()` → mark `initialized`.
- **`checkConnection()`** — single-flight boot/manual recovery: health check,
  then hydrate or submit pending work. The network dialog stays open until all
  required recovery succeeds; a failure generation prevents an older successful
  retry from clearing a newer connection error.
- **`reportConnectionFailure()`** — subscribed directly to the shared API layer;
  timeout/network errors immediately set `online = false` and
  `connectionFailed = true`, including errors swallowed by background callers.
  `failure()` does not issue supplementary health checks.
- **`submitPending()`** — replays the journal's pending operation through
  `/v2/profile/sync`, applies the returned authoritative profile, and writes the
  win summary.
- **`command()` / `record()`** — write the operation into the journal *before*
  calling the API, then submit. This is what makes retries safe.

### 3.3 Gameplay (`client/src/game/`)

- `BoardEngine.ts` — constructed from a level and an optional snapshot. It fills
  the board from a seeded RNG, places rocks/seals, guarantees a playable move,
  and exposes `trySwap`, `trySkill`, `grantExtraMoves`, `snapshot`, `won`,
  `lost`, and the animation stream. Skill behavior is selected by skill ID
  (e.g. `'ngu-kiem'` swaps a pair) — behavior is code, not data.
- Live gameplay uses `beginSwap`/`beginSkill` and `nextResolutionStep` to produce
  one wave at a time. `boardAction.ts` waits for the presenter's UI-start signal,
  computes at most one future wave on JS while Reanimated/Skia plays on the UI
  thread, and waits for playback completion before presenting it. The synchronous
  `trySwap`/`trySkill` wrappers collect the same iterator for nonvisual callers.
- `boardPresenter.ts` plays each wave's traces and falls sequentially. Board motion
  callbacks identify the run and effect; native completion starts the 300ms landing
  pause, including the final wave. Reduced motion skips effects and pauses, yielding
  between waves. Final persistence can overlap the last wave; win submission still
  follows the durable pending journal, and reward UI waits for both playback and
  server acknowledgement. Intermediate waves are never saved. Cancellation before
  the final write restores the preceding saved board; a write already begun is
  allowed to finish before the serialized action releases its lock.
- `types.ts` — `BoardSnapshot`, `BoardActionAnimation`, `BoardResolutionStep`,
  `SaveData` (schema v3), `WinSummary`.
- `domain.ts` — **generated**. Holds `GameContent`, `LevelDefinition`,
  `ObjectiveDefinition`, validation, and pure rules (`applyOperation`,
  `mergeProfiles`, `realmForExp`, `gradeStars`, `normalizeProfile`, ...).
  `CONTENT` is installed only after bootstrap; no catalog is bundled.
- `save.ts` — local journal v3 in AsyncStorage with a backup key. It stores
  `ownerId`, `active` board snapshot, `lastWin`, and `pending`. **Profile is
  stripped before persisting** — it is always fetched from the server. v1/v2
  saves are ignored.
- `skillTargets.ts` — target-selection rule per skill ID (`row`, `pair`,
  `triple`, `chargedPair`, `kind`, `cell`).

### 3.4 Services (`client/src/services/`)

- `api.ts` — request wrapper with 12s timeout and typed `GameApiError`; injects
  `Bearer` token; on `401` runs a single-flight refresh and retries once, falling
  back to device-session recovery. The 12s deadline includes response body reads
  and applies to health requests too. HTTP 504 is normalized to `TIMEOUT` even
  without a JSON body. Connection errors notify the store before being rethrown.
  Contains all endpoint functions.
- `session.ts` — session in SecureStore; `generation` counter invalidates stale
  async work; `saveRefreshedSession` is generation-checked.
- `device.ts` — 128-bit `installationId` + 256-bit `secret` (hex) generated and
  stored before first contact; persists an `identityOperation` receipt so a
  retried register/login/logout reuses the same operation ID.
- `ads.ts` — initializes the AdMob SDK and shows a rewarded ad bound to an intent
  via `serverSideVerificationOptions.customData`.
- `acceptance.ts` — dev-only bridge installed only when `__DEV__` and
  `EXPO_PUBLIC_ACCEPTANCE_TEST=1` and the API URL is exactly
  `http://127.0.0.1:8787`. Never active in release builds.

### 3.5 UI (`client/src/components/`)

Presentational + motion: `Board`, `GameplayChrome`, `GameplayProgressBar`,
`GameplayResultPopup`, `ConnectionDialog`, collection/shop/inventory screens,
and the `boardMotion`/`boardVisuals` helpers.

## 4. Server architecture

### 4.1 App (`server/src/index.ts`)

An Express app mounted at one HTTP function, `gameApi`, region
`asia-southeast1`, `maxInstances: 20`, `timeoutSeconds: 10` for all routes. `express.json({ limit: '32kb' })`,
`trust proxy`, `x-powered-by` disabled. Routes are thin; heavy logic lives in
`domain/`. A final error middleware maps `ApiError` → `{ error: code }` and
normalizes upstream timeout errors to HTTP 504 `{ error: "TIMEOUT" }`; other
unexpected failures return `INTERNAL_ERROR` (with logging). `timeout.ts` provides
the shared 10s fetch default and timeout recognition for fetch, Firebase Admin,
and Firestore; AdMob key retrieval keeps its shorter 5s deadline. Timeout does
not guarantee rollback, so retries continue using operation receipts.

### 4.2 Identity (`server/src/identity.ts`)

- A `Router` plus `requireAuth` and `assertInstallation` exported for other
  routes.
- `requireAuth` verifies the ID token, then checks the installation binding.
  `assertInstallation` can run inside a Firestore transaction so an account
  switch cannot race a pending write.
- Device sessions: `POST /v2/auth/device-session` looks up
  `installations/{installationId}`, verifies the secret with a timing-safe
  SHA-256 compare, and issues a Firebase custom token carrying
  `installationId` + `bindingVersion`.
- Identity changes (`login`/`register`/`logout`) use `rebind()`: an idempotent
  Firestore transaction keyed by `operationId` in
  `installations/{id}/operations/{operationId}`, guarded by
  `expectedBindingVersion`. Each successful rebind increments `bindingVersion`.
- `authValidAfter` stores the user's `tokensValidAfterTime` baseline so a device
  key cannot silently recover a revoked session.
- Rate limiting uses `authThrottle/{hash(ip:email)}` windows.
- Legacy `/v1/auth/*` writes return `426 CLIENT_UPDATE_REQUIRED`; only
  `/v1/auth/refresh` is kept for migration.

### 4.3 Domain (`server/src/domain/`)

- `game.ts` — **generated**, same code as the client `domain.ts`. Definitions,
  validation, and pure rules.
- `profile.ts` — `profileFromDocument` (reads `profileV2`, migrates legacy
  `stars`), `profileFields` (writes projection fields), `operationHash` (SHA-256
  of `{version, operation}`), `parseOperations`, and `processOperations`.
  `processOperations` is the idempotency core: a receipt with the same hash is
  replayed (reward returned, no double credit); a mismatched hash is rejected as
  `OPERATION_CONFLICT`. Non-`win` operations on a stale `contentVersion` are
  rejected with `CONTENT_MISMATCH`.
- `progress.ts` — legacy `stars`/`highestUnlocked`/`realm` helpers.
- `admob.ts` — verifies AdMob SSV callbacks against Google's rotating keys
  (SHA-256 + PEM), validates `ad_unit`, reward item/amount, and timestamp
  freshness.

### 4.4 Catalog (`server/src/content.ts`)

`currentContent()` reads `gameConfig/current` then loads that version;
`loadContent(version)` validates and caches published `gameContent/{version}`
documents. Published documents are immutable.

## 5. Shared domain & content pipeline

```text
content/game-domain.ts ──(tools/generate_game_content.mjs)──▶
     ├── client/src/game/domain.ts
     └── server/src/domain/game.ts
content/game-content.json ──(tools/seed_game_content.mjs)──▶ gameContent/{version}
```

- Edit **`content/game-domain.ts`** only; run the generator (`npm run start`,
  `typecheck`, `test`, or `api:build` all invoke it). Never hand-edit the two
  generated files.
- The generator also supports `--check` to fail on stale output.
- `seed_game_content.mjs` is dry-run by default; `--apply --project ID` writes.
  It refuses to change an already-published version and sets
  `gameConfig/current` (`contentVersion`, `minClientVersion`) in the same
  transaction. Demo projects require `FIRESTORE_EMULATOR_HOST`.

## 6. Data model

See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for field details.

```text
gameConfig/current                          active version, minClientVersion, ad flag
gameContent/{version}                       immutable catalog
installations/{installationId}              device binding (secretHash, playerUid, bindingVersion, ...)
installations/{id}/operations/{opId}        identity rebind receipts
players/{uid}                               profileV2 + legacy projection
players/{uid}/operations/{opId}             win/purchase/equip receipts (idempotency)
adIntents/{intentId}                        rewarded-ad intents (pending → verified)
adTransactions/{transactionId}              SSV replay protection
authThrottle/{keyHash}                      rate-limit windows
```

All timestamps are Unix ms except Firestore TTL fields (`adIntents.ttlAt`,
`authThrottle.expiresAt`), which are `Date`/Timestamp.

## 7. Key flows

### Boot / guest session
1. `checkConnection` → `GET /health`.
2. `GET /v2/bootstrap` → install content, check `minClientVersion`, read ad flag.
3. Load session from SecureStore; if unreadable, recover with the existing device
   key (never silently create a new guest).
4. If no/invalid session, `loadDeviceIdentity(create)` then
   `POST /v2/auth/device-session`; server creates or restores the bound UID.
5. Load journal for the UID, `GET /v2/profile`, persist, replay pending op, then
   `initialized = true`.

### Gameplay and win
- Engine runs entirely on device; every move is saved to the journal (`active`).
- On win, `record()` computes stars, writes a `win` operation (id `runId`,
  `objectiveProgress`) into `pending`, and submits.
- `POST /v2/profile/sync` validates unlocked level, complete objectives, then
  credits coins/EXP and writes a receipt. The response profile is authoritative.

### Retry safety
- The journal persists the request (ID + `contentVersion`) before the call.
- Server receipts make replay return the original result without double-paying;
  receipts are read before any profile write in the same transaction.
- Purchases are validated server-side (ownership, wallet, unlock, skill slots).

### Identity changes
- `register` links email to the current guest UID; `login` rebinds the device to
  an existing account (requires `confirmedDiscardGuest` if leaving a guest);
  `logout` binds a fresh guest on this device only.
- Each uses an `operationId` + `expectedBindingVersion` receipt; network errors
  are resolved by re-reading the device session and checking it completed.

### Token refresh (401)
- One shared refresh per `generation:uid`; success stores the new token and
  replays the request once.
- If refresh returns 401, recover the same identity via device-session. Never
  auto-drop identity; identity is only replaced by an explicit user action.

### Connection and timeout
- `GET /health` (no auth, no-store) runs only on boot and manual Retry, with the
  common 12s client timeout and no automatic timeout retry.
- Any API timeout or network error immediately opens the blocking
  `ConnectionDialog`; no follow-up ping is required. Successful unrelated APIs
  and returning to the foreground do not dismiss it.
- Retry checks health and recovers the profile/pending journal before closing
  the dialog. Failed retries preserve the board and pending operation IDs.

### Rewarded ads
1. Client `POST /v1/ads/intents` → server checks level unlocked + ads enabled and
   returns an `intentId`.
2. Client shows the rewarded ad with `customData = intentId`.
3. AdMob calls `GET /v1/ads/admob-ssv`; server verifies the signature, validates
   reward (`moves`/3), marks the intent verified, and records the transaction to
   block replays.
4. Client grants +3 moves only after the SDK reports the reward.

## 8. API reference

| Endpoint | Auth | Behavior |
| --- | --- | --- |
| `GET /health` | no | Liveness; `no-store` |
| `GET /v2/bootstrap` | no | Current catalog, version, ad flag, `minClientVersion` |
| `GET /v2/content/:version` | no | Immutable catalog for a version |
| `GET /v2/profile` | yes | Authoritative profile; migrates legacy data |
| `POST /v2/profile/sync` | yes | Apply ≤50 win/purchase/equip operations |
| `POST /v2/auth/device-session` | device key (legacy bearer for migration) | Create/restore session |
| `POST /v2/auth/register` | device key + operation | Link email to guest UID |
| `POST /v2/auth/login` | device key + credentials + operation | Rebind to existing account |
| `POST /v2/auth/logout` | device key + operation | Bind a fresh guest on this device |
| `POST /v2/auth/refresh` | refresh token | Refresh + verify binding |
| `POST /v1/auth/refresh` | legacy refresh token | Migration only |
| `POST /v1/auth/{guest,register,login}` | — | `426 CLIENT_UPDATE_REQUIRED` |
| `GET /v1/progress` | yes | Legacy read; `PUT` returns 426 |
| `/v1/ads/intents`, `/v1/ads/intents/:id`, `/v1/ads/admob-ssv` | mixed | Ad intent + SSV |

`sync` body: `{ contentVersion, operations }`. Win operation:
`{ id: runId, kind: 'win', levelId, stars, objectiveProgress }`. Response:
`{ profile, acknowledged, rejected, rewards }`. `contentVersion < 3` and
`importProgress` are not accepted.

## 9. Invariants for agents

- Do **not** bundle or import the seed catalog into client code; content is
  fetched after bootstrap.
- Do **not** add Firebase Auth/Firestore SDKs to the client — only the Game API.
- Edit `content/game-domain.ts`, then regenerate; never edit `domain.ts` /
  `game.ts` directly.
- Keep skill/sword effects and targeting in client code by ID; the catalog stores
  metadata only (no `SwordModifier`, `SkillEffect`, or target selection).
- Objectives are AND-combined; at most one `Battle`/`Boss`; win is checked after
  cascade.
- Operations must be idempotent and journaled before the network call; never
  re-credit a replayed receipt.
- The store must reject gameplay/mutations through `available()` when
  disconnected, backgrounded, recovering, auth-required, or pending.
- Never log or persist secrets/tokens in clear; server stores only SHA-256 of the
  device secret.
- Do not auto-deploy production or flip `rewardedAdsEnabled` without real AdMob
  SSV configured.
- `EXPO_PUBLIC_ACCEPTANCE_TEST` and its bridge are development-only.

## 10. Commands

```sh
# Client
npm --prefix client run typecheck      # regenerate domain + tsc --noEmit
npm --prefix client test               # regenerate + jest
npm --prefix client start|android|ios  # dev-client workflows

# Server / catalog
npm run api:build                      # regenerate domain + tsc
npm run api:test                       # build + unit tests
npm run api:serve                      # build + Firebase emulator suite (needs JDK)
npm run api:deploy                     # build + deploy functions + firestore rules
npm run api:seed                       # build + validate catalog (dry run)

# Publish catalog (example, emulator)
node tools/seed_game_content.mjs --apply --project demo-kiem-khai
```

Integration tests (demo project, emulator):

```sh
npm run api:build
JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH \
firebase emulators:exec --project demo-kiem-khai --only functions,auth,firestore \
  'node tools/seed_game_content.mjs --apply --project demo-kiem-khai && \
   API_BASE_URL=http://127.0.0.1:5001/demo-kiem-khai/asia-southeast1/gameApi \
   npm --prefix server run test:integration'
```

iOS Simulator uses `127.0.0.1`; Android Emulator uses `10.0.2.2`; physical
devices use the host's LAN IP.

## 11. Where to change what

| Change | Touch |
| --- | --- |
| Add/edit a skill or sword | `content/game-domain.ts` (schema/IDs) + behavior in `client/src/game/BoardEngine.ts` + `skillTargets.ts` + seed `content/game-content.json` |
| Add an objective type | `content/game-domain.ts` types/validation, engine progress logic, HUD (`components/hudPresentation.ts`), server rule reuse |
| Edit levels / difficulty / rewards | `content/game-content.json`, then regenerate + reseed (bump version if published) |
| Change pure profile rules | `content/game-domain.ts` (`applyOperation`, `mergeProfiles`, rewards) |
| Add/modify an API route | `server/src/index.ts` (+ `domain/*` for logic) |
| Change identity/session behavior | `server/src/identity.ts` + `client/src/services/{api,session,device}.ts` + `gameStore.ts` |
| Change journal/save format | `client/src/game/save.ts` + `types.ts` (`SaveData`) |
| Change refresh/health handling | `client/src/services/api.ts`, `gameStore.ts`, `app/_layout.tsx` |
| Ads flow | `server/src/index.ts` ad routes + `domain/admob.ts` + `client/src/services/ads.ts` |
| UI / animation | `client/src/components/*`, `client/app/*` |

## 12. Release notes

- Build backend, validate + seed a new catalog version, set `minClientVersion`,
  then ship the client. The seed script never mutates a published version.
- Production needs the Functions service account to have
  `iam.serviceAccounts.signBlob` for custom tokens. Never ship a service-account
  private key to the client or repo.
- Set Firestore TTL for `authThrottle.expiresAt` and `adIntents.ttlAt`; keep
  Firestore/Storage rules denying direct client access.
- Acceptance testing: [ACCEPTANCE_GUEST.md](ACCEPTANCE_GUEST.md). The test bridge
  reaches only the local emulator proxy — there is no path to production.
