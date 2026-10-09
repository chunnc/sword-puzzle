# Tích hợp animation ô Lửa 5

Asset nguồn, hướng dẫn tái xuất và preview sạch nằm trong [job tile-fire-5-idle-20261009](../../animation-source/tile-fire-5-idle-20261009/README.md).

Thay riêng tile Fire cấp 5 bằng 24 frame trong 1 giây, lặp liên tục. Đã giữ nền đỏ/viền vàng và xóa nền chroma bằng xử lý cục bộ; không có yêu cầu dịch vụ trả phí bổ sung. Ảnh tĩnh là frame đầu của cùng animation.

Người dùng đã tự kiểm tra trên Simulator và yêu cầu dừng phần kiểm tra native bổ sung. Không coi ảnh capture ban đầu trong thư mục này là kết quả nghiệm thu native cuối cùng.

Kiểm tra cuối: TypeScript pass; Jest 29 suites / 474 tests pass. Atlas runtime khớp byte với bản sạch; metadata trỏ đúng tên atlas; ảnh tĩnh WebP khớp alpha và mọi pixel hiển thị của frame đầu; 24 kết quả Feyn gốc khớp SHA-256 đã lưu. Script tái xuất đã chạy lại và cho cùng export `6c1649cef56d`.
