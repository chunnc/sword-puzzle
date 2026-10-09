# Nền lưới sáng hơn và nền riêng cho ô 4/5

Nền kem của ô 4/5 đã được thay bằng hạt lấp lánh chạy quanh ô. Xem [bản kiểm tra hiện tại](../charged-tile-particles/README.md) và [video native](../charged-tile-particles/orbit-native.mp4). Các ảnh trong thư mục này giữ lại để đối chiếu.

Đã áp dụng ba màu trong cấu hình giao diện: khung bàn `#33494C`, nền ô thường `#53696B`, nền ô nâng cấp `#C4B580`. Cả cấp 4 và cấp 5 dùng nền kem vàng dưới ảnh tile. Giữ nguyên 12 asset, padding 3%, viền trong ảnh, vùng bấm và luật chơi; đá chắn dùng nền thường và padding 6% như trước.

Nền nâng cấp được vẽ trong cùng lớp artwork nên đi cùng tile khi đổi chỗ, rơi, thu nhỏ hoặc mờ đi. Mảnh tile trong hiệu ứng chém dùng lại artwork này. Nền ô thường vẫn nằm cố định trên bàn, không để lại nền kem vàng ở vị trí cũ. Phong ấn, dấu chọn và mục tiêu tiếp tục nằm trên ảnh.

## Ảnh duyệt

- [So sánh trước/sau](comparison.png): cắt từ hai ảnh native ở cùng viewport, không sửa màu.
- [Hai kích thước màn hình](review.png).
- [320×568](native-320x568.png) và [390×844](native-390x844.png): đủ 12 biến thể, phong ấn và đá chắn.
- [Chọn kiếm cấp 4](selected-320x568.png).
- [Sau đổi chỗ và chuỗi hiệu ứng](after-effects-320x568.png).
- [Thông tin capture và bảng màu](capture-manifest.json).

Chụp từ `GameScreen` và renderer Skia thật trên iPhone 16e Simulator / iOS 26.3, scale 3. Viewport nhỏ chạy trong cùng simulator rồi cắt đúng 960×1704 px. Ảnh lớn có nút nổi của Expo development client ở HUD lượt đi. Dữ liệu kiểm thử chỉ nằm trong bộ nhớ, không gọi backend hoặc ghi save; đã dừng Metro, đóng ứng dụng kiểm thử và khôi phục các entrypoint cùng cấu hình sau khi chụp.

## Kết quả

- TypeScript: **pass**.
- Jest: **27 suites, 456 tests pass**.
- Renderer kiểm tra nền của đủ 12 loại/cấp ở hai kích thước bàn, đá chắn, cập nhật nền khi đổi cấp, nền cùng transform khi swap/fall, cùng opacity khi clear, nền trong các mảnh chém và loại bỏ nền của tile đã xóa. Các lớp phong ấn, dấu chọn, accessibility và padding vẫn được kiểm tra.
- [Native smoke](native-smoke.json): đổi chỗ kiếm cấp 4/5; lượt **24 → 23**, điểm **0 → 840**; có swap, slash, cross, spirit, fire, lightning, fall và trở về idle.
- Duyệt hai màn hình: nền xanh xám dịu hơn, nền kem vàng nhận diện rõ ô nâng cấp của cả bốn hệ; viền không bị cắt, phong ấn và dấu chọn vẫn đọc được. Sau chuỗi rơi, nền nâng cấp nằm đúng dưới các tile nâng cấp còn lại.
