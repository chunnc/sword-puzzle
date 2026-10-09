# Kiểm tra tile V2 trong game

Hiển thị ô nâng cấp đã được cập nhật sau đợt kiểm tra này. Xem [bản hiện tại: hạt lớn hơn chạy quanh ô 4/5 trong 1,6 giây](../charged-tile-particles-boost/README.md). Đợt [nền xanh xám và nền kem vàng](../board-grid-colors/README.md) giữ lại để đối chiếu.

Đã tích hợp 12 hình thường/4/5, giảm padding ảnh từ 6% xuống 3% mỗi cạnh, bỏ chữ linh khí và số cấp vẽ đè. Ô thường không viền; ô 4/5 cùng kiểu viền đơn. Đá chắn, vùng bấm, khoảng cách ô, luật chơi và dữ liệu lưu giữ nguyên.

## Ảnh native

- [Tổng hợp hai kích thước](review.png).
- [320×568](native-320x568.png) và [390×844](native-390x844.png): đầy đủ 12 biến thể, có phong ấn và đá chắn.
- [Ô đang chọn ở 320×568](selected-320x568.png).
- [Bàn cờ sau chuỗi hiệu ứng ở 320×568](after-effects-320x568.png).
- [Thông tin capture](capture-manifest.json).

Ảnh được chụp từ `GameScreen` và renderer Skia thực trên iPhone 16e Simulator / iOS 26.3, scale 3. Kích thước nhỏ được kiểm tra bằng viewport cố định trong cùng simulator, không đổi thiết bị. Screenshot lớn có nút nổi của Expo development client ở vùng lượt đi.

Dữ liệu catalog và ván chơi kiểm thử chỉ nằm trong bộ nhớ. Harness tạm dùng engine/presenter thật để chạy chuyển động và hiệu ứng, không gọi backend hoặc ghi session/save. Sau khi chụp ảnh, đã dừng Metro và khôi phục toàn bộ entrypoint, route, renderer cùng cấu hình TypeScript; không giữ harness trong ứng dụng.

## Kết quả kiểm tra

- `npm --prefix client run typecheck`: **pass**.
- `npm --prefix client test`: **27 suites, 453 tests pass**.
- Test renderer kiểm tra 12 biến thể bằng ID ảnh riêng biệt, padding ở hai kích thước bàn, đổi hình khi nâng cấp, hình trong mảnh kiếm chém, loại bỏ nhãn đè và giữ phong ấn/accessibility.
- [Asset validation](asset-validation.json): 12 PNG runtime giống bản đã duyệt; WebP đều RGBA 512×512 và giữ alpha giống PNG.
- [Native smoke](native-smoke.json): đổi chỗ kiếm cấp 4/5, lượt từ 24 xuống 23 và điểm từ 0 lên 840. Chuỗi thực tế có swap, slash, cross, spirit, fire, lightning, fall và trở về idle.
- Duyệt ảnh màn nhỏ/lớn: nền hệ và biểu tượng rõ, viền nguyên vẹn, phong ấn và dấu chọn hiển thị đúng.

Các cảnh báo native ghi nhận chỉ là cảnh báo deprecation có sẵn của các phương thức `SkPath` trong hiệu ứng, không có lỗi runtime mới.
