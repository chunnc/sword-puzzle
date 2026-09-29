# Nguồn ảnh UI của bản thử nghiệm 3 màn

Ba PNG trong thư mục này được tạo bằng công cụ ImageGen tích hợp của Codex. Các file ảnh trong `client/Assets/Resources/UI/` là asset runtime được tạo từ ba ảnh này và mã `tools/generate_ui_assets.py`. Không sử dụng `assets/ui-preview.png` trong game.

Prompt 1 (`world.png`): Reusable full-bleed portrait xianxia game background; floating jade mountains, ivory clouds, ornate East Asian celestial gate, waterfalls and stone terraces; quiet overlay areas; no character, monster, UI or text.

Prompt 2 (`beast.png`): Transparent cutout of one friendly but imposing white celestial fox-lion yêu thú, jade and gold ornaments, restrained coral fire aura, clear silhouette; no ground, UI or text.

Prompt 3 (`cultivator.png`): Transparent cutout of a young sword cultivator in white jade robes, seated in meditation around a glowing turquoise sword with celestial ribbons; no platform, UI or text.

All four view backgrounds reuse the one world painting. The same beast appears in battle and boss screens; the portrait avatar is cropped from the same cultivator image.
