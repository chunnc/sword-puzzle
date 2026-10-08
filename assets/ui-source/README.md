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

## Gameplay: thông tin màn và thanh kiếm thuật

Bốn sprite được tạo riêng bằng công cụ ImageGen tích hợp, tham chiếu trực
tiếp `slot-sword.png`, `slot-skill.png` và `shop-dialog.png`. Bộ mới dùng ngọc
xanh tối trơn, ánh sáng trên trái, viền vàng mảnh và góc vát gọn; không có
hoa văn mây cuộn, đá đính hoặc chi tiết trang trí lớn.

- [Nút back](runtime/gameplay-back.png) · [prompt](runtime/gameplay-back.prompt.txt)
- [Panel mục tiêu/HP](runtime/gameplay-objective.png) · [prompt](runtime/gameplay-objective.prompt.txt)
- [Khung lượt](runtime/gameplay-moves.png) · [prompt](runtime/gameplay-moves.prompt.txt)
- [Thanh trang bị](runtime/gameplay-dock.png) · [prompt](runtime/gameplay-dock.prompt.txt)

PNG gốc có alpha trong suốt. Ngoài mũi tên của nút back, các sprite không
chứa chữ, số hay icon cố định; client dựng dữ liệu màn, HP, bảo kiếm và
kỹ năng bằng các lớp riêng. Nút Hủy/Thi triển tái sử dụng panel mục tiêu
để giữ viền gọn ở cả trạng thái thường và vô hiệu hóa.

`generate_ui_assets.py` chỉ trim alpha, resize và xuất WebP quality 90, giữ
alpha: back tối đa 256 px, khung lượt 512 px, hai panel rộng tối đa 1200 px.
Bốn WebP trong `client/app-assets/ui/gameplay_*.webp` có tổng dung lượng
146.596 byte (khoảng 143 KiB). `runtime-preview-gameplay.png` là contact sheet.
Ảnh review native và kiểm tra alpha nằm trong `assets/ui-review/gameplay-v1/`.

## Gameplay v2: panel bo mềm và thanh native

Hai sprite v2 được tạo riêng bằng ImageGen tích hợp, dùng socket bảo kiếm và
kỹ năng hiện có làm tham chiếu vật liệu/màu. Panel mới có góc bo liên tục,
viền vàng mảnh, lòng ngọc tối, ánh sáng trên trái; không còn cạnh vát nhọn,
chữ, số hoặc icon cố định.

- [Panel mục tiêu/HP v2](runtime/gameplay-objective-v2.png) · [prompt](runtime/gameplay-objective-v2.prompt.txt)
- [Khung lượt v2](runtime/gameplay-moves-v2.png) · [prompt](runtime/gameplay-moves-v2.prompt.txt)

PNG gốc giữ nguyên alpha do ImageGen tạo. Pipeline đo vùng alpha ≥128 để
bỏ khoảng glow ngoài, trim với đệm 2 px, resize tối đa 1200/512 px và xuất
WebP quality 90 giữ alpha. Xuất qua file tạm rồi rename để Metro không đọc
file đang viết dở. Registry `gameplayObjective`/`gameplayMoves` dùng WebP v2;
bản v1 được giữ để đối chiếu. `runtime-preview-gameplay-v2.png` là contact sheet.

Gameplay bỏ nền dock. Hủy/Thi triển dùng Pressable 64×44 và 156×44, giữ vùng
thao tác 44 px khi trống. HP và Kiếm khí dùng View/Reanimated/Expo
LinearGradient, không dùng sprite thanh. Avatar lấy vùng đầu artwork boss
hiện có; tên nằm trên HP có số bên trong, đúng hai hàng. Ảnh native và số
đo bàn cờ nằm tại `assets/ui-review/gameplay-v2/`.

## Gameplay v3: panel mây góc và nút bằng sprite

Hai panel v3 dùng đúng hai PNG người dùng đính kèm và chọn trong hội thoại,
giữ nguyên phần hoa văn mây vàng ở góc dưới phải. Chúng được tạo bằng
ImageGen tích hợp từ panel v2; bản tinh chỉnh hoa văn không được sử dụng.

- [Panel mục tiêu/boss v3](runtime/gameplay-objective-v3.png) · [prompt](runtime/gameplay-objective-v3.prompt.txt)
- [Panel Lượt v3](runtime/gameplay-moves-v3.png) · [prompt](runtime/gameplay-moves-v3.prompt.txt)
- [Nút Hủy](runtime/gameplay-cancel.png) · [prompt](runtime/gameplay-cancel.prompt.txt) · [prompt tinh chỉnh tỷ lệ](runtime/gameplay-cancel.refine.prompt.txt)
- [Nút Thi triển](runtime/gameplay-cast.png) · [prompt](runtime/gameplay-cast.prompt.txt) · [prompt tinh chỉnh tỷ lệ](runtime/gameplay-cast.refine.prompt.txt)

Hai nút được tạo riêng bằng ImageGen tích hợp, tham chiếu panel v2 và bộ
socket, sau đó chỉnh tỷ lệ để phù hợp với nút nhỏ. Ảnh không có chữ, số,
icon hoặc giá khí. Client đặt ảnh với `contentFit="contain"` trong vùng
nhấn 64×44/156×44, chữ và giá khí nằm trên ảnh. Pressable không vẽ nền
hoặc viền; trạng thái nhấn và disabled giữ nguyên.

Pipeline chỉ trim khoảng alpha ngoài, resize và xuất WebP quality 90 giữ
alpha; ảnh mục tiêu tối đa 1200 px, Lượt/Hủy 512 px, Thi triển 1000 px.
Nguồn PNG được giữ nguyên. `runtime-preview-gameplay-v3.png` là contact
sheet; ảnh native và xác minh nguồn được lưu tại `assets/ui-review/gameplay-v3/`.
Phần HP có đệm bên phải để không đè hoa văn, section vẫn cao 76/66 px.

## Popup kết thúc màn

Bốn sprite mới được tạo riêng bằng ImageGen tích hợp: panel ngọc tối, nút
Tiếp tục/Chơi lại, nút Quay về và sao vàng năm cánh. Viền vàng mảnh, hoa văn
mây ít, highlight trên trái và ánh sáng gọn giữ cùng artstyle gameplay v3.
Hai nút được tinh chỉnh thêm để giảm hoa văn; nhãn dựng bằng code.

- [Panel](runtime/gameplay-result-panel.png) · [prompt](runtime/gameplay-result-panel.prompt.txt)
- [Nút chính](runtime/gameplay-result-continue.png) · [prompt](runtime/gameplay-result-continue.prompt.txt) · [tinh chỉnh](runtime/gameplay-result-continue.refine.prompt.txt)
- [Nút Quay về](runtime/gameplay-result-back.png) · [prompt](runtime/gameplay-result-back.prompt.txt) · [tinh chỉnh](runtime/gameplay-result-back.refine.prompt.txt)
- [Sao vàng](runtime/gameplay-result-star.png) · [prompt](runtime/gameplay-result-star.prompt.txt)

Sao chưa đạt dùng chính ảnh sao vàng mới áp grayscale bằng Skia ColorMatrix,
giữ nguyên alpha, hình dáng và chi tiết. Không dùng sprite sao xám cũ trong
popup. Saturation và zoom thay đổi lần lượt cho từng sao đạt được.

Pipeline chỉ trim alpha, resize và xuất WebP quality 90: panel tối đa 1000 px,
hai nút 512 px, sao 256 px. Bốn WebP runtime tổng khoảng 199 KiB; bản PNG giữ
nguyên alpha ImageGen. `runtime-preview-gameplay-result.png` là contact sheet.
Ảnh native bốn viewport, video/GIF animation và kiểm tra giữ nguyên save
nằm trong [gameplay-result-v1](../ui-review/gameplay-result-v1/README.md).

## Gameplay dialog v2: tái sử dụng panel và nút

Popup thắng/thua và xác nhận quay về hiện dùng `inventory_dialog.webp` có
kích thước runtime 800×671. Component chung lấy tỷ lệ từ metadata ảnh,
giới hạn rộng 360 px và dùng `contain` để giữ nguyên hình dáng khung.
Padding và khoảng cách nội dung được thu gọn theo kích thước panel.

Popup kết quả dùng lại `button_primary.webp` và `button_secondary.webp`
của dialog quay về: nút vàng chữ tối cho Tiếp tục/Chơi lại, nút ngọc chữ
ngà cho Quay về. Hàng nút rộng 92% vùng nội dung, ảnh cao 42 px, vùng nhấn
44 px. Dialog quay về giữ hai nút xếp dọc, kích thước nút hiện tại.

Không generate ảnh mới. Sao vàng, grayscale và animation giữ nguyên;
panel/nút ImageGen của bản v1 được lưu làm tham chiếu lịch sử. Ảnh native
bốn viewport và xác nhận giữ nguyên save nằm trong
[gameplay-dialog-v2](../ui-review/gameplay-dialog-v2/README.md).

## Gameplay dialog v3: nút kết quả xếp dọc, đúng tỷ lệ ảnh

Popup thắng/thua đặt Tiếp tục/Chơi lại trên Quay về. Hai ảnh nút lấy tỷ lệ
riêng từ metadata runtime: vàng 1400×363, ngọc 1400×356. Chiều cao tính từ
chiều rộng, dùng `contain`, không kéo ảnh vào chiều cao cố định hoặc scale
nút khi nhấn; phản hồi nhấn dùng opacity.

Nút rộng tối đa 184 px, hoặc 168 px khi panel nhỏ hơn 350 px; vùng nhấn
tối thiểu 44 px. Màn nhỏ dùng canvas sao 56 px và khoảng cách gọn để nội
dung vừa panel inventory đúng tỷ lệ. Animation và màu grayscale/vàng giữ
nguyên. Ảnh native bốn viewport nằm trong
[gameplay-dialog-v3](../ui-review/gameplay-dialog-v3/README.md).

## Back dialog v4: nút quay về dùng chung tỷ lệ

Dialog xác nhận rời màn hiện dùng chung `GameplayDialogButton` với popup
thắng/thua. Hai ảnh nút dùng `contain`, lấy tỷ lệ riêng từ metadata và tính
chiều cao từ chiều rộng; vùng nhấn tối thiểu 44 px, phản hồi nhấn bằng opacity.
Nút rộng 168/184 px theo chiều rộng panel, giữ nhãn và thao tác hiện tại.
Ảnh native bốn viewport và trạng thái khóa nằm trong
[gameplay-back-v4](../ui-review/gameplay-back-v4/README.md).

## Hai dialog panel ngang và metadata tỉ lệ

Hai ảnh được tạo bằng ImageGen tích hợp với `runtime/dialog-panel.png` làm
tham khảo. Asset 1 (`runtime/dialog-panel-wide.png`) là lượt tạo đầu tiên;
asset 2 (`runtime/dialog-panel-4x3.png`) là lượt chỉnh tỷ lệ. Cả hai giữ nền
ngọc xanh đậm, viền vàng kép, góc bo, đỉnh nhô giữa cạnh trên và mây bốn góc.
Prompt từng ảnh được lưu trong file `.prompt.txt` cùng tên; ảnh không có chữ
hoặc nút.

| Asset | Canvas PNG nguồn | Khung nguồn nhìn thấy (alpha ≥16) | Canvas WebP runtime | Tỉ lệ runtime |
| --- | --- | --- | --- | --- |
| `dialogPanelWide` — asset 1 | 1448×1086 (4:3) | 1386×928 (≈1.494:1) | 1200×808 | ≈1.485:1 |
| `dialogPanel4x3` — asset 2 | 1452×1089 (4:3) | 1381×1052 (≈1.313:1) | 1200×900 | 4:3 |

Canvas nguồn của asset 1 có khoảng trong suốt trên/dưới, vì vậy tỉ lệ khung
nhìn thấy gần 3:2. Pipeline trim theo alpha ≥16 với đệm 8 px, resize đồng
đều và xuất `client/app-assets/ui/dialog_panel_wide.webp` quality 90, giữ
alpha. Asset 2 giữ pipeline canvas cố định 1200×900 và file
`client/app-assets/ui/dialog_panel_4x3.webp` hiện tại.

`client/app-assets/ui/dialog_panels.metadata.json` được pipeline ghi tự
động khi xuất một trong hai panel. Mỗi entry có `source` và `runtime`, mỗi
phần lưu `width`, `height`, `aspectRatio` cùng `visible` (vị trí, kích thước,
tỉ lệ vùng alpha ≥16). Canvas và khung nhìn thấy được ghi riêng để không
nhầm khoảng trong suốt với hình vẽ. Asset registry export
`DIALOG_PANEL_METADATA`, app dùng `runtime.aspectRatio` để tính layout.

`ConnectionDialog` chỉ dùng `dialogPanelWide` cho mode `network`, với
`contain`, rộng tối đa 380 px và lề màn hình 24 px. Tiêu đề 16/20 px,
thông báo 13/18 px, nhãn nút 12 px; vùng bấm giữ tối thiểu 176×48 px.
Vùng chữ cách trên/trái/phải 20 px, chừa 80 px dưới. Nút căn giữa và neo
trong panel, cách đáy 20 px, độc lập với độ dài thông báo. Chờ xác nhận,
xác thực và các dialog khác giữ panel hiện tại.

Review mới nằm trong [connection-panel-wide](../ui-review/connection-panel-wide/README.md).
[connection-panel-4x3](../ui-review/connection-panel-4x3/README.md) giữ ảnh
review của bố cục 4:3 trước đây.
