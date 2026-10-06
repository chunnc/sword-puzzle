# Kiếm Khai Tiên Lộ — React Native client và backend

Game ghép 3 tu tiên cho iOS/Android. [GAME_CONCEPT.md](GAME_CONCEPT.md) mô tả gameplay và art style; [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) mô tả ranh giới client–server và API.

## Trạng thái hiện tại

- `client/`: Expo SDK 57, React Native 0.86, TypeScript; 40 màn, bàn 7×7 với 4 ô, cường hóa và animation hàng đợi; EXP/10 cảnh giới, 8 skill, 8 bảo kiếm, cửa hàng offline, tài khoản và đồng bộ HTTPS.
- `server/`: Firebase Functions v2 với Auth sau API, profile/EXP/ví/túi đồ, giao dịch chống lặp, API quảng cáo và AdMob SSV.
- `firestore.rules` và `storage.rules`: từ chối mọi truy cập trực tiếp từ mobile/web client.
- UI tái sử dụng art hiện có, xuất thành WebP tối ưu bởi `tools/generate_ui_assets.py`. Chạy script sau khi chỉnh nguồn ảnh; cần Pillow 11+. `assets/ui-preview.png` chỉ là tài liệu tham chiếu, không được dùng làm sprite giao diện.

## Chạy client trên iOS/Android

Yêu cầu Node.js 22.13+, Expo development build, Android Studio/Android SDK cho Android và Xcode 26.4+ cho iOS. Expo Go không hỗ trợ AdMob và các thư viện native của game.

1. Trong `client/`, tạo `.env` từ `.env.example`. Để chơi offline, có thể để trống `EXPO_PUBLIC_GAME_API_URL`. Để kết nối backend, trỏ URL này tới HTTP Function `gameApi` tại `asia-southeast1`.
2. Chạy `npm install`.
3. Chạy `npm run android` hoặc `npm run ios` để sinh native project theo Expo Prebuild, build và cài development app lên thiết bị/simulator.
4. Sau khi cài development app, chạy `npm start` để mở Metro và nạp client.

App chạy được offline mà không cấu hình backend. Khi có mạng, app tự tạo tài khoản khách, đồng bộ tiến trình và thử lại khi kết nối phục hồi. Email/mật khẩu là tài khoản game; bản thử nghiệm chưa có xác minh email hoặc khôi phục mật khẩu.

Client không chứa Firebase Auth/Firestore SDK. Token chỉ được dùng làm bearer token tới Game API; session lưu trong iOS Keychain/Android Keystore, còn tiến trình và bàn đang chơi lưu cục bộ có bản dự phòng.

## Chạy backend

1. Project Firebase mặc định của repo là `sword-puzzle` trong `.firebaserc`. Bật Authentication **Anonymous** và **Email/Password**, rồi tạo Firestore. Bản server hiện tại chưa cần Cloud Storage.
2. `cd server && npm install`. Tạo `server/.env` từ `server/.env.example` và điền Firebase Web API key cùng hai `ad_unit` dạng số mà AdMob gửi trong SSV callback.
3. `npm run api:test` ở thư mục gốc chạy unit test và biên dịch. `npm run api:serve` chạy Firebase Emulator Suite; cần JDK trong `PATH`. Dùng project `demo-...` cho thử nghiệm cục bộ. HTTP Function trong emulator có URL dạng `http://127.0.0.1:5001/PROJECT_ID/asia-southeast1/gameApi`.
4. Khi cấu hình sản phẩm thật, chạy `npm run api:deploy` từ thư mục gốc để deploy Functions và Firestore rules. Cấu hình `gameConfig/current` trong Firestore với `rewardedAdsEnabled: false` lúc đầu; chỉ chuyển thành `true` sau khi AdMob SSV đã sẵn sàng. Có thể đặt `minClientVersion`.

API gọi Firebase Auth REST qua backend. Khi chạy Emulator Suite, API tự dùng Auth Emulator qua `FIREBASE_AUTH_EMULATOR_HOST`; Admin SDK cũng dùng emulator cho Auth và Firestore. Client vẫn chỉ gọi Game API.

### AdMob nhận thưởng

1. Client dùng `react-native-google-mobile-ads` với Expo config plugin. Development build mặc định dùng Google sample App IDs và `TestIds.REWARDED`.
2. Trước release, cấu hình `ADMOB_ANDROID_APP_ID`, `ADMOB_IOS_APP_ID` và `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID` trong môi trường build. Không bật cờ quảng cáo backend khi chưa có IDs thật và callback SSV.
3. Tại AdMob, đặt reward item là `moves`, amount là `3`, bật server-side verification và trỏ callback tới `https://asia-southeast1-PROJECT_ID.cloudfunctions.net/gameApi/v1/ads/admob-ssv`.
4. Client tạo ad intent trước khi hiển thị và truyền intent ID làm SSV `customData`. Server xác thực callback và chống ghi thưởng trùng. Chỉ cộng lượt khi SDK báo người chơi nhận thưởng thành công.

`ADMOB_REWARDED_AD_UNITS` chứa giá trị `ad_unit` trong callback SSV, có thể khác định dạng ad unit ID (`ca-app-pub-...`) dùng trong app. Xác nhận giá trị bằng công cụ kiểm tra callback của AdMob.

## Kiểm thử

- `npm --prefix client run typecheck` kiểm tra TypeScript; `npm --prefix client test` kiểm tra engine mới, catalog, EXP, cửa hàng và migration. Fixture Unity cũ được giữ cho kiểm thử save migration.
- `npm run api:test` chạy kiểm thử server hiện có.
- `API_BASE_URL=http://127.0.0.1:5001/PROJECT_ID/asia-southeast1/gameApi npm --prefix server run test:integration` kiểm tra guest, email, EXP 0 sao, retry, mua cạnh tranh hai thiết bị, gộp ví khách một lần và từ chối truy cập Firestore trực tiếp.
- Trên thiết bị thật, kiểm tra vùng an toàn màn hình, vuốt/chọn ô, save sau khi đóng app, offline → online và rewarded ad test trên Android 9+ 3 GB RAM/iOS 16.4+.

Trước deploy, cấu hình IAM tối thiểu cho tài khoản chạy Functions, giữ rules Firestore/Storage từ chối truy cập client, thiết lập TTL cho `authThrottle.expiresAt` và `adIntents.ttlAt`, rồi theo dõi lỗi 5xx, đồng bộ và SSV. Backend production và AdMob IDs thật chưa được cấu hình trong workspace.


## Nội dung phiên bản 2

Catalog gốc: content/game-content.json. Luật EXP, cảnh giới, thưởng và giao dịch chung: content/game-domain.ts. Chạy node tools/generate_game_content.mjs để sinh module client/server; start/typecheck/test/build tự chạy bước này. Thêm --check để kiểm tra bản sinh khớp nguồn.

Thắng 0 sao vẫn mở màn. EXP theo sao cao nhất: 3/2/1/0 sao nhận 100/80/60/30% EXP nền; nâng sao chỉ nhận chênh lệch. Trúc Cơ ở 1.500 EXP mở skill thứ hai; cảnh cuối Chân Tiên ở 110.000 EXP. Chỉ số 40 màn là cấu hình thử nghiệm.

Save v2 lưu profile đã xác nhận, outbox offline và snapshot. Migration v1 giữ sao, tính thưởng một lần, bắt đầu lại bàn theo luật mới. API mới: GET /v2/bootstrap, GET /v2/profile, POST /v2/profile/sync. Server giữ receipt cho mỗi ID; giá và thưởng do server tính. Giao dịch offline bị từ chối được hòa giải về profile server; bộ trang bị màn đang chơi vẫn cố định.

Chạy integration với project demo:

    firebase emulators:exec --project demo-kiem-khai --only functions,auth,firestore 'API_BASE_URL=http://127.0.0.1:5001/demo-kiem-khai/asia-southeast1/gameApi npm --prefix server run test:integration'

Cần OpenJDK 21 trong PATH và JAVA_HOME phù hợp.
