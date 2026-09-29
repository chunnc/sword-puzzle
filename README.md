# Kiếm Khai Tiên Lộ — prototype client và backend

Game ghép 3 tu tiên cho iOS/Android. [GAME_CONCEPT.md](GAME_CONCEPT.md) mô tả gameplay và art style; [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) mô tả ranh giới client–server và API.

## Trạng thái hiện tại

- `client/`: Unity 6.3 LTS, bản thử nghiệm **3 màn** (khám phá, chiến đấu, boss), bàn ghép 7×7, bản đồ/đột phá Trúc Cơ, lưu màn đang chơi và đồng bộ qua HTTPS.
- `server/`: Firebase Functions v2 với Auth sau API, Firestore tiến trình, API quảng cáo và xác thực AdMob SSV.
- `firestore.rules` và `storage.rules`: từ chối mọi truy cập trực tiếp từ mobile/web client.
- UI dùng ba ảnh gốc tạo bởi Codex cùng bộ PNG do `tools/generate_ui_assets.py` xuất ra. `assets/ui-preview.png` chỉ là tài liệu tham chiếu, không được dùng làm sprite giao diện. Chạy `python3 tools/generate_ui_assets.py` sau khi chỉnh mã tạo asset; cần Pillow 11+.

## Chạy client trong Unity

1. Mở thư mục `client/` bằng **Unity 6000.3.0f1 (Apple Silicon)**. Trên Mac Apple Silicon cần cài Rosetta 2 để Editor chạy. Build Android cần Android Build Support (gồm SDK, NDK, OpenJDK); build iOS cần iOS Build Support, Xcode và CocoaPods.
2. Scene `Assets/Scenes/Main.unity` và `Assets/Resources/GamePanel.asset` đã được tạo. Mở scene này rồi bấm **Play** để vào bản đồ Tiên Lộ. Menu **Kiếm Khai → Validate 3 Levels** kiểm tra cấu hình và bàn cờ; **Kiếm Khai → Preview** cho xem riêng từng giao diện khi đang Play mà không thay save.
3. Client chơi offline ngay cả khi chưa cấu hình backend. Để kết nối, thay `YOUR_PROJECT` trong `client/Assets/Resources/api-url.txt` bằng Firebase project ID. URL cần trỏ tới HTTP Function `gameApi` tại `asia-southeast1`.
4. Sau khi kết nối, dùng nút **Tài khoản** để tạo hoặc đăng nhập tài khoản email/mật khẩu. Mật khẩu là mật khẩu game, không phải mật khẩu hộp thư. Bản đầu không xác minh email và không có luồng quên mật khẩu.

Client không chứa Firebase client SDK cho Auth, Firestore hoặc Storage. Token Firebase Auth chỉ được dùng làm bearer token đối với Game API; phiên được lưu trong iOS Keychain / Android Keystore. Khi chạy trong Unity Editor, phiên dùng PlayerPrefs để tiện thử nghiệm.

## Chạy backend

1. Tạo một Firebase project ở vùng Singapore (`asia-southeast1`). Bật Authentication **Anonymous** và **Email/Password**, tạo Firestore và Cloud Storage. Chọn project bằng `firebase use --add` tại thư mục gốc.
2. `cd server && npm install`. Tạo `server/.env` từ `server/.env.example` và điền Firebase Web API key cùng hai `ad_unit` dạng số mà AdMob gửi trong SSV callback.
3. `npm run api:test` ở thư mục gốc chạy unit test và biên dịch. `npm run api:serve` chạy Firebase Emulator Suite; cần JDK trong `PATH` (máy này có JDK 21 ở `/opt/homebrew/opt/openjdk@21/bin`). Dùng project `demo-...` cho thử nghiệm cục bộ. HTTP Function trong emulator có URL dạng `http://127.0.0.1:5001/PROJECT_ID/asia-southeast1/gameApi`.
4. Khi cấu hình sản phẩm thật, chạy `npm run api:deploy` từ thư mục gốc. Cấu hình `gameConfig/current` trong Firestore với `rewardedAdsEnabled: false` lúc đầu; chỉ chuyển thành `true` sau khi AdMob SSV đã sẵn sàng. Có thể đặt `minClientVersion`.

API gọi Firebase Auth REST qua backend. Khi chạy Emulator Suite, API tự dùng Auth Emulator qua `FIREBASE_AUTH_EMULATOR_HOST`; Admin SDK cũng dùng emulator cho Auth và Firestore. Client vẫn chỉ gọi Game API, kể cả khi thử nghiệm.

### AdMob nhận thưởng

1. `client/Packages/manifest.json` ghim Google Mobile Ads Unity Plugin **11.5.0** qua OpenUPM. Khi package import xong, `ProjectBootstrap` tạo cấu hình **app ID mẫu** của Google (`ca-app-pub-3940256099942544~3347511713` cho Android, `ca-app-pub-3940256099942544~1458002511` cho iOS). Có thể xem hoặc thay tại **Assets → Google Mobile Ads → Settings**.
2. Hai file `client/Assets/Resources/admob-ios-id.txt` và `admob-android-id.txt` chứa **rewarded ad unit ID mẫu** của Google. `SWORD_ADMOB` đã bật cho Editor/Standalone sau khi package import sạch; bật thêm cho Android và iOS khi chuyển sang kiểm tra build mobile.
3. Tại AdMob, đặt reward item là `moves`, amount là `3`, bật server-side verification và trỏ callback tới `https://asia-southeast1-PROJECT_ID.cloudfunctions.net/gameApi/v1/ads/admob-ssv`.
4. Dùng **test ads** trước khi bật `rewardedAdsEnabled`. Client cho thêm lượt ngay khi SDK báo hoàn thành; backend xác thực callback SSV và ghi một giao dịch duy nhất. Thay cả app ID và ad unit ID mẫu bằng ID thật trước khi phát hành; chưa bật cờ server khi chưa có cấu hình SSV thật.

`ADMOB_REWARDED_AD_UNITS` chứa các **giá trị `ad_unit` trong callback SSV**, có thể khác định dạng ad unit ID (`ca-app-pub-...`) dùng bởi Unity SDK. Xác nhận giá trị bằng công cụ kiểm tra callback của AdMob trước khi bật quảng cáo thật.

## Kiểm thử cần chạy trước phát hành

- Unity Editor: menu **Kiếm Khai → Validate 3 Levels**, sau đó chơi lần lượt màn 1 → 2 → 3 → Đột Phá; kiểm tra cả tỉ lệ 9:16 và màn hình dọc dài.
- Firebase Emulator: chạy `API_BASE_URL=http://127.0.0.1:5001/PROJECT_ID/asia-southeast1/gameApi npm --prefix server run test:integration` để thử tài khoản khách → liên kết email → đăng nhập lại → khôi phục tiến trình.
- Thiết bị iOS/Android: kiểm tra vùng an toàn màn hình, chạm ô, lưu sau khi tắt app, mất mạng/khôi phục mạng, và callback quảng cáo chậm hoặc lặp.
- Trước deploy: cấu hình IAM tối thiểu cho tài khoản chạy Functions, giữ quy tắc Firestore/Storage từ chối truy cập client, thiết lập TTL cho `authThrottle.expiresAt` và `adIntents.ttlAt`, theo dõi lỗi 5xx, đồng bộ và SSV.

Firebase Emulator đã xác nhận luồng tài khoản khách, liên kết/đăng nhập email, làm mới phiên, gộp tiến trình và từ chối client truy cập Firestore trực tiếp ở bản thiết lập ban đầu. Unity 6000.3.0f1 Apple Silicon đã import project cùng Google Mobile Ads 11.5.0 và Unity UI 2.0.0. Bản UI ba màn dùng cùng backend nhưng chưa triển khai lên Firebase vì project ID, cấu hình Firebase/AdMob và quyền truy cập chưa có trong workspace.
