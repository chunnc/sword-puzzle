# Firestore schema — content v3

Client chỉ gọi Game API. Mọi truy cập Firestore trực tiếp bị rules từ chối.

```text
gameConfig/current
gameContent/{contentVersion}
players/{uid}
players/{uid}/operations/{operationId}
adIntents/{intentId}
adTransactions/{transactionId}
authThrottle/{keyHash}
```

## gameConfig/current

```json
{"contentVersion":3,"minClientVersion":"1.2.0","rewardedAdsEnabled":false}
```

## gameContent/{contentVersion}

Document bất biến. Schema TypeScript đầy đủ: `GameContent`, `LevelDefinition`, `ObjectiveDefinition`, `SkillDefinition`, `SwordDefinition` trong [content/game-domain.ts](content/game-domain.ts). Dữ liệu 40 màn ban đầu: [content/game-content.json](content/game-content.json).

- version, levelCount, qiCap, expRates (0/1/2/3 sao), rewards (firstWinCoins, replayWinCoins, starBonus).
- tiles: id/name/damage/qi; realms: id/name/exp.
- swords: id/name/description/artKey/color/unlock/price.
- skills: id/name/description/artKey/unlock/price/cost.
- levels: id/chapter/moves/seed/baseExp/board/objectives/obstacles/spawnPhases.

Không lưu SwordModifier, SkillEffect hoặc cách chọn mục tiêu. Client triển khai hành vi theo ID.

`board.activeCells` có width × height phần tử boolean; index=y×width+x, y=0 là hàng dưới cùng. False là ô khuyết.

Ví dụ nhiều objectives (mọi mục tiêu phải hoàn thành):

```json
[
  {"id":"collect-swords","type":"Collect","tileKind":0,"target":18},
  {"id":"defeat-boss","type":"Boss","target":360,"enemy":{"id":"boss-01","name":"Yêu Vương","artKey":"beast"}}
]
```

Có ít nhất một objective, ID duy nhất, tối đa một Battle/Boss. Các loại khác: BreakRocks, BreakSeals. `target` của Battle/Boss là HP; các loại còn lại là số lượng cần đạt.

`spawnPhases` bắt đầu từ minMovesRemaining=0, sắp tăng; weights là bốn số nguyên dương theo Kiếm/Hỏa/Lôi/Tụ Linh Châu. Chọn ngưỡng lớn nhất ≤ số lượt còn lại. Seed dùng `[1,1,1,1]`.

## players/{uid}

```json
{
  "profileV2":{
    "coins":150,"totalExp":100,"revision":1,
    "levels":[{"levelId":1,"stars":3}],
    "ownedSwords":["thanh-phong"],"ownedSkills":["nhat-kiem"],
    "loadout":{"sword":"thanh-phong","skills":["nhat-kiem"]}
  },
  "stars":{"1":3},"highestUnlocked":2,"realm":"LuyenKhi",
  "createdAt":1791417600000,"updatedAt":1791417600000
}
```

`levels` giữ sao cao nhất; có bản ghi 0 sao cũng là đã thắng. stars/highestUnlocked/realm là bản chiếu tương thích do server cập nhật. `mergedInto` chỉ có trên hồ sơ khách đã gộp, chứa UID tài khoản nhận. Đọc hồ sơ không tự tính lại coins/totalExp đã lưu.

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
