# Kiếm Khai Tiên Lộ — React Native client và backend

Game ghép 3 tu tiên cho iOS/Android. [GAME_CONCEPT.md](GAME_CONCEPT.md) mô tả gameplay và art style; [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) mô tả ranh giới client–server và API.

## Trạng thái hiện tại

- `client/`: Expo SDK 57, React Native 0.86, TypeScript; catalog hiện có hai map hướng dẫn, engine ghép ô và animation hàng đợi; EXP/10 cảnh giới, 8 skill, 8 bảo kiếm, cửa hàng xác nhận qua server, tài khoản khách và HTTPS.
- `server/`: Firebase Functions v2 với Auth sau API, profile/EXP/ví/túi đồ, giao dịch chống lặp, API quảng cáo và AdMob SSV.
- `firestore.rules` và `storage.rules`: từ chối mọi truy cập trực tiếp từ mobile/web client.
- UI tái sử dụng art hiện có, xuất thành WebP tối ưu bởi `tools/generate_ui_assets.py`. Chạy script sau khi chỉnh nguồn ảnh; cần Pillow 11+. `assets/ui-preview.png` chỉ là tài liệu tham chiếu, không được dùng làm sprite giao diện.

## Chạy client trên iOS/Android

Yêu cầu Node.js 22.13+, Expo development build, Android Studio/Android SDK cho Android và Xcode 26.4+ cho iOS. Expo Go không hỗ trợ AdMob và các thư viện native của game.

1. Trong `client/`, tạo `.env` từ `.env.example`. App kết nối tới `gameApi` trong Firebase project `sword-puzzle` tại `asia-southeast1`.
2. Chạy `npm install`.
3. Chạy `npm run android` hoặc `npm run ios` để sinh native project theo Expo Prebuild, build và cài development app lên thiết bị/simulator.
4. Sau khi cài development app, chạy `npm start` để mở Metro và nạp client.

App cần internet và dữ liệu server trước khi mở game. Mỗi lần khởi động mới hiện scene Chơi/Lưu tiến trình; quay lại từ background giữ màn đang mở. Lần đầu tự tạo hồ sơ khách; các lần sau dùng lại session. Chỉ vào bản đồ khi bấm Chơi hoặc hoàn tất auth từ scene mở đầu. Health check chỉ chạy lúc mở app và khi bấm Thử lại; mọi request client có timeout 12 giây, server có timeout chung 10 giây. API timeout (kể cả HTTP 504) hoặc lỗi mạng lập tức hiện dialog chặn thao tác; nút Thử lại chỉ đóng dialog sau khi kiểm tra kết nối và phục hồi hồ sơ/thao tác chờ hoàn tất. Quay lại app từ nền không tự ping server. Email/mật khẩu là tài khoản game; bản thử nghiệm chưa có xác minh email hoặc khôi phục mật khẩu.

Client không chứa Firebase Auth/Firestore SDK. Token chỉ được dùng làm bearer token tới Game API; session lưu trong iOS Keychain/Android Keystore, còn profile, ví, trang bị và tiến trình được lưu trên server. Journal cục bộ v4 giữ bàn đang chơi và request chờ xác nhận, có bản dự phòng. Save map trước content v8 bị bỏ qua; session đăng nhập lưu độc lập. API trả 401 sẽ refresh token chung; nếu refresh bị từ chối, thử khôi phục cùng UID bằng khóa thiết bị rồi gửi lại request một lần. Đăng nhập là tùy chọn.

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

- `npm --prefix client run typecheck` kiểm tra TypeScript; `npm --prefix client test` kiểm tra engine, map tutorial, catalog, EXP, cửa hàng, journal và refresh token.
- `npm run api:test` chạy kiểm thử server hiện có.
- Năng lượng dùng hồ sơ server: khởi đầu 5, mỗi lượt thua/bỏ cuộc mất một, hồi một sau 30 phút. Khi phát hành, deploy Functions trước client 1.9.0; cập nhật `gameConfig/current.minClientVersion` lên `1.9.0` sau khi client đã sẵn sàng cho người chơi.
- `API_BASE_URL=http://127.0.0.1:5001/PROJECT_ID/asia-southeast1/gameApi npm --prefix server run test:integration` kiểm tra health/catalog, guest/email, EXP 0 sao, retry, objectives, catalog đổi phiên bản, mua cạnh tranh, đổi tài khoản không gộp dữ liệu và từ chối truy cập Firestore trực tiếp.
- Trên thiết bị thật, kiểm tra vùng an toàn màn hình, vuốt/chọn ô, save sau khi đóng app, mất mạng → Retry → tiếp tục cùng bàn và rewarded ad test trên Android 9+ 3 GB RAM/iOS 16.4+.

Trước deploy, cấu hình IAM tối thiểu cho tài khoản chạy Functions, giữ rules Firestore/Storage từ chối truy cập client, thiết lập TTL cho `authThrottle.expiresAt` và `adIntents.ttlAt`, rồi theo dõi lỗi 5xx, đồng bộ và SSV. Backend production và AdMob IDs thật chưa được cấu hình trong workspace.


## Catalog map / client 1.8.0 / content v8

Game API cấp cấu hình và tóm tắt chương; từng ván lấy một map đã ghim phiên bản. Catalog local hiện có hai màn hướng dẫn. Layout map được lưu riêng trong `game-maps.json`; cấu hình chung nằm trong `game-config.json`. Schema và versioning: [MAP_AUTHORING.md](content/MAP_AUTHORING.md), [MAP_VERSIONING.md](content/MAP_VERSIONING.md). Schema tài khoản và Firestore: [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Thu hồi trang bị khởi đầu cũ

Nhân vật mới bắt đầu không có kiếm/skill. Thanh Phong và Nhất Kiếm đã ngừng phát hành;
chuẩn hóa hồ sơ loại hai món này khỏi sở hữu và trang bị, không lưu cờ migration.

Xuất bản riêng cấu hình (không ghi map) và thu hồi cho toàn bộ tài khoản:

```sh
node tools/publish_game_config.mjs --project sword-puzzle --firebase-cli
node tools/retire_starter_items.mjs --project sword-puzzle --firebase-cli
```

Hai lệnh mặc định chạy thử; thêm `--apply` để ghi. Triển khai API mới trước khi xuất bản
cấu hình và thu hồi. Script thu hồi cập nhật từng hồ sơ trong transaction, giữ các món
khác, ví và tiến trình; chạy lại không ghi khi hồ sơ đã sạch. Kiểm thử:
`node --test tools/test_retired_starters.mjs`.

## Phiên thiết bị / client 1.8.0

Mở game hiện scene phi kiếm với hai nút Chơi và Lưu tiến trình, vẫn cần internet. Chơi tiếp tục hồ sơ hiện tại mà không bắt buộc đăng nhập. Lưu tiến trình và nút tài khoản trong game mở cùng popup /account: tab Đăng nhập hoặc Tạo tài khoản có xác nhận mật khẩu. Đóng popup trở về màn trước; liên kết cùng hồ sơ trong game giữ màn trước, còn đổi hồ sơ hoặc khôi phục phiên trở về bản đồ. Tạo tài khoản giữ tiến trình khách; đăng nhập tài khoản có sẵn dùng dữ liệu tài khoản đó, không gộp. Khách phải xác nhận nguy cơ mất tiến trình trước khi đổi tài khoản. Mỗi bản cài đặt chỉ dùng một UID; một tài khoản dùng được nhiều máy. Đăng xuất chỉ chuyển máy hiện tại sang khách mới.

Server cấp custom token Firebase có claims bản cài đặt và binding version. Production cần cấp quyền `iam.serviceAccounts.signBlob` cho service account chạy Functions. Phiên 1.2 còn hợp lệ được chuyển sang 1.3 giữ UID; khóa thiết bị chưa tồn tại thì không thể tự khôi phục khách có legacy token đã bị thu hồi. Gỡ app/xóa dữ liệu có thể làm mất khóa khách.

Kiểm thử simulator và fault injection: [ACCEPTANCE_GUEST.md](ACCEPTANCE_GUEST.md). Không bật `EXPO_PUBLIC_ACCEPTANCE_TEST` trong release.

## Map hướng dẫn / client 1.8.0 / content v8

Catalog local được khởi tạo lại với hai map hướng dẫn trong `content/game-maps.json` và cấu hình
chung ở `content/game-config.json`. Map 1 dạy ghép 3 Kiếm trong một nước; map 2 dạy tạo rồi
kích hoạt ô Lôi cấp 4 trong hai nước. Hai map không sinh cascade tự động và đều đạt 3 sao theo
đường giải hướng dẫn. Schema, versioning và cách seed được ghi ở [MAP_AUTHORING.md](content/MAP_AUTHORING.md).

Dọn catalog Firestore và dọn các fixture/cache/report map cũ là các thao tác độc lập. Bản local
này chưa được publish lên Firestore.

## Skill sinh map và publish theo index

Skill [`generate-map`](.agents/skills/generate-map/SKILL.md) sinh layout đa dạng tối đa
**7 cột × 8 hàng**, có 12–40% ô khuyết, rồi dùng engine thật để chọn mục tiêu/HP,
ngân sách lượt và ngưỡng sao. Training và validation độc lập; retry được đo đến
lần thắng đầu và lần đạt 3 sao đầu. Mức trung bình mặc định thắng lần đầu >80% và
đạt 3 sao lần đầu 45–55%.

```sh
npm run maps:generate -- --difficulty medium --objective collect --tiles sword,fire
npm run maps:generate -- --difficulty hard --objective boss --seed 12345
npm run maps:balance -- 3
npm run maps:publish -- 3
```

Đầu ra ở `content/map-seeds/INDEX/`: seed local, snapshot config, report balance và
preview HTML. Map đạt validation được nối vào catalog local; publish dùng project
trong `.firebaserc` và Firebase CLI login, giữ các revision cũ và mở rộng content
version theo từng index. Catalog ban đầu cần được seed trên project trước khi
publish map mới. Tất cả tùy chọn: [generate-map commands](.agents/skills/generate-map/references/commands.md).
