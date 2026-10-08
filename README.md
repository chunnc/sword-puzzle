# Kiếm Khai Tiên Lộ — React Native client và backend

Game ghép 3 tu tiên cho iOS/Android. [GAME_CONCEPT.md](GAME_CONCEPT.md) mô tả gameplay và art style; [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) mô tả ranh giới client–server và API.

## Trạng thái hiện tại

- `client/`: Expo SDK 57, React Native 0.86, TypeScript; 40 màn, bàn 7×7 với 4 ô, cường hóa và animation hàng đợi; EXP/10 cảnh giới, 8 skill, 8 bảo kiếm, cửa hàng xác nhận qua server, tài khoản khách và HTTPS.
- `server/`: Firebase Functions v2 với Auth sau API, profile/EXP/ví/túi đồ, giao dịch chống lặp, API quảng cáo và AdMob SSV.
- `firestore.rules` và `storage.rules`: từ chối mọi truy cập trực tiếp từ mobile/web client.
- UI tái sử dụng art hiện có, xuất thành WebP tối ưu bởi `tools/generate_ui_assets.py`. Chạy script sau khi chỉnh nguồn ảnh; cần Pillow 11+. `assets/ui-preview.png` chỉ là tài liệu tham chiếu, không được dùng làm sprite giao diện.

## Chạy client trên iOS/Android

Yêu cầu Node.js 22.13+, Expo development build, Android Studio/Android SDK cho Android và Xcode 26.4+ cho iOS. Expo Go không hỗ trợ AdMob và các thư viện native của game.

1. Trong `client/`, tạo `.env` từ `.env.example`. `EXPO_PUBLIC_GAME_API_URL` là bắt buộc; trỏ URL này tới HTTP Function `gameApi` tại `asia-southeast1`.
2. Chạy `npm install`.
3. Chạy `npm run android` hoặc `npm run ios` để sinh native project theo Expo Prebuild, build và cài development app lên thiết bị/simulator.
4. Sau khi cài development app, chạy `npm start` để mở Metro và nạp client.

App cần internet và dữ liệu server trước khi mở game. Lần đầu tự tạo hồ sơ khách; các lần sau dùng lại session. Health check mỗi 5 giây, timeout 2 giây và thử thêm một lần khi timeout; mất kết nối hiện dialog chặn thao tác, nút Thử lại chỉ đóng dialog sau khi server phản hồi thành công. Email/mật khẩu là tài khoản game; bản thử nghiệm chưa có xác minh email hoặc khôi phục mật khẩu.

Client không chứa Firebase Auth/Firestore SDK. Token chỉ được dùng làm bearer token tới Game API; session lưu trong iOS Keychain/Android Keystore, còn profile, ví, trang bị và tiến trình được lưu trên server. Journal cục bộ v3 chỉ giữ bàn đang chơi và request chờ xác nhận, có bản dự phòng. Save offline v1/v2 bị bỏ qua. API trả 401 sẽ refresh token chung và gửi lại request một lần.

## Chạy backend

1. Project Firebase mặc định của repo là `sword-puzzle` trong `.firebaserc`. Bật Authentication **Anonymous** và **Email/Password**, rồi tạo Firestore. Bản server hiện tại chưa cần Cloud Storage.
2. `cd server && npm install`. Tạo `server/.env` từ `server/.env.example` và điền Firebase Web API key cùng hai `ad_unit` dạng số mà AdMob gửi trong SSV callback.
3. Build/validate dữ liệu bằng `npm run api:build` và `npm run api:seed` (dry run). Seed thật dùng `node tools/seed_game_content.mjs --apply --project PROJECT_ID`; document phiên bản đã xuất bản là bất biến. Khi chạy emulator, đặt `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` và dùng project `demo-kiem-khai`.
4. `npm run api:test` ở thư mục gốc chạy unit test và biên dịch. `npm run api:serve` chạy Firebase Emulator Suite; cần JDK trong `PATH`. Dùng project `demo-...` cho thử nghiệm cục bộ. HTTP Function trong emulator có URL dạng `http://127.0.0.1:5001/PROJECT_ID/asia-southeast1/gameApi`.
5. Khi cấu hình sản phẩm thật, chạy `npm run api:deploy` từ thư mục gốc để deploy Functions và Firestore rules. Cấu hình `gameConfig/current` trong Firestore với `rewardedAdsEnabled: false` lúc đầu; chỉ chuyển thành `true` sau khi AdMob SSV đã sẵn sàng. Có thể đặt `minClientVersion`.

API gọi Firebase Auth REST qua backend. Khi chạy Emulator Suite, API tự dùng Auth Emulator qua `FIREBASE_AUTH_EMULATOR_HOST`; Admin SDK cũng dùng emulator cho Auth và Firestore. Client vẫn chỉ gọi Game API.

### AdMob nhận thưởng

1. Client dùng `react-native-google-mobile-ads` với Expo config plugin. Development build mặc định dùng Google sample App IDs và `TestIds.REWARDED`.
2. Trước release, cấu hình `ADMOB_ANDROID_APP_ID`, `ADMOB_IOS_APP_ID` và `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID` trong môi trường build. Không bật cờ quảng cáo backend khi chưa có IDs thật và callback SSV.
3. Tại AdMob, đặt reward item là `moves`, amount là `3`, bật server-side verification và trỏ callback tới `https://asia-southeast1-PROJECT_ID.cloudfunctions.net/gameApi/v1/ads/admob-ssv`.
4. Client tạo ad intent trước khi hiển thị và truyền intent ID làm SSV `customData`. Server xác thực callback và chống ghi thưởng trùng. Chỉ cộng lượt khi SDK báo người chơi nhận thưởng thành công.

`ADMOB_REWARDED_AD_UNITS` chứa giá trị `ad_unit` trong callback SSV, có thể khác định dạng ad unit ID (`ca-app-pub-...`) dùng trong app. Xác nhận giá trị bằng công cụ kiểm tra callback của AdMob.

## Kiểm thử

- `npm --prefix client run typecheck` kiểm tra TypeScript; `npm --prefix client test` kiểm tra engine, nhiều objectives, bàn chữ nhật/ô khuyết, catalog, EXP, cửa hàng, journal và refresh token. Fixture Unity cũ được giữ cho kiểm thử save migration.
- `npm run api:test` chạy kiểm thử server hiện có.
- `API_BASE_URL=http://127.0.0.1:5001/PROJECT_ID/asia-southeast1/gameApi npm --prefix server run test:integration` kiểm tra health/catalog, guest/email, EXP 0 sao, retry, objectives, catalog đổi phiên bản, mua cạnh tranh, gộp ví khách một lần và từ chối truy cập Firestore trực tiếp.
- Trên thiết bị thật, kiểm tra vùng an toàn màn hình, vuốt/chọn ô, save sau khi đóng app, mất mạng → Retry → tiếp tục cùng bàn và rewarded ad test trên Android 9+ 3 GB RAM/iOS 16.4+.

Trước deploy, cấu hình IAM tối thiểu cho tài khoản chạy Functions, giữ rules Firestore/Storage từ chối truy cập client, thiết lập TTL cho `authThrottle.expiresAt` và `adIntents.ttlAt`, rồi theo dõi lỗi 5xx, đồng bộ và SSV. Backend production và AdMob IDs thật chưa được cấu hình trong workspace.


## Nội dung phiên bản 3 / client 1.2.0

Catalog server dùng content/game-content.json để seed Firestore. tools/generate_game_content.mjs chỉ chia sẻ schema/luật profile; không nhúng dữ liệu catalog vào client. Schema database: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

Map hỗ trợ nhiều objectives đồng thời (AND), tối đa một Battle/Boss, kích thước bàn và mặt nạ ô. Client giữ logic kiếm/skill theo ID. Server cung cấp metadata và trọng số sinh ô theo giai đoạn; không xử lý từng nước đi. 40 màn seed giữ nguyên độ khó, mỗi màn có một objective.

Chạy integration bằng project demo, sau khi build backend:

```sh
npm run api:build
JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH firebase emulators:exec --project demo-kiem-khai --only functions,auth,firestore 'node tools/seed_game_content.mjs --apply --project demo-kiem-khai && API_BASE_URL=http://127.0.0.1:5001/demo-kiem-khai/asia-southeast1/gameApi npm --prefix server run test:integration'
```

Điều chỉnh JAVA_HOME/PATH theo OpenJDK 21 trên máy. iOS Simulator dùng 127.0.0.1; Android Emulator dùng 10.0.2.2 để kết nối API trên máy host. Thiết bị thật dùng địa chỉ LAN của máy chạy emulator.
