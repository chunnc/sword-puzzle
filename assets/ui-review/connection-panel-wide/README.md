# Dialog lỗi kết nối máy chủ dùng asset 1

Dialog dùng ảnh `dialog_panel_wide.webp` 1200×808 (≈1.485:1), bản đầu tiên
được tạo bằng ImageGen. Bản 4:3 vẫn được lưu riêng. PNG nguồn, prompt và
metadata tỉ lệ của cả hai ảnh nằm trong thư mục asset hiện tại; metadata
phân biệt canvas với khung nhìn thấy theo alpha ≥16.

Tiêu đề 16/20 px, thông báo 13/18 px, nhãn nút 12 px. Nút Retry căn giữa,
neo trong panel với `bottom: 20`, giữ vùng bấm 176×48 px. Vùng chữ có lề
trên/trái/phải 20 px và chừa 80 px phía dưới. Chỉ mode network đổi layout.

## Review native

12 ảnh chụp từ Expo development app trên iPhone 16e, iOS 26.3, 3×. Mỗi
viewport 320×568, 360×640 và 390×844 có bốn trạng thái: idle, retrying,
failed và success. Ảnh được crop theo viewport, không resize hoặc vẽ lại.
`review.png` là ảnh so sánh thu nhỏ. Bánh răng nổi thuộc Expo dev client.

Fixture dùng Modal, panel và callback Retry production với action giả lập
cục bộ; không gọi máy chủ hoặc ghi tiến trình. Native `onLayout` ghi kích
thước panel, vùng chữ, tiêu đề, thông báo, footer và vùng bấm. OCR xác nhận
tiêu đề/nút trước khi lưu ảnh và xác nhận dialog đã đóng khi thành công.

`capture-manifest.json` ghi từng trường hợp cùng hình học native. Khoảng
cách nút tới đáy là 20 px, sai số tối đa một physical pixel do làm tròn
native. Cả ba viewport giữ vùng bấm ít nhất 176×48 px, tỉ lệ đúng theo
metadata, chữ nằm trong vùng nội dung và không chồng footer.
`layout-stability.json` xác nhận hình học không đổi giữa idle, retrying và
failed ở cả ba viewport. Hash của bốn file AsyncStorage trước/sau khớp.

Fixture, callback đo và giới hạn viewport tạm thời đã được gỡ sau review.
TypeScript và hai suite ConnectionDialog/BootAndConnection (14 tests) pass
trên source production sau khi gỡ fixture.

[So sánh ba viewport](review.png) · [Manifest](capture-manifest.json) · [Layout](layout-stability.json)
