# Firestore schema — content v8

Client chỉ gọi Game API. Mọi truy cập Firestore trực tiếp bị rules từ chối.

```text
gameConfig/current
gameContent/{contentVersion}
gameMaps/{mapId}
installations/{installationId}
installations/{installationId}/operations/{operationId}
players/{uid}
players/{uid}/operations/{operationId}
adIntents/{intentId}
adTransactions/{transactionId}
authThrottle/{keyHash}
```

## gameConfig/current

```json
{"contentVersion":8,"minClientVersion":"1.8.0","rewardedAdsEnabled":false}
```

## gameContent/{contentVersion}

Document bất biến. Schema TypeScript đầy đủ: `GameContent`, `LevelDefinition`, `ObjectiveDefinition`, `SkillDefinition`, `SwordDefinition` trong [content/game-domain.ts](content/game-domain.ts). Catalog local hiện có hai map hướng dẫn.

- version, levelCount, qiCap, expRates (0/1/2/3 sao), rewards (firstWinCoins, replayWinCoins, starBonus).
- tiles: id/name/damage/qi; realms: id/name/exp.
- swords: id/name/description/artKey/color/unlock/price.
- skills: id/name/description/artKey/unlock/price/cost.
- chapters, levelCount and levelBaseExp provide progression metadata; layouts live in numeric `gameMaps/{mapId}` resources.

Không lưu SwordModifier, SkillEffect hoặc cách chọn mục tiêu. Client triển khai hành vi theo ID.

`board.activeCells` có width × height phần tử boolean; index=y×width+x, y=0 là hàng dưới cùng. False là ô khuyết.

Ví dụ nhiều objectives (mọi mục tiêu phải hoàn thành):

```json
[
  {"id":"collect-swords","type":"Collect","tileKind":1,"target":18},
  {"id":"defeat-boss","type":"Boss","target":360,"enemy":{"id":"boss-01","name":"Yêu Vương","artKey":"beast"}}
]
```

Có ít nhất một objective, ID duy nhất, tối đa một Battle/Boss. Các loại khác: BreakRocks, BreakSeals. `target` của Battle/Boss là HP; các loại còn lại là số lượng cần đạt.

`spawnPolicy` lưu trọng số sinh 4 loại ô thường, xác suất sinh combo/setup và các pressure. Tutorial maps đặt mọi xác suất/pressure về 0, dùng refill xác định và không chạy cascade tự động.

## players/{uid}

```json
{
  "profileV2":{
    "coins":150,"totalExp":100,"revision":1,
    "energy":{"current":4,"nextRecoveryAt":1791419400000,"asOf":1791417600000},
    "levels":[{"levelId":1,"stars":3}],
    "ownedSwords":["thanh-phong"],"ownedSkills":["nhat-kiem"],
    "loadout":{"sword":"thanh-phong","skills":["nhat-kiem"]}
  },
  "stars":{"1":3},"highestUnlocked":2,"realm":"LuyenKhi",
  "createdAt":1791417600000,"updatedAt":1791417600000
}
```

`levels` giữ sao cao nhất; có bản ghi 0 sao cũng là đã thắng. stars/highestUnlocked/realm là bản chiếu tương thích do server cập nhật. `mergedInto` chỉ có trên hồ sơ khách đã gộp, chứa UID tài khoản nhận. Đọc hồ sơ không tự tính lại coins/totalExp đã lưu.

`energy` là số lượt chơi còn lại (tối đa 5). `nextRecoveryAt` là mốc Unix milliseconds để hồi một năng lượng; hồi tiếp theo cách nhau 30 phút và dừng khi đủ. Khi đủ 5, `nextRecoveryAt` là `null`. `asOf` là Unix milliseconds tại lần server tính trạng thái gần nhất. Lượt chơi giữ `energyConsumedAt` để một lần thua hoặc bỏ cuộc chỉ bị tính một lần, kể cả khi gửi lại yêu cầu.

## players/{uid}/operations/{operationId}

```json
{
  "hash":"sha256(version + normalized operation)",
  "contentVersion":3,"accepted":true,
  "reward":{"id":"run-id","expGained":100,"coinsGained":150,"bestStars":3,"realmBefore":0,"realmAfter":0},
  "createdAt":1791417600000
}
```

Bị từ chối: accepted=false và reason; không có reward. Reward chỉ có cho win. ID của win là runId. Receipt chống ghi lặp và giữ nguyên kết quả thưởng sau retry; không TTL receipt.

## Collection phụ trợ

| Collection | Trường |
| --- | --- |
| adIntents | uid, levelId, placement, status, createdAt, expiresAt, ttlAt; transactionId/verifiedAt sau xác minh |
| adTransactions | intentId, uid, createdAt |
| authThrottle | startsAt, count, expiresAt |

ttlAt và authThrottle.expiresAt dùng Firestore Timestamp/Date cho TTL; các thời gian khác là Unix milliseconds.

Firebase Auth quản lý UID/email/thông tin đăng nhập. Access token và refresh token chỉ lưu trong SecureStore trên thiết bị. Snapshot, RNG, objectiveProgress đang chơi và request chờ xác nhận nằm trong journal cục bộ; không ghi từng nước đi vào database.

## installations/{installationId}

ID ngẫu nhiên 128 bit dạng hex; mỗi document chỉ có một `playerUid` hiện tại. Nhiều document có thể trỏ cùng tài khoản. Trường: `secretHash` (SHA-256, không lưu khóa rõ), `playerUid`, `bindingVersion`, `status` (active/revoked), `isGuest`, `authValidAfter`, `createdAt`, `updatedAt`. Các timestamp là Unix milliseconds. `authValidAfter` là baseline Firebase `tokensValidAfterTime` tại lần xác thực hợp lệ, dùng ngăn khôi phục bằng khóa thiết bị sau thu hồi.

Subcollection `operations` lưu `kind`, `targetUid`, `bindingVersion`, `createdAt`. Receipt không lưu mật khẩu, token hay khóa thiết bị. Operation đã bị một lần đổi liên kết mới thay thế không được replay để khôi phục binding cũ. `registration: {id, email}` tạm thời bảo vệ bước liên kết Firebase Auth/Firestore; nếu bị gián đoạn có thể hoàn tất bằng xác thực đúng email/mật khẩu.

## Content v8 và map revision

`gameContent/{version}` không chứa layouts; giữ `layoutCodes`, `normalTileIds`, registry
`tiles`, `chapters`, `levelBaseExp` và luật chung. `gameMaps/{mapId}` dùng ID số và giữ
`latestVersion`, `latestSummary`, chapter/order cùng danh sách map revision bất biến. Mỗi
revision lưu `layoutRows: [{cells: number[]}]` theo thứ tự từ trên xuống. API chuyển chúng
thành `layout: number[][]`. `0` là khuyết, `-1` sinh ô thường, số dương tham chiếu registry.
Registry v8 dùng 1/2/3/4/5 cho Kiếm/Hỏa/Lôi/Linh Châu/Đá. `initialSeals` dùng `{row,column}`
zero-based từ trên xuống. Tutorial metadata giữ các bước và lời nhắc của map hướng dẫn.

`players/{uid}/runs/{runId}` giữ map revision cố định (cũng mã hóa `layoutRows`), seed,
loadout/EXP, mức hỗ trợ, installation, attempt, status, report và receipt kết quả.
`players/{uid}/mapStats/{levelId}` giữ attemptsStarted/retryCount/wins/losses/abandoned,
consecutiveFailures/bestStars/bestMovesUsed/firstWinAt (lần thắng đầu được ghi từ khi bật tính năng).
Report chứa outcome, movesUsed, objectiveProgress, extraMovesUsed; không lưu từng nước đi.

Chỉ mục chương và miễn index layout được định nghĩa trong `firestore.indexes.json`.
Chi tiết vận hành: [MAP_AUTHORING.md](content/MAP_AUTHORING.md).

## Numeric map resources / server-selected runs

Current storage is `gameMaps/{mapId}` with `latestVersion`, `latestSummary` and immutable
entries in an append-only `versions` array. Each entry includes independent `mapVersion`,
explicit `rulesMode` and a tile registry. Its `contentVersion` is authoring provenance.

`gameConfig/current.catalogRevision` invalidates caches independently of config version.
Runs store `mapVersion` and `configVersion` alongside their trusted map snapshot.
Updated start/finish requests contain no selection version; the server selects at start
and reads pins by `runId` at finish. `profileV2.rewardCredits` stores credited
`{exp, starBonus}` by stable map ID without repricing existing balances.

See [MAP_VERSIONING.md](content/MAP_VERSIONING.md) for API contracts, lifecycle,
immutable publication, migration and size constraints.
