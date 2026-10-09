# Hạt lấp lánh quanh ô 4/5

Hạt đã được tăng kích thước và tốc độ 1,5 lần: bán kính 4,5% ô, tối đa 2,4 px; một vòng 1,6 giây. Xem [thông số và preview hiện tại](../charged-tile-particles-boost/README.md). Phần dưới và các ảnh/video trong thư mục này ghi lại phiên bản trước khi tăng.

Đã bỏ nền kem vàng. Tất cả ô dùng nền xanh xám `#53696B`, khung giữ `#33494C`. Ô 4/5 có một hạt sáng với lõi trắng, quầng nhẹ và bốn chấm đuôi nhỏ mờ dần, chạy theo chiều kim đồng hồ trên đường vuông bo góc ở bên trong mép ô. Một vòng 2,4 giây, tốc độ đều cả trên cạnh lẫn góc. Cấp 4/5 dùng cùng hiệu ứng, phân biệt bằng ảnh biểu tượng hiện có. Ô thường và đá chắn không có hạt.

Màu theo hệ: hỏa `#FF765B`, kiếm `#FFE08A`, lôi `#D79CFF`, linh khí `#87F7A7`. Màu, kích thước, độ bo góc, chu kỳ và khoảng cách đuôi nằm trong cấu hình giao diện. Không thêm asset runtime, không thay ảnh tile hoặc padding.

## Chuyển động và vòng đời

Skia vẽ hạt trên ảnh, dưới phong ấn. Hạt thuộc lớp tile nên dùng cùng transform/opacity trong swap, fall, clear; mảnh chém dùng lại cùng đồng hồ qua lớp cắt. Dấu chọn và mục tiêu vẫn ở trên hiệu ứng.

Một đồng hồ Reanimated trên UI thread phục vụ cả bàn cờ. Pha lệch cố định theo hệ; thay đổi HUD hoặc pha hành động không reset đồng hồ. Đồng hồ dừng khi không còn tile/mảnh có hạt hiển thị, màn hình mất focus, ứng dụng xuống nền hoặc Reduce Motion bật. Reduce Motion giữ hạt cùng đuôi đứng yên ở góc trên phải, không nhấp sáng. Không đổi API công khai, engine, luật chơi hoặc dữ liệu lưu.

## Preview native

- [Video hai vòng chạy, 4,8 giây](orbit-native.mp4).
- [Các khung hình ở 0,4 / 1,2 / 2,0 / 2,8 giây](motion-frames.png): cắt từ video, không sửa màu hay vị trí hạt.
- [So sánh trước/sau](comparison.png) và [hai kích thước](review.png).
- [320×568](native-320x568.png), [390×844](native-390x844.png): đủ 12 biến thể, có phong ấn và đá chắn.
- [49 ô nâng cấp](dense-320x568.png), [Reduce Motion](reduced-motion-320x568.png), [chọn kiếm cấp 4](selected-320x568.png).
- [Sau chuỗi hiệu ứng](after-effects-320x568.png).
- [Thông tin capture](capture-manifest.json), [native smoke](native-smoke.json), [xác nhận Reduce Motion](reduce-motion.json).

Chụp/quay từ GameScreen và Skia thật trên iPhone 16e Simulator / iOS 26.3, scale 3. Viewport nhỏ chạy trong cùng simulator rồi cắt 960×1704 px. Video giữ phần đầu 4,8 giây của bản quay native bằng AVFoundation, không chỉnh tốc độ. Ảnh lớn có nút nổi của Expo development client ở HUD lượt đi. Fixture chỉ nằm trong bộ nhớ, không gọi backend hoặc ghi save. Đã dừng Metro, đóng ứng dụng và khôi phục entrypoint, renderer cùng cấu hình sau khi chụp.

## Kiểm tra

- TypeScript: **pass**.
- Jest: **28 suites, 467 tests pass**.
- Helper: bốn cạnh theo chiều kim đồng hồ, tốc độ đều qua góc, nối vòng mượt, đuôi ngắn và giảm dần, quầng hạt nằm trong ô ở các kích thước 20/38/48/70 px, vị trí đứng yên của Reduce Motion.
- Renderer: đủ bốn hệ × hai cấp; bỏ nền kem; ảnh và padding giữ nguyên; một đồng hồ dùng chung cả mảnh chém; nâng/hạ cấp thêm/bỏ hạt ngay; hạt cùng transform/opacity với tile; tile đã ẩn không còn hạt; HUD/chuyển pha không reset; focus/AppState/Reduce Motion/unmount dừng đồng hồ; mảnh chém còn hiển thị tiếp tục dùng đồng hồ đến khi biến mất.
- Native: hạt chạy với chu kỳ 2,4 giây; Reduce Motion dừng đồng hồ, pha không đổi qua 700 ms. Duyệt màn nhỏ/lớn, bàn 49 ô nâng cấp và dấu chọn/phong ấn.
- Native smoke: lượt **24 → 23**, điểm **0 → 840**; swap, slash, cross, spirit, fire, lightning, fall và trở về idle. Hạt nằm đúng dưới các lớp phủ và theo các tile nâng cấp còn lại sau khi rơi.
- Log chỉ có cảnh báo deprecation `SkPath` có sẵn; không ghi nhận lỗi runtime mới.
