# Dialog lỗi kết nối máy chủ 4:3

Đây là review lịch sử của bố cục 4:3. Dialog hiện tại dùng asset 1 ngang;
xem [connection-panel-wide](../connection-panel-wide/README.md).

Panel mới được tạo bằng ImageGen tích hợp với panel dọc hiện tại làm ảnh
tham khảo. PNG nguồn và hai prompt nằm trong `assets/ui-source/runtime/`;
WebP runtime có canvas 1200×900, quality 90, giữ alpha và tỷ lệ hình vẽ.
Chỉ lỗi “KẾT NỐI MÁY CHỦ” dùng ảnh mới; chờ xác nhận và đăng nhập lại giữ
panel dọc. Tiêu đề, thông báo, Retry và spinner giữ hành vi hiện tại.

## Review native

12 ảnh chụp từ Expo development app trên iPhone 16e, iOS 26.3, 3×. Mỗi
viewport 320×568, 360×640 và 390×844 có bốn trạng thái: idle, retrying,
failed và success. Ảnh được crop theo viewport, không resize hoặc vẽ lại;
`review.png` là ảnh so sánh thu nhỏ của ba viewport idle. Bánh răng nổi
thuộc Expo development client.

Fixture dùng `ConnectionDialog`, Modal, Retry và artwork production, giới
hạn kích thước vùng backdrop trong native Modal để kiểm tra màn nhỏ. Mỗi
lần retry gọi callback thật của nút với action giả lập cục bộ: promise chờ,
lỗi hoặc kết nối thành công. Không gọi máy chủ hoặc đọc/ghi tiến trình.
OCR xác nhận tiêu đề và nút Retry trước khi lưu từng ảnh; trạng thái success
xác nhận dialog đã đóng. `capture-manifest.json` ghi nhận từng trường hợp.

`layout-stability.json` so sánh RGB chính xác trên bốn dải viền rộng 24 px
của mỗi panel native. Cả sáu so sánh retrying/failed với idle đều giống hệt,
xác nhận khung giữ nguyên vị trí và kích thước ở ba viewport.

Các fixture và giới hạn viewport tạm thời được gỡ sau review. Hash của bốn
file AsyncStorage trước/sau khớp. Kiểm thử hồi quy xác nhận chỉ mode
network dùng ảnh 4:3, giữ nội dung khi đóng và giữ ổn định qua polling,
retry thất bại/thành công. TypeScript và hai suite liên quan (13 tests) pass
trên source production sau khi gỡ fixture.

[So sánh ba viewport](review.png) · [Manifest](capture-manifest.json)
