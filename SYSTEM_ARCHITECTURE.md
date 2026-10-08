# Kiến trúc hệ thống — Kiếm Khai Tiên Lộ 1.2

## Quyền sở hữu dữ liệu

React Native chạy toàn bộ gameplay: sinh bàn, RNG, nước đi, cascade, kiếm thuật và animation. Firebase Functions là cổng HTTPS duy nhất tới Firebase Auth và Firestore. Client không dùng Firebase SDK; rules tiếp tục từ chối truy cập database trực tiếp.

Firestore là nguồn dữ liệu cho catalog và profile. `content/game-content.json` là dữ liệu seed để xuất bản catalog; không được nhúng vào client. `content/game-domain.ts` chứa schema và luật profile dùng chung, được sinh thành module TypeScript cho client/server.

`gameConfig/current.contentVersion` trỏ tới document bất biến `gameContent/{version}`. Mỗi catalog có metadata của 8 skill/8 kiếm, chỉ số ô, 10 cảnh giới, phần thưởng và map. Hiệu ứng và cách chọn mục tiêu của kiếm/skill xử lý case by case theo ID trên client; không lưu SwordModifier, SkillEffect hay target selection trong database. ID/hành vi mới cần cập nhật client.

## Khởi động và phiên khách

1. Đọc session từ SecureStore; session hỏng hoặc không đọc được là lỗi, không tạo khách thay thế.
2. Health check và tải bootstrap, kiểm tra minClientVersion và schema catalog.
3. Nếu chưa có session, tạo tài khoản khách qua API và lưu token ngay.
4. Tải profile server; đọc journal v3 đúng UID, tải catalog của màn/request đang dở nếu khác phiên bản hiện tại.
5. Xử lý request chưa được xác nhận rồi mới mở game.

Initialize và health check dùng một promise chung để tránh tạo khách hoặc kiểm tra trùng. Tài khoản khách được tạo với profileV2 đầy đủ ngay trước khi API trả session. Đăng ký email liên kết trên cùng UID; đăng nhập tài khoản khác gộp profile khách trên server một lần bằng `mergedInto`.

## Engine và nhiều mục tiêu

Map gồm width, height, activeCells (index = y × width + x; y=0 ở dưới), moves, seed, obstacles, spawnPhases và mảng objectives. Mỗi objective có ID duy nhất. Có thể kết hợp nhiều mục tiêu Collect/BreakRocks/BreakSeals với tối đa một Battle/Boss; thắng khi tất cả hoàn thành.

Snapshot lưu `objectiveProgress` theo ID, tổng đã thu thập/phá hoặc sát thương đã gây, được giới hạn từ 0 đến target. Một lần xóa ô có thể vừa tăng thu thập vừa gây sát thương. Mục tiêu đã xong không kết thúc màn nếu mục tiêu khác chưa xong. Điều kiện thắng được kiểm tra sau cascade; skill hợp lệ vẫn dùng được ở 0 lượt theo luật hiện có.

Ô khuyết là null trong snapshot và false trong activeCells. Match không xuyên ô khuyết. Gravity refill từng đoạn cột ngăn bởi ô khuyết, đá hoặc phong ấn. Skill hàng/cột bỏ qua ô khuyết. Sinh bàn/xáo bàn có giới hạn thử; cấu hình không thể chơi trả NO_PLAYABLE_BOARD thay vì lặp vô hạn.

spawnPhases được sắp tăng theo minMovesRemaining, bắt đầu từ 0. Chọn ngưỡng lớn nhất không vượt số lượt còn lại; weights theo thứ tự Kiếm/Hỏa/Lôi/Tụ Linh Châu, mỗi trọng số là số nguyên dương. Catalog ban đầu giữ 40 màn 7×7, trọng số đều và cân bằng cũ.

Context màn cố định theo contentVersion: cấu hình level, metadata skill, trang bị, sức mạnh và RNG. Trace chứa objectiveProgressAfter để HUD cập nhật đúng thời điểm hiệu ứng; HUD hiển thị tất cả mục tiêu, dùng HP cho Battle/Boss.

## Giao dịch và phục hồi

Client không chiếu profile từ operation và không cho chơi offline. Mua/equip nhận profile mới sau xác nhận server. Thắng tạo operation dùng runId; server kiểm tra đủ objectives, màn đã mở, giá, ví, sở hữu và ô skill, rồi tính thưởng. Server không mô phỏng lại nước đi để xác minh kết quả.

Mỗi request đang gửi được lưu vào journal v3 trước khi gọi API, với ID và contentVersion bất biến. Khi timeout hoặc đóng app, retry đúng payload/ID. Receipt lưu hash bao gồm phiên bản nội dung, kết quả accepted/reason và thưởng. Retry trả lại thưởng cũ, không cộng tiền hoặc EXP lần nữa. Các receipt được đọc trước khi ghi profile trong cùng Firestore transaction, bảo đảm hai thiết bị không tiêu quá ví.

Kết quả thắng dùng catalog phiên bản đã chơi; mua/equip mới cần phiên bản hiện tại. Receipt đã có vẫn được replay sau khi catalog chuyển phiên bản. Profile trả về luôn dùng catalog hiện tại để kiểm tra sở hữu và hiển thị. Tiền/EXP đã ghi trên server được giữ nguyên khi đọc; client không tự tính lại profile.

Journal chỉ giữ UID, snapshot, kết quả đã xác nhận và request chưa được xác nhận. Profile lấy từ server mỗi lần mở app. Save offline v1/v2 và archive cũ bị bỏ qua, không import. Logout xóa session và journal cục bộ, giữ profile database. Đăng nhập lại cùng UID giữ request chờ; không chuyển request sang UID khác.

## Health check và refresh token

`GET /health` không cần auth, không cache. Client kiểm tra mỗi 5 giây khi foreground, timeout 2 giây. Timeout thử thêm một lần; lỗi kết nối/HTTP lỗi khóa ngay. Không chạy chồng request health. Trở lại foreground phải kiểm tra trước khi cho thao tác.

Dialog mạng là Modal toàn app, không đóng bằng Back hoặc chạm ngoài. Retry gọi health; server trả thành công thì đóng dialog. Guard trong store cũng khóa gameplay/giao dịch khi disconnected, background, đang phục hồi, lỗi phiên hoặc còn request chờ.

Mọi API có xác thực dùng chung xử lý HTTP 401: một refresh cho các request đồng thời, lưu token mới ngay, replay một lần. Response cũ bị loại nếu session generation thay đổi. Refresh lỗi mạng giữ token; refresh bị từ chối vĩnh viễn yêu cầu xác thực lại và không tự tạo khách. Firebase quản lý vòng đời refresh token; app không đặt TTL.

## API

| Endpoint | Auth | Hành vi |
| --- | --- | --- |
| GET /health | Không | Kết nối API; no-store |
| GET /v2/bootstrap | Không | Catalog hiện tại, version, quảng cáo, minClientVersion |
| GET /v2/content/:version | Không | Catalog bất biến của màn đang chơi |
| GET /v2/profile | Có | Profile chính thức, migrate dữ liệu server legacy nếu cần |
| POST /v2/profile/sync | Có | win/purchase/equip, tối đa 50 operations |
| POST /v1/auth/guest | Không | Tạo khách và profile đầy đủ |
| POST /v1/auth/register | Khách hoặc không | Liên kết email |
| POST /v1/auth/login | Có thể kèm khách | Đăng nhập/gộp khách một lần |
| POST /v1/auth/refresh | Refresh token | Làm mới phiên |
| GET /v1/progress | Có | Đọc tương thích; PUT trả 426 |
| /v1/ads/* | Theo endpoint | Intent quảng cáo/AdMob SSV như hiện tại |

Sync body: `{contentVersion, operations}`. Win: `{id: runId, kind: 'win', levelId, stars, objectiveProgress}`. Response: `{profile, acknowledged, rejected, rewards}`. Không nhận importProgress hoặc contentVersion < 3.

## Phát hành

Build backend, validate/seed catalog mới, đặt minClientVersion rồi phát hành client 1.2.0. Script seed mặc định dry run, yêu cầu `--apply --project ID` để ghi và không cho sửa document version đã xuất bản. Không tự deploy production. Xem DATABASE_SCHEMA.md và README.md để chạy emulator/kiểm thử.
