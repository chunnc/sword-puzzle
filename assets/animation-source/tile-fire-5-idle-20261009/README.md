# Tile Lửa 5 — animation lặp

Job: `tile-fire-5-idle-20261009`. Video nguồn 544×544, 24 fps, dài 1,041667 giây; lấy 24 snapshot ở các mốc 0 đến 23/24 giây. Playback 1.000 ms, lặp liên tục.

## Bản dùng trong game

- [Spritesheet sạch](local-chroma/exports/6c1649cef56d/sheet.png): RGBA 1560×1040, 6 cột × 4 hàng. Mỗi frame 256×256, padding 2 px mỗi cạnh.
- [Metadata](local-chroma/exports/6c1649cef56d/animation.json), [preview lặp](local-chroma/exports/6c1649cef56d/preview.webp), [24 PNG trong ZIP](local-chroma/exports/6c1649cef56d/snapshots-png.zip).
- [Nền tối](local-chroma/exports/6c1649cef56d/contact-dark.png), [nền sáng](local-chroma/exports/6c1649cef56d/contact-light.png), [kiểm tra alpha/cấu trúc](local-chroma/exports/6c1649cef56d/validation.json).

Chỉ xóa vùng xanh nối với mép canvas. Alpha chuyển mềm theo `B − max(R,G)` trong khoảng 20–100; khử màu xanh ở pixel chuyển tiếp. Nền đỏ, viền vàng và lửa bên trong giữ alpha 255. Cả chuỗi dùng crop toàn canvas 544×544 và pivot (272,272), không căn lại từng frame. Dao động nhỏ của hình nguồn được giữ nguyên.

## Tái xuất cục bộ

Từ thư mục gốc dự án:

```sh
python3 assets/animation-source/tile-fire-5-idle-20261009/build_chroma_export.py
```

Script dùng Pillow và helper đóng gói của skill. Không gọi Feyn, Grok hay ImageGen. Script tạo bản xuất theo hash nội dung trong `local-chroma/exports/`, đồng bộ atlas/metadata vào `client/app-assets/ui/`, và cập nhật ảnh tĩnh Lửa 5 từ frame đầu vào nguồn runtime cùng WebP client. Khi nội dung xuất thay đổi, dùng đường dẫn export mới mà script in ra.

Video gốc, snapshot gốc, request ID và toàn bộ 24 kết quả Feyn được giữ. Bản Feyn tại `exports/c6558e6952ed/` là bản nháp có vài vùng nền đỏ bán trong suốt và mép xanh; không dùng bản đó trong game. Manifest giữ nguyên kết quả kiểm tra Feyn không đạt và trỏ `latest_export` tới bản sạch được xử lý cục bộ theo yêu cầu người dùng.

## Renderer và kiểm tra

Skia Atlas thay riêng ô Fire cấp 5. Một đồng hồ Reanimated phục vụ tất cả ô Lửa 5 và các mảnh chém; dùng rectangle/thời lượng từng frame từ metadata. Không cập nhật React state theo từng frame. Giữ lớp chuyển động, opacity, phong ấn, dấu chọn và hạt sáng hiện có.

Đồng hồ dừng khi không còn tile/mảnh Lửa 5 hiển thị, atlas chưa tải, màn hình mất focus, ứng dụng chạy nền hoặc Reduce Motion bật. Reduce Motion giữ frame đầu; fallback là ảnh tĩnh Lửa 5 mới. `tileArtwork()` tiếp tục trả về một ảnh tĩnh.

Kiểm tra tự động: timeline đủ 24 frame, ranh giới và nối vòng, atlas/padding, alpha nền đỏ, nâng/hạ cấp, fallback, chia sẻ clock qua HUD/swap/fall/mảnh chém, AppState/focus/Reduce Motion/unmount và mất ô cuối cùng. Người dùng đã tự kiểm tra Simulator và yêu cầu bỏ bước duyệt native tiếp theo.
