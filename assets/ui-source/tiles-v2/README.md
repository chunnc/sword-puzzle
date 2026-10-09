# Bộ tile bàn cờ V2

Bộ 12 sprite được tạo riêng bằng **ImageGen tích hợp** cho game kiếm hiệp / tu tiên và **đã tích hợp vào game** theo loại ô cùng `chargeTier` thường/4/5. Đá chắn giữ hình và kích thước cũ.

## Quy tắc thiết kế

- Ô thường (`base`): nền màu bo góc, **không có khung hoặc viền**.
- Ô 4: **một viền đơn màu vàng**, góc trơn.
- Ô 5: **cùng kiểu viền đơn như ô 4**, không thêm viền, điểm nhấn góc hoặc tăng độ sáng; khác nhau ở biểu tượng bên trong.
- Không có chữ, số, phù chú hoặc hoa văn trang trí trên sprite. Hỏa là ngọn lửa trực tiếp; linh khí là khối năng lượng xoáy.
- Đồng bộ hướng sáng phía trên trái, dáng nền vuông bo góc, tỷ lệ canvas và khoảng đệm.

| Hệ / tên file | Nền | Thường | Ô 4 | Ô 5 |
| --- | --- | --- | --- | --- |
| Hỏa / `tile-fire` | Đỏ | Một ngọn lửa | Lửa ba chóp lớn | Cụm lửa rộng năm chóp |
| Kiếm / `tile-sword` | Vàng | Một thanh kiếm | Kiếm với vệt kiếm khí | Hai kiếm giao nhau |
| Lôi / `tile-lightning` | Tím | Một tia sét | Sét phân thành hai nhánh phía dưới | Ba tia tỏa ra từ tâm |
| Linh khí / `tile-spirit-orb` | Xanh lá | Khối khí xoáy | Xoáy khí với một vòng ngoài | Xoáy khí với hai vòng giao nhau |

`spirit-orb` được giữ làm tên hệ cho phù hợp quy ước hiện có; nội dung hình là linh khí dạng khí xoáy, không phải viên cầu vật chất.

## File bàn giao

- **12 PNG RGBA 512×512**: `tile-{fire|sword|lightning|spirit-orb}-{base|4|5}.png`.
- **12 WebP RGBA 512×512**: cùng tên, đuôi `.webp`, quality 90, method 6, giữ alpha.
- **12 prompt**: cùng tên, đuôi `.prompt.txt`; chứa prompt cuối cùng đã dùng, gồm chỉ dẫn ảnh tham chiếu khi có.
- [Ảnh tổng hợp 4 hàng × 3 cột](preview.png): thứ tự cột Thường / Ô 4 / Ô 5.
- [Ảnh duyệt 40–50 px và bàn cờ mẫu](preview-small.png): các ô được thu về đúng 40 hoặc 50 pixel, dùng WebP cuối cùng. Đây là ảnh kiểm tra độc lập, không phải ảnh chụp game đã tích hợp.
- [Nguồn tạo và thông số xuất](generation.json): đường dẫn ảnh ImageGen gốc, prompt, ảnh tham chiếu và vùng crop từng sprite.
- [Kết quả kiểm tra file](validation.json): kích thước, chế độ màu, alpha và dung lượng từng file.

Ảnh ImageGen gốc được giữ nguyên tại đường dẫn ghi trong `generation.json`. Bản xuất chỉ chuẩn hóa vùng canvas: lấy bounds alpha từ 128 trở lên để nhận diện silhouette chính, giữ thêm 4 px xung quanh, resize về 450×450 rồi đặt giữa canvas trong suốt 512×512 tại (31, 31). Giữ alpha của phần ảnh được xuất; không vẽ lại biểu tượng hoặc khung bằng mã. PNG là bản xuất đầy đủ chất lượng; WebP là bản nén để có thể dùng về sau.

Tổng dung lượng 12 WebP: khoảng **419 KiB**.

## Kiểm tra đã thực hiện

- Đủ 12 PNG, 12 WebP và 12 prompt.
- Tất cả sprite có kích thước 512×512 và mode RGBA.
- Alpha PNG và WebP giống nhau hoàn toàn; có vùng alpha 0 và vùng alpha 255.
- Dải ngoài ít nhất 30 px ở cả bốn cạnh hoàn toàn trong suốt, không cắt vào hình.
- Duyệt trực quan ảnh tổng hợp, mẫu alpha nền sáng và các ô ở 40/50 px trên nền bàn cờ tối.
- Ô thường không có viền; ô 4/5 dùng cùng kiểu viền đơn. Các biểu tượng từng cấp khác nhau.
- Đã tạo lại lôi cấp 4 để phân nhánh rõ, thay cho bản đầu còn giống tia sét thường.

## Tích hợp runtime

PNG được đồng bộ vào `assets/ui-source/runtime/`: tên ô thường bỏ hậu tố `-base`, ô nâng cấp giữ hậu tố `-4` và `-5`. Pipeline `tools/generate_ui_assets.py` xuất WebP tương ứng vào `client/app-assets/ui/`, giữ alpha và quality 90. Các đường dẫn cụ thể nằm trong `generation.json`; ảnh tổng hợp runtime bao gồm đủ 12 biến thể.

`tileArtwork(kind, chargeTier = 0)` trả về hình đúng loại/cấp. Các nơi chỉ truyền loại ô, như icon mục tiêu thu thập, vẫn nhận hình thường. Bàn cờ nạp trước cả 12 hình và dùng cùng cách chọn hình cho chuyển động, hiệu ứng chém và các mảnh tile.

Renderer giảm khoảng đệm ảnh từ 6% xuống 3% mỗi cạnh, tức canvas ảnh chiếm 94% ô thay vì 88%; khoảng đệm alpha 31 px trong file 512×512 vẫn được giữ. Đá chắn tiếp tục dùng padding 6%. Không vẽ đè chữ `氣` hoặc số cấp `✧4`/`✦5`; giữ phong ấn, dấu chọn và nhãn accessibility. Không đổi vùng bấm, khoảng cách ô, luật chơi hoặc dữ liệu lưu.

Ảnh `preview.png` và `preview-small.png` phía trên là bản duyệt asset trước tích hợp; nhãn “chưa tích hợp” trên ảnh chỉ mô tả thời điểm tạo preview.

Kiểm tra tích hợp: TypeScript pass, 27 suites / 453 tests pass, duyệt native tại 320×568 và 390×844; đã phát thành công chuỗi đổi chỗ kiếm nâng cấp, chém ngang/dọc, linh khí, lửa, lôi và rơi ô. [Ảnh và kết quả native](../../ui-review/tiles-v2/README.md).
