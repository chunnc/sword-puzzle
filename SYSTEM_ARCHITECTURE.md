# Kiến trúc hệ thống — Kiếm Khai Tiên Lộ 1.3

## Quyền sở hữu dữ liệu

React Native chạy toàn bộ gameplay: sinh bàn, RNG, nước đi, cascade, kiếm thuật và animation. Firebase Functions là cổng HTTPS duy nhất tới Firebase Auth và Firestore. Client không dùng Firebase SDK; rules tiếp tục từ chối truy cập database trực tiếp.

Firestore là nguồn dữ liệu cho catalog và profile. `content/game-content.json` là dữ liệu seed để xuất bản catalog; không được nhúng vào client. `content/game-domain.ts` chứa schema và luật profile dùng chung, được sinh thành module TypeScript cho client/server.

`gameConfig/current.contentVersion` trỏ tới document bất biến `gameContent/{version}`. Mỗi catalog có metadata của 8 skill/8 kiếm, chỉ số ô, 10 cảnh giới, phần thưởng và map. Hiệu ứng và cách chọn mục tiêu của kiếm/skill xử lý case by case theo ID trên client; không lưu SwordModifier, SkillEffect hay target selection trong database. ID/hành vi mới cần cập nhật client.

## Khởi động và phiên khách

1. Health check, tải bootstrap và kiểm tra phiên bản client/catalog.
2. Đọc session và khóa bản cài đặt trong SecureStore. Token hỏng chỉ được phục hồi bằng khóa đã có; không tự thay bằng khách mới.
3. Lần đầu tạo ID ngẫu nhiên 128 bit và khóa 256 bit, lưu trước khi gọi `/v2/auth/device-session`. Server lưu hash khóa, liên kết một UID; retry dùng lại cùng UID.
4. Session Firebase custom token có claims `installationId` và `bindingVersion`. Mỗi bản cài đặt có một UID hiện tại; nhiều bản cài đặt có thể dùng chung UID đã liên kết email.
5. Tải profile và journal đúng UID, gửi lại request chờ theo ID cũ rồi mở game.

Đăng ký email giữ UID khách. Đăng nhập tài khoản có sẵn thay liên kết thiết bị, không gộp profile. Khi rời khách phải xác nhận nguy cơ không khôi phục được tiến trình; tài khoản đã liên kết không cần cảnh báo này. Đăng xuất liên kết một khách mới trên máy hiện tại, không thu hồi phiên máy khác. Hồ sơ cũ vẫn trên server.

Các thao tác đổi danh tính có operation ID và receipt trong installations; retry không đổi liên kết lần nữa. Binding version tăng mỗi lần thay đổi. Middleware kiểm tra claims với bản ghi liên kết; transaction ghi profile/ad intent đọc lại liên kết để ngăn request cũ commit sau khi đổi tài khoản.

Khóa thiết bị là thông tin đăng nhập dài hạn: chỉ SecureStore giữ bản rõ, server lưu SHA-256, không ghi log. Không dùng hardware ID. Mất khóa khi gỡ app/xóa dữ liệu có thể mất khả năng phục hồi khách. Khi đổi mật khẩu/thu hồi Firebase session, baseline `authValidAfter` ngăn khóa cũ tự cấp quyền lại; cần xác thực email/mật khẩu. Tài khoản bị khóa hoặc xóa không được phục hồi hay tạo lại cùng UID.

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

Journal chỉ giữ UID, snapshot, kết quả đã xác nhận và request chưa được xác nhận. Profile lấy từ server mỗi lần mở app. Save offline v1/v2 và archive cũ bị bỏ qua, không import. Logout thay liên kết bằng khách mới, xóa journal của UID cũ và giữ profile database. Đăng nhập lại cùng UID giữ request chờ; không chuyển request sang UID khác.

## Health check và refresh token

`GET /health` không cần auth, không cache. Client kiểm tra mỗi 5 giây khi foreground, timeout 2 giây. Timeout thử thêm một lần; lỗi kết nối/HTTP lỗi khóa ngay. Không chạy chồng request health. Trở lại foreground phải kiểm tra trước khi cho thao tác.

Dialog mạng là Modal toàn app, không đóng bằng Back hoặc chạm ngoài. Retry gọi health; server trả thành công thì đóng dialog. Guard trong store cũng khóa gameplay/giao dịch khi disconnected, background, đang phục hồi, lỗi phiên hoặc còn request chờ.

Mọi API có xác thực dùng chung xử lý HTTP 401: một refresh cho các request đồng thời, lưu token mới ngay, replay một lần. Response cũ bị loại nếu session generation thay đổi. Refresh lỗi mạng giữ token; refresh trả 401 thì thử phục hồi cùng hồ sơ bằng khóa thiết bị. Phục hồi bị từ chối cho phép thử lại, đăng nhập hoặc chủ động xác nhận chơi khách mới. Không tự bỏ danh tính. Firebase quản lý vòng đời refresh token; app không đặt TTL.

Health check định kỳ chỉ kiểm tra mạng khi danh tính đã bị từ chối; không gửi lại xác thực mỗi 5 giây. Khởi động app và nút thử khôi phục chủ động được phép thử lại, kể cả khi một health check đang chạy. Chuyển đổi legacy token đã xác minh không tiêu hạn mức tạo khách mới theo IP.

## API

| Endpoint | Auth | Hành vi |
| --- | --- | --- |
| GET /health | Không | Kết nối API; no-store |
| GET /v2/bootstrap | Không | Catalog hiện tại, version, quảng cáo, minClientVersion |
| GET /v2/content/:version | Không | Catalog bất biến của màn đang chơi |
| GET /v2/profile | Có | Profile chính thức, migrate dữ liệu server legacy nếu cần |
| POST /v2/profile/sync | Có | win/purchase/equip, tối đa 50 operations |
| POST /v2/auth/device-session | Khóa thiết bị; legacy bearer khi chuyển đổi | Tạo/khôi phục session, cùng UID nếu đã có liên kết |
| POST /v2/auth/register | Khóa thiết bị, operation ID/version | Liên kết email vào UID khách |
| POST /v2/auth/login | Khóa thiết bị, email/mật khẩu, operation ID/version | Đổi liên kết; khách cần confirmedDiscardGuest |
| POST /v2/auth/logout | Khóa thiết bị, operation ID/version | Liên kết khách mới, giữ các máy khác |
| POST /v2/auth/refresh | Refresh token | Refresh và kiểm tra binding |
| POST /v1/auth/refresh | Legacy refresh token | Chỉ dùng chuyển đổi session cũ |
| POST /v1/auth/guest, register, login | — | 426, cần client 1.3 |
| GET /v1/progress | Có | Đọc tương thích; PUT trả 426 |
| /v1/ads/* | Theo endpoint | Intent quảng cáo/AdMob SSV như hiện tại |

Sync body: `{contentVersion, operations}`. Win: `{id: runId, kind: 'win', levelId, stars, objectiveProgress}`. Response: `{profile, acknowledged, rejected, rewards}`. Không nhận importProgress hoặc contentVersion < 3.

## Phát hành

Build backend, validate/seed catalog mới, đặt minClientVersion rồi phát hành client 1.3.0. Script seed mặc định dry run, yêu cầu `--apply --project ID` để ghi và không cho sửa document version đã xuất bản. Không tự deploy production. Xem DATABASE_SCHEMA.md và README.md để chạy emulator/kiểm thử.

## Kiểm thử acceptance

Xem [ACCEPTANCE_GUEST.md](ACCEPTANCE_GUEST.md). Chỉ development build bật `EXPO_PUBLIC_ACCEPTANCE_TEST=1` và URL proxy localhost mới có bridge điều khiển test. Release không bật bridge. Proxy chỉ kết nối project demo trên Firebase Emulator; không có đường tới production. Chat Luna High chỉ chạy test và báo kết quả, không thay source.

Production dùng service account có quyền ký `iam.serviceAccounts.signBlob` để Firebase Admin tạo custom token. Không đưa private key service account vào client hoặc repository.
