# Hạt lớn và nhanh hơn 1,5 lần

Đã tăng bán kính hạt từ 3% lên **4,5% kích thước ô**, giới hạn từ 1,6 lên **2,4 px**. Lõi sáng, quầng và bốn chấm đuôi tăng theo. Chu kỳ giảm từ 2,4 xuống **1,6 giây/vòng**. Màu, chiều chạy, khoảng cách đuôi, độ lấp lánh và cách phân biệt cấp 4/5 giữ nguyên.

Đường chạy cách mép ít nhất 8% kích thước ô và không nhỏ hơn bán kính quầng sáng, giúp hạt lớn hơn vẫn nằm trong ô. Renderer và helper dùng chung phép tính bán kính cùng tỉ lệ quầng 2,2. Giữ đồng hồ chung, chuyển động theo tile, mảnh chém và Reduce Motion; không thay API hoặc asset của hiệu ứng này.

## Kiểm tra

- TypeScript: **pass**.
- Jest: **29 suites, 474 tests pass** trên workspace hiện tại.
- Bản commit riêng cho particle, không kèm animation lửa cấp 5: TypeScript **pass**, **28 suites, 468 tests pass** trong bản sao kiểm tra độc lập.
- Cập nhật test bán kính tăng đúng 50%, chu kỳ 1,6 giây, bước đồng hồ mới và giới hạn quầng ở ô 20/38/48/70 px. Test đường chạy, đuôi hạt, lifecycle, renderer và chuyển động tiếp tục qua.
- Đã mở native ở viewport 320×568, 390×844 và bàn 49 ô nâng cấp. [Đồng hồ native](native-clock.json) tăng xấp xỉ một phần tư vòng trong 400 ms, phù hợp chu kỳ 1,6 giây.
- Người dùng đã duyệt trực tiếp trên simulator và yêu cầu bỏ các bước duyệt tiếp theo. Không thực hiện thêm capture hoặc QA simulator sau yêu cầu này.

## Preview đã lưu

- [Video native khoảng 4 giây](orbit-native.mp4).
- [320×568](native-320x568.png), [390×844](native-390x844.png), [49 ô nâng cấp](dense-320x568.png).
- [Thông tin capture và thông số](capture-manifest.json).

Các preview trên đã được chụp/quay trước khi người dùng yêu cầu dừng bước simulator. Dùng GameScreen và Skia thật trên iPhone 16e Simulator / iOS 26.3, scale 3; ảnh nhỏ được cắt đúng viewport. Fixture chỉ nằm trong bộ nhớ, không gọi backend hoặc ghi save. Đã dừng Metro và khôi phục source/config, gỡ toàn bộ harness tạm.
