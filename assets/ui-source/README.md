# Nguồn ảnh UI của bản thử nghiệm 3 màn

Ba ảnh gốc `world.png`, `beast.png` và `cultivator.png` được tạo bằng ImageGen. Script `tools/generate_ui_assets.py` dùng chúng để tạo background, ảnh nhân vật và avatar. Từng sprite UI trong `runtime/` được tạo riêng bằng Codex ImageGen, dùng `assets/ui-preview.png` cùng crop của component tương ứng làm input để khớp trực tiếp với mockup. Script chỉ trim alpha, resize/copy asset sang `client/Assets/Resources/UI/` và dựng contact sheet review; không vẽ nội dung sprite. `panel-base.png` được lưu với tên runtime `panel.png`; tên còn lại đổi dấu gạch nối thành dấu gạch dưới. Không sử dụng `assets/ui-preview.png` trong game.

Prompt 1 (`world.png`): Reusable full-bleed portrait xianxia game background; floating jade mountains, ivory clouds, ornate East Asian celestial gate, waterfalls and stone terraces; quiet overlay areas; no character, monster, UI or text.

Prompt 2 (`beast.png`): Transparent cutout of one friendly but imposing white celestial fox-lion yêu thú, jade and gold ornaments, restrained coral fire aura, clear silhouette; no ground, UI or text.

Prompt 3 (`cultivator.png`): Transparent cutout of a young sword cultivator in white jade robes, seated in meditation around a glowing turquoise sword with celestial ribbons; no platform, UI or text.

All four view backgrounds reuse the one world painting. The same beast appears in battle and boss screens; the portrait avatar is cropped from the same cultivator image.

Các sprite trong `runtime/` không chứa chữ; Unity vẫn dựng nhãn và số động. Bốn
ảnh `runtime-preview-*.png` là contact sheet để duyệt bề mặt, icon, ô ghép và lớp
phủ. Script giữ tên resource hiện có để không đổi tham chiếu hoặc `.meta` của Unity.
