# Nguồn ảnh UI của bản thử nghiệm 3 màn

Ba ảnh gốc `world.png`, `beast.png` và `cultivator.png` được tạo bằng ImageGen. Script `tools/generate_ui_assets.py` dùng chúng để tạo background, ảnh nhân vật và avatar. Từng sprite UI trong `runtime/` được tạo riêng bằng Codex ImageGen, dùng `assets/ui-preview.png` cùng crop của component tương ứng làm input để khớp trực tiếp với mockup. Script trim alpha, resize và xuất WebP vào `client/app-assets/ui/`, đồng thời dựng contact sheet review; không vẽ nội dung sprite. `panel-base.png` được lưu với tên runtime `panel.webp`; tên còn lại đổi dấu gạch nối thành dấu gạch dưới. Không sử dụng `assets/ui-preview.png` trong game.

Prompt 1 (`world.png`): Reusable full-bleed portrait xianxia game background; floating jade mountains, ivory clouds, ornate East Asian celestial gate, waterfalls and stone terraces; quiet overlay areas; no character, monster, UI or text.

Prompt 2 (`beast.png`): Transparent cutout of one friendly but imposing white celestial fox-lion yêu thú, jade and gold ornaments, restrained coral fire aura, clear silhouette; no ground, UI or text.

Prompt 3 (`cultivator.png`): Transparent cutout of a young sword cultivator in white jade robes, seated in meditation around a glowing turquoise sword with celestial ribbons; no platform, UI or text.

All four view backgrounds reuse the one world painting. The same beast appears in battle and boss screens; the portrait avatar is cropped from the same cultivator image.

Các sprite trong `runtime/` không chứa chữ; app vẫn dựng nhãn và số động. Bốn
ảnh `runtime-preview-*.png` là contact sheet để duyệt bề mặt, icon, ô ghép và lớp
phủ. Script giữ tên asset hiện có để không đổi tham chiếu trong client.

## Linh Châu

`runtime/tile-spirit-orb.png` được tạo bằng công cụ ImageGen tích hợp. Bản dùng
trong game là `client/app-assets/ui/tile_spirit_orb.webp`, 512×512, giữ alpha,
WebP quality 90. Bàn cờ Skia dựng chữ `氣` riêng để rõ ở kích thước nhỏ.

Prompt: Create one production-ready sprite for a xianxia match-three mobile game,
square composition. A luminous spherical jade-green spirit orb with a mint-white
inner energy core, subtle swirling qi, glossy highlights and a clear silhouette.
Center it inside a dark teal rounded-square tile with polished gold and cyan
metallic edging, matching a richly illustrated fantasy mobile game tile set.
The frame has a narrow gold inset rim, glossy dark blue-teal glass interior,
beveled cyan outer edge, restrained highlights from the upper left. The orb is
unmistakably round, rich emerald-jade green rather than blue, with elegant
swirling magical energy. Front-facing, balanced composition, readable at 40–50
pixels. One tile only, genuinely transparent background outside the frame, no
text, numbers, lettering, watermark or extra objects. Keep the whole frame
inside the image with roughly 6% transparent margin on all sides; the tile
occupies about 88% of the square canvas. No ground shadow or background scene.

## Cửa hàng

`runtime/icon-shop.png` được tạo bằng công cụ ImageGen tích hợp sau khi xem trực
tiếp các icon `icon-map.png`, `icon-person.png` và `icon-bag.png`. Quầy hàng mái
cong dùng cùng tông ngà, vàng và ngọc xanh, khối nổi mềm, ánh sáng từ phía trên
bên trái và nền trong suốt. Prompt đầy đủ lưu tại `runtime/icon-shop.prompt.txt`.
Bản dùng trong game là `client/app-assets/ui/icon_shop.webp`, 512×512, giữ alpha,
WebP quality 90. Contact sheet icon dùng cửa hàng ở vị trí trước đây của hoa sen.

## Icon trang Nhân Vật

18 sprite được tạo riêng bằng công cụ ImageGen tích hợp: `icon-sword-*` cho
tám bảo kiếm, `icon-skill-*` cho tám kiếm thuật, cùng `icon-slot-locked` và
`icon-slot-empty`. PNG gốc và prompt đầy đủ của từng ảnh lưu trong `runtime/`.
Không có chữ trên sprite; tên trang bị chỉ dùng trong nhãn accessibility.

Ba ảnh tham chiếu style là `icon-map.png`, `icon-jade.png` và `icon-shop.png`:
ngọc xanh, ngà và kim loại vàng, họa tiết mây tiết chế, ánh sáng phía trên trái.
Thanh Phong, Nhất Kiếm và ô khóa được tạo trước; các ảnh sau dùng thêm sprite
tương ứng đó làm tham chiếu để giữ đồng bộ giữa các biến thể. Màu kiếm lấy từ
catalog; kiếm thuật thể hiện đúng hình tượng của từng hiệu ứng.

`generate_ui_assets.py` chỉ cắt alpha, cân kích thước vào 80% canvas và xuất
WebP 512×512 quality 90, giữ alpha. 18 ảnh runtime có tổng dung lượng khoảng
865 KiB. `runtime-preview-character-icons.png` là contact sheet riêng của bộ
icon; toàn bộ sprite cũng đã được duyệt ở kích thước hiển thị khoảng 60 px
cạnh các icon gốc.
