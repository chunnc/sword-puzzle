# Kiến trúc hệ thống — Kiếm Khai Tiên Lộ

## Quyền sở hữu dữ liệu

Expo/React Native xử lý nước đi và lưu offline. Firebase Functions là cổng HTTPS duy nhất tới Auth và Firestore; client không dùng Firebase SDK trực tiếp. Rules Firestore/Storage tiếp tục từ chối mọi truy cập trực tiếp.

Catalog trong content/game-content.json và domain trong content/game-domain.ts là nguồn chung. Công cụ generate_game_content.mjs sinh module TypeScript vào thư mục src của client/server, phù hợp cấu hình build hiện có. Content version 2 có 40 màn, bốn ô, tám skill, tám bảo kiếm và mười cảnh giới.

## Client và engine

- BoardEngine xử lý match theo nhóm giao nhau, cường hóa 4/5, hàng đợi kích hoạt, chướng ngại, cascade và skill.
- Trace mỗi hiệu ứng chứa vùng tác động, nguồn, sát thương và khí. UI phát trace tuần tự, rồi mới chạy rơi ô. Giảm chuyển động đi thẳng tới cùng kết quả cuối.
- Snapshot giữ contentVersion, runId, RNG, loadout, hệ số sức mạnh, Ngưng Khí và cờ dùng skill. Loadout/sức mạnh cố định suốt màn.
- Game store tuần tự hóa các thay đổi; ghi save trước khi công bố state mới. Thắng màn tạo một operation dùng runId; mua/equip có ID riêng.
- Profile được chiếu từ confirmed profile và outbox. Chơi offline, mua và đổi trang bị đều dùng cùng domain với server.
- Save v2 có backup. Migration giữ best stars và thưởng tiến độ bằng importProgress có ID ổn định; snapshot v1 bắt đầu lại màn.
- Save gắn UID. Đăng nhập tài khoản khác lưu bản cũ vào archive theo UID, phục hồi các thao tác pending khi trở lại.

## EXP, thành tích và kinh tế

Kết quả 0 sao là đã thắng; chưa thắng là không có bản ghi. Mở màn theo chuỗi bản ghi liên tục. EXP là tổng EXP nền nhân tỷ lệ của best stars: 0/1/2/3 sao = 30/60/80/100%. Merge best stars rồi tính lại EXP, không cộng tổng EXP giữa hai thiết bị.

Lần đầu thắng nhận 100 linh thạch và bonus thành tích 0/0/25/50. Chơi lại nhận 10 và chênh lệch bonus. Server tính giá/thưởng từ catalog, không nhận số dư hoặc tổng EXP do client khai.

Một bảo kiếm và một skill miễn phí ban đầu. Skill thứ hai mở tại 1.500 EXP. Các món tự dùng tu vi hiện tại, chưa có hệ nâng cấp độc lập. Cửa hàng mở theo màn, không theo EXP.

## API

| Endpoint | Auth | Chức năng |
| --- | --- | --- |
| GET /v2/bootstrap | Không | Version, số màn, cờ quảng cáo, minClientVersion |
| GET /v2/profile | Có | Khởi tạo/migrate và trả profile |
| POST /v2/profile/sync | Có | Xử lý tối đa 50 operations theo thứ tự |
| POST /v1/auth/guest | Không | Tạo khách |
| POST /v1/auth/register | Khách hoặc không | Liên kết email trên cùng UID |
| POST /v1/auth/login | Không, có thể kèm khách | Đăng nhập và gộp khách |
| POST /v1/auth/refresh | Refresh token | Làm mới phiên |
| GET/PUT /v1/progress | Có | Tương thích tiến trình cũ |
| POST /v1/ads/intents | Có | Intent +3 lượt cho màn đã mở |
| GET /v1/ads/intents/{id} | Có | Trạng thái thưởng |
| GET /v1/ads/admob-ssv | Chữ ký | Xác minh và chống ghi thưởng lặp |

Sync body gồm contentVersion: 2 và operations. Các loại: win, purchase, equip, importProgress. Mỗi operation có ID bất biến. Response có profile, acknowledged IDs, rejected {id, reason} và rewards theo win ID. Rewards được giữ trong receipt để màn thắng hiển thị đúng EXP/tiền sau hòa giải với best stars trên server.

API kiểm tra cấu trúc, cửa hàng, sở hữu, giá, tiền, ô skill và thứ tự màn. Giữ mô hình chơi đơn hiện tại: không mô phỏng lại nước cờ để chống gian lận.

## Firestore và giao dịch

- players/{uid}: profileV2 (levels, coins, ownedSkills, ownedSwords, loadout, revision, totalExp), cùng fields stars/highestUnlocked/realm để tương thích.
- players/{uid}/operations/{operationId}: hash payload, accepted/reason, createdAt. Retry cùng payload trả kết quả đã xử lý; dùng lại ID với payload khác bị từ chối.
- gameConfig/current: cờ quảng cáo và minClientVersion.
- adIntents, adTransactions, authThrottle: giữ luồng và TTL hiện có.

Mỗi batch sync đọc profile và tất cả receipts trước khi ghi, xử lý tuần tự trong một Firestore transaction. Hai thiết bị tranh số dư sẽ được Firestore retry dựa trên profile mới. Client bỏ thao tác đã nhận/từ chối, chiếu lại pending trên profile trả về. Màn đang chơi vẫn dùng context đã cố định.

Trước khi login với khách, client flush outbox. Server hợp sở hữu, merge best stars, cộng số dư còn lại và đánh dấu mergedInto trong cùng transaction. Retry login không chuyển ví khách lần nữa. EXP luôn tính từ best stars đã hợp.

Profile v2 được khởi tạo từ sao legacy đúng một lần. Các kết quả ngoài số màn phát hành được giữ trong storage legacy, không dùng trong profile hiện tại.

## Kiểm chứng và phát hành

Chạy typecheck, client tests, server tests và integration trên demo Firebase Emulator. Integration bao gồm Auth, cấm truy cập Firestore trực tiếp, EXP 0 sao, retry, hai thiết bị mua cạnh tranh và gộp ví khách một lần.

Build backend trước khi phát hành client content v2. minClientVersion và cờ quảng cáo lấy từ cấu hình server. Backend production và bản native phát hành cần được cấu hình và kiểm tra riêng.
