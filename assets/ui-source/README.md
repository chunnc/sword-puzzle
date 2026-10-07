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

## HUD hai tiền tệ và khung trang bị

Header `hud-tray-v2` và bộ sáu sprite `icon-linh-thach`, `icon-tien-ngoc`,
`slot-sword`, `slot-skill`, `slot-skill-empty`, `slot-skill-locked` được tạo
riêng bằng ImageGen tích hợp, có nền ngoài trong suốt. PNG gốc và prompt đầy
đủ nằm trong `runtime/`; bản WebP trong `client/app-assets/ui/`.

Bộ sáu sprite được làm mới: Linh Thạch là một đĩa ngọc xanh, Tiên Ngọc là
một đĩa ngọc tím sáng, cùng đường xoắn ngà lớn đi vào tâm đặc và mép bo có
độ dày nhẹ. Không có đế, cụm nhiều viên hoặc khung kim loại quanh tiền.
Tham chiếu từ ngọc và bộ HUD hiện có giữ chất liệu ngọc nổi mềm, cách vẽ 2D
và ánh sáng phía trên trái. Tiên Ngọc dùng thêm đĩa Linh Thạch mới để đồng
bộ hình dáng. Header tham chiếu HUD, khung avatar và vòng kỹ năng.

Ô kiếm vuông góc vát có viền vàng mảnh; ô kỹ năng tròn có viền ngọc mảnh.
Bỏ họa tiết mây cuộn, dây chạm, đá đính và chi tiết viền phụ trên cả bốn
khung; lòng ngọc tối trơn để icon trang bị nổi rõ. Ô rỗng có dấu cộng nhỏ
chìm, ô khóa có khóa gọn và màu trầm, cùng hình dáng với khung kỹ năng thường.

Header không chứa chữ, số hoặc icon cố định; client dựng các thành phần
động trong chiều cao 72 px. Khung thường có lòng ngọc tối trống, client đặt
icon kiếm/kỹ năng vào một lớp riêng. Số dư Tiên Ngọc hiện là placeholder `0`;
không có thay đổi schema hoặc tích hợp nạp trong bản UI này.

Pipeline xuất header rộng tối đa 1600 px, icon và khung 512×512, WebP quality
90 và giữ alpha. Khung chiếm khoảng 96% canvas; icon tiền khoảng 80%.
Khi đo footprint, pipeline bỏ qua điểm alpha dưới 8 và chừa 4 px quanh
vùng thấy rõ; alpha còn lại giữ nguyên để tránh lệch tâm do điểm mờ rời rạc.
`runtime-preview-hud-v2.png` là contact sheet để duyệt bộ ảnh mới.

## Túi Đồ

Bộ sáu sprite ban đầu được tạo riêng bằng công cụ ImageGen tích hợp, dùng
`hud-tray-v2.png` và `slot-sword.png` làm tham chiếu chất liệu: nền card,
tab thường/chọn, nút trang bị thường/vô hiệu hóa và panel chọn ô. Tông ngọc
xanh và vàng ấm, viền thanh với đầu hoa văn mây gọn; không có chữ trong ảnh.
Các nút ngọc tối dùng nhãn ngà để giữ độ tương phản ở kích thước nhỏ.

PNG gốc cùng prompt của các sprite ImageGen nằm trong
`runtime/inventory-*.png` và `runtime/inventory-*.prompt.txt`. Tab idle hiện
được tạo trực tiếp từ `inventory-tab-active.png`: giảm sáng RGB 30%, giữ
nguyên alpha, canvas, hoa văn và vị trí mọi chi tiết. Công thức chính xác
ghi trong `runtime/inventory-tab-idle.recipe.txt`; ảnh active giữ nguyên.
Hai tab dùng cùng crop/resize nên khớp hình dáng ở cả hai trạng thái.
Bản dùng trong
game là `client/app-assets/ui/inventory_*.webp`, quality 90, giữ alpha; tổng
dung lượng sáu WebP khoảng 127 KiB. `generate_ui_assets.py` chỉ trim alpha,
resize và chuyển định dạng, không vẽ lại nội dung asset. Kích thước tối đa:
card 1200 px, tab 640 px, nút 352 px, panel 800 px.

`runtime-preview-inventory.png` là contact sheet của sáu sprite. Các ảnh
native của bản đầu nằm trong `assets/ui-review/inventory-v1/`; bản đồng bộ
hai tab và bỏ khung vuông quanh kiếm được review trong
`assets/ui-review/inventory-v2/`. Icon kiếm nằm trực tiếp trên card, giữ
vùng bố trí 56×56 và ảnh 48×48; khung tròn của kiếm thuật giữ nguyên.

## Cửa Hàng hai cột

Năm sprite được tạo riêng bằng công cụ ImageGen tích hợp, tham chiếu card,
dialog và HUD hiện có. Bộ mới dùng ngọc xanh tối, viền vàng mảnh, điểm sáng
trên trái và hoa văn mây nhỏ ở góc; không chứa chữ hoặc icon vật phẩm.

- [Nền card](runtime/shop-card.png) · [prompt](runtime/shop-card.prompt.txt)
- [Panel chi tiết](runtime/shop-dialog.png) · [prompt](runtime/shop-dialog.prompt.txt)
- [Nút mua](runtime/shop-button.png) · [prompt](runtime/shop-button.prompt.txt)
- [Nút mua vô hiệu hóa](runtime/shop-button-disabled.png) · [prompt](runtime/shop-button-disabled.prompt.txt)
- [Nút đóng](runtime/shop-close-button.png) · [prompt](runtime/shop-close-button.prompt.txt)

Nút vô hiệu hóa được tạo từ nút mua để giữ hình dáng và bố cục viền. PNG
gốc và prompt giữ nguyên trong `runtime/`. Pipeline chỉ trim alpha, resize
và xuất năm WebP quality 90 vào `client/app-assets/ui/shop_*.webp`, giữ nền
ngoài trong suốt; tổng khoảng 206 KiB. Card có cạnh dài tối đa 800 px,
panel và nút tối đa 1000 px. Bản runtime không chứa nhãn cố định.

`runtime-preview-shop.png` là contact sheet duyệt năm sprite. Cửa Hàng dùng
lại tab và bộ icon từng vật phẩm của Túi Đồ. Ảnh review native ở ba viewport,
popup và trạng thái cuộn nằm trong `assets/ui-review/shop-v1/`.

## Nút X và panel Cửa Hàng thu gọn

[Nút X](runtime/shop-close-icon.png) được tạo bằng ImageGen tích hợp, dùng
nút ngọc thứ cấp và panel mua làm tham chiếu. Ảnh có dấu X màu ngà rõ ở
kích thước nhỏ, nền ngọc xanh, viền vàng mảnh, hoa văn mây gọn và nền ngoài
trong suốt. [Prompt đầy đủ](runtime/shop-close-icon.prompt.txt) lưu cạnh PNG gốc.

Pipeline trim alpha, resize cạnh dài tối đa 256 px và xuất
`client/app-assets/ui/shop_close_icon.webp` quality 90, giữ alpha. Runtime
hiển thị ảnh 32×32 trong vùng nhấn 44×44 ở góc trên phải. Panel bỏ nút Đóng
phía dưới, dòng giá riêng và note mở khóa; nút mua dựng chữ “Mua”, giá và
icon Linh Thạch bằng code. Panel không còn vùng cuộn và dùng safe-area có
sẵn của màn hình để giữ kích thước ổn định khi mở.

Ảnh native và số đo layout từ lần đầu đến sau 500 ms được lưu tại
`assets/ui-review/shop-panel-v2/`.
