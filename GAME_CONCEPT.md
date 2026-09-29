# Kiếm Khai Tiên Lộ

> **Tài liệu ý tưởng — bản preview 0.1.** Tên game và các thông số trong tài liệu là định hướng để làm nguyên mẫu, chưa phải cam kết cân bằng cuối cùng.

Kiến trúc và hướng dẫn chạy prototype: [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) · [README.md](README.md).

![Ảnh preview gồm bản đồ, màn khám phá, trận boss và đột phá tu vi](assets/ui-preview.png)

## 1. Tầm nhìn

**Kiếm Khai Tiên Lộ** là game giải đố ghép 3 theo màn, lấy cảm hứng từ hành trình kiếm tu. Người chơi ghép các linh vật để phá phong ấn, vượt bí cảnh, đánh yêu thú và đột phá cảnh giới. Trò chơi giữ thao tác đơn giản, nhịp nhanh của dòng casual nhưng tạo bản sắc bằng kiếm khí, pháp thuật và thế giới tu tiên mở dần qua từng chương.

| Thành phần | Định hướng |
| --- | --- |
| Thể loại | Ghép 3, giải đố qua màn, có biến tấu chiến đấu |
| Nền tảng | iOS và Android |
| Màn hình, điều khiển | Dọc; vuốt đổi chỗ hai ô cạnh nhau; chơi thuận tiện bằng một tay |
| Một lượt chơi | Khoảng 1–3 phút |
| Đối tượng | Người thích giải đố casual, hình ảnh tiên hiệp và cảm giác tiến bộ liên tục |
| Mô hình | Miễn phí; quảng cáo nhận thưởng do người chơi chủ động chọn |

### Ba trụ cột thiết kế

1. **Dễ vào, có lựa chọn thú vị:** hiểu luật ghép trong vài giây; quyết định dùng kiếm khí, tạo ô đặc biệt và xử lý chướng ngại đúng lúc.
2. **Tu tiên hiện diện trong gameplay:** mỗi mục tiêu, kỹ năng, màn boss và lần đột phá đều gắn với hành trình kiếm tu, thay vì chỉ đổi hình viên kẹo.
3. **Tiến bộ mà không cày cấp:** vượt màn là nguồn tiến triển chính; tu vi mở cảnh quan và năng lực mới nhưng không thay kỹ năng giải đố của người chơi.

## 2. Vòng chơi chính

1. Chọn màn trên bản đồ Tiên Lộ; xem mục tiêu, số lượt và chướng ngại mới.
2. Vuốt hai ô liền kề để ghép từ ba biểu tượng cùng loại; các ô được xóa, ô mới rơi xuống và có thể tạo chuỗi liên hoàn.
3. Hoàn thành mục tiêu trong số lượt cho phép. Các lượt ghép tích **linh khí**; ghép kiếm tích thêm **kiếm khí** để kích hoạt kỹ năng chém.
4. Nhận sao và phần thưởng, mở màn tiếp theo. Khi kết thúc chương, người chơi trải qua một lần **đột phá tu vi** và bước vào vùng đất mới.

### Bộ ô cơ bản

| Ô ghép | Hình dáng đọc nhanh | Vai trò trong bản đầu |
| --- | --- | --- |
| Kiếm | Lưỡi kiếm xanh bạc | Ô thường; ghép kiếm nạp thêm kiếm khí |
| Hỏa phù | Lá bùa đỏ cam | Ô thường; xuất hiện trong mục tiêu liên quan hỏa ấn |
| Lôi ấn | Tia sét tím | Ô thường; dùng trong một số cơ quan và giáp boss |
| Linh thạch | Viên ngọc lam | Ô thường; có thể là vật phẩm cần thu thập |
| Linh dược | Lá thuốc xanh | Ô thường; có thể là vật phẩm cần thu thập |

Các ô thường tuân cùng một luật ghép để người mới không phải nhớ năm hệ thống khác nhau. Màu **và hình dáng** đều phải khác nhau; không dựa riêng vào màu để nhận diện.

### Ghép đặc biệt và kiếm khí

- **Ghép 3:** xóa các ô cùng loại, hoàn thành một phần mục tiêu và nạp linh khí.
- **Ghép 4:** tạo một ô **Kiếm Trảm**; kích hoạt sẽ xóa một hàng hoặc cột theo hướng hiển thị trên ô.
- **Ghép 5:** tạo **Vạn Kiếm Ấn**; đổi chỗ với một loại ô để xóa tất cả ô cùng loại trên bàn.
- **Thanh kiếm khí:** ghép kiếm và tạo chuỗi liên hoàn nạp nhanh hơn. Khi đầy, người chơi bấm kỹ năng để chọn một hàng cần chém. Đây là một quyết định chủ động, không tự kích hoạt.

Trong nguyên mẫu, chỉ giới thiệu từng cơ chế một. Cân bằng tỉ lệ xuất hiện ô, lượng nạp và sức mạnh kỹ năng sau khi chơi thử.

## 3. Loại màn chơi và độ khó

### Khám phá bí cảnh

Mục tiêu gồm phá phong ấn, mở đường qua đá chắn, thu thập linh thạch hoặc linh dược. Một số màn có cơ quan chỉ mở khi ghép biểu tượng tương ứng ở gần. Bối cảnh kể chuyện qua cổng bí cảnh, trận pháp và vật phẩm tìm được, với rất ít hội thoại.

### Chiến đấu yêu thú

Các lượt ghép gây sát thương vào yêu thú. Kiếm Trảm và kỹ năng kiếm khí tạo khoảnh khắc tấn công mạnh. Yêu thú có thể dựng giáp, đặt phong ấn lên vài ô hoặc thay đổi mục tiêu sau một số lượt; mỗi boss chỉ dùng một cơ chế nổi bật để người chơi đọc được tình huống. Hoàn thành khi máu boss về 0 trước khi hết lượt.

Hai loại màn được xen kẽ gần cân bằng để hành trình không thành chuỗi trận đánh liên tục. Boss đặt ở cuối mỗi chương, với cơ chế đã được giới thiệu ở các màn trước.

### Nhịp tăng độ khó

- Các màn đầu dạy đổi ô, ghép 4–5 và dùng kiếm khí bằng tình huống dễ hiểu.
- Mỗi nhóm màn chỉ giới thiệu một chướng ngại hoặc biến thể mục tiêu mới; các màn sau mới kết hợp chúng.
- Độ khó tăng bằng cách buộc người chơi ưu tiên mục tiêu và dùng ô đặc biệt đúng lúc, không chỉ bằng cách giảm số lượt.
- Khi hết lượt, hiện rõ phần mục tiêu còn thiếu và cho phép thử lại nhanh. Có thể chọn xem quảng cáo nhận thêm một ít lượt, tối đa một lần cho mỗi lần chơi màn.

## 4. Thế giới và hành trình tu vi

**Bản đầu đề xuất: 3 chương, khoảng 60 màn.** Mỗi chương có một cảnh quan, một nhóm chướng ngại và một boss riêng. Tên vùng dưới đây là tên làm việc.

| Chương | Cảnh quan và thử thách | Mốc tu vi |
| --- | --- | --- |
| Vân Hải Tiên Sơn | Sơn môn trên mây; học luật ghép, đá chắn và phong ấn đơn giản | Luyện Khí |
| Huyền Kiếm Bí Cảnh | Di tích kiếm tu; đường khóa, linh thạch và Kiếm Trảm | Đột phá Trúc Cơ |
| Lôi Hỏa Thiên Môn | Cổng trời giữa sấm và hỏa; kết hợp cơ quan, giáp yêu thú | Đột phá Kim Đan |

Mỗi chương có khoảng 20 màn. Bản đồ là đường đi qua các địa danh; người chơi nhìn thấy màn kế tiếp, màn boss và tiến độ chương. Đột phá là phần thưởng cho việc hoàn thành mốc truyện, không đòi hỏi cày tài nguyên ngoài màn. Mốc tu vi mở cảnh quan, hiệu ứng kiếm và một lựa chọn kỹ năng đơn giản; không thêm hệ thống trang bị hoặc chỉ số RPG phức tạp ở bản đầu.

### Phần thưởng và động lực quay lại

- Mỗi màn trao 1–3 sao theo hiệu quả hoàn thành; sao giúp nhìn lại tiến độ nhưng không chặn đường chính.
- Phần thưởng chương gồm tranh cảnh, diện mạo kiếm khí hoặc hiệu ứng kỹ năng. Các vật phẩm hỗ trợ nhận qua chơi game được giới hạn để vẫn giữ trọng tâm giải đố.
- Thử thách hằng ngày, sự kiện và bộ sưu tập pháp bảo là hướng mở rộng sau khi vòng chơi chính được kiểm chứng; chúng không nằm trong phạm vi bản đầu.

## 5. Mô hình miễn phí

Không dùng quảng cáo bắt buộc giữa các màn. Người chơi có thể **chủ động** xem quảng cáo để nhận thêm lượt sau khi thất bại hoặc nhận thêm phần thưởng phụ sau khi thắng. Không đặt mục tiêu buộc người chơi xem quảng cáo để vượt màn thường. Bản đầu chưa cần cửa hàng mua vật phẩm trong ứng dụng; quyết định đó chỉ nên đưa ra sau khi có dữ liệu chơi thử.

## 6. Định hướng hình ảnh và âm thanh

### Art style

Phong cách **2D tiên hiệp huyền ảo tươi sáng**: tiên sơn lơ lửng, mây, cổng trời, động phủ và kiếm khí phát sáng. Màu chủ đạo là ngọc bích, xanh lam, trắng ngà và vàng ấm; đỏ cam dành cho hỏa phù, tím xanh dành cho lôi ấn. Bối cảnh có nét vẽ mềm như tranh, còn ô ghép và nút bấm có đường viền sắc, độ tương phản cao. Tránh cảnh quá tối hoặc hiệu ứng phủ kín bàn cờ.

Nhân vật kiếm tu có trang phục nhẹ, dáng rõ và biểu cảm gần gũi. Yêu thú gây ấn tượng nhưng không quá đáng sợ, phù hợp nhịp chơi casual. Dùng cùng một bộ vật liệu giao diện: khung ngọc tối, viền kim loại vàng nhạt, ánh sáng linh khí và họa tiết mây tiết chế.

### Chuyển động và âm thanh

- Ô ghép phản hồi ngay khi chạm; combo có nhịp tăng dần nhưng thời lượng ngắn để không làm chậm lượt chơi.
- Kiếm Trảm dùng vệt chém dứt khoát; đột phá tu vi có một khoảnh khắc trình diễn nổi bật sau chương.
- Nhạc dùng chất liệu đàn tranh, sáo và bộ gõ nhẹ, thay đổi sắc thái giữa bản đồ, bí cảnh và boss.
- Âm thanh ghép ô phải rõ, vui tai; âm kiếm và sấm có lực nhưng không chói. Có tùy chọn tắt nhạc, hiệu ứng và rung.

## 7. UI mobile và ảnh preview

Bốn màn hình chính là **bản đồ**, **giải đố khám phá**, **đánh boss** và **đột phá tu vi**. Bàn cờ là vùng lớn nhất trên màn gameplay; số lượt, mục tiêu và thanh kỹ năng luôn nhìn được mà không che ô. Nút chính đủ lớn để chạm bằng ngón tay. Giao diện cần thích ứng vùng an toàn của các máy iOS và Android, cùng các tỉ lệ màn hình dọc phổ biến.

Ảnh đầu tài liệu là **mockup định hướng**, không phải ảnh chụp game có thể chơi. Các con số, tài nguyên, tỷ lệ lưới và chi tiết chữ phụ trên ảnh chỉ minh họa bố cục; luật và phạm vi bản đầu lấy theo tài liệu này. Nhãn chính trong ảnh dùng tiếng Việt để thuận tiện review.

## 8. Phạm vi nguyên mẫu và kiểm chứng

Làm một nguyên mẫu khoảng **15 màn**: màn hướng dẫn, vài màn khám phá, vài màn chiến đấu và một boss. Nguyên mẫu cần có bàn ghép, năm loại ô, Kiếm Trảm, thanh kiếm khí, các mục tiêu chính, bản đồ đơn giản và một màn đột phá. Dùng nguyên mẫu để trả lời:

1. Người chơi mới có nhận ra luật ghép và mục tiêu mà không cần đọc hướng dẫn dài không?
2. Kiếm khí có tạo lựa chọn thú vị hay chỉ là nút bấm thêm?
3. Màn khám phá và màn chiến đấu có đủ khác nhau về cảm giác chơi không?
4. Độ khó tăng có hợp lý, đặc biệt ở lần gặp chướng ngại và boss đầu tiên không?
5. Sau lần đột phá Trúc Cơ, người chơi có muốn tiếp tục khám phá vùng đất mới không?

Quan sát người chơi mới hoàn thành vài màn liên tiếp; ghi lại chỗ họ dừng, thao tác nhầm, tỷ lệ thắng và cảm nhận về độ dài mỗi màn. Dùng kết quả này để cân bằng trước khi mở rộng lên 60 màn.

## 9. Ghi chú tạo ảnh preview

Ảnh `assets/ui-preview.png` được tạo bằng công cụ `imagegen` tích hợp trong một lượt. Prompt sử dụng:

<details>
<summary>Xem prompt tạo ảnh</summary>

```text
Use case: ui-mockup
Asset type: one review contact sheet for a portrait mobile match-3 cultivation fantasy game titled “Kiếm Khai Tiên Lộ”.
Primary request: Generate ONE cohesive high-fidelity UI preview image, arranged as a clean 2×2 grid of FOUR distinct portrait phone screens. This is a practical, readable game UI mockup, not standalone concept art. Maintain exactly the same visual language, icons, typography, border treatments, and palette across all four screens.
Screen 1, upper left — world map: winding path through floating tiên sơn mountains, clouds, temples, chapter gates and numbered stage nodes; current stage highlighted. Short Vietnamese header exactly “TIÊN LỘ”.
Screen 2, upper right — exploration puzzle: large central 7×7 match-3 board with clearly distinguishable sword, fire talisman, lightning seal, spirit stone, and herb tiles; a few sealed obstacles, clear moves counter, one objective icon, skill gauge. Short Vietnamese header exactly “BÍ CẢNH”.
Screen 3, lower left — boss puzzle: imposing but friendly fantasy yêu thú above a health bar, match-3 board clearly visible below, sword-energy ability ready, clear turn counter. Short Vietnamese header exactly “YÊU VƯƠNG”.
Screen 4, lower right — cultivation breakthrough: sword cultivator on a floating stone platform, glowing sword aura, visual progression from Luyện Khí to Trúc Cơ, one strong primary action button. Short Vietnamese header exactly “ĐỘT PHÁ”.
Style/medium: polished 2D mobile game UI, luminous East Asian xianxia fantasy, bright approachable hyper-casual look, hand-painted background details with crisp vector-like foreground UI. No photorealism and no generic Western medieval motifs.
Composition/framing: wide single poster with four equally sized tall phone panels in a balanced 2×2 grid, generous separation, straight-on view, no perspective distortion, each screen fully visible and readable at reduced size. Prioritize actual layouts and board clarity over decorative scenery.
Color palette: jade green, celestial blue, ivory cloud, warm gold, coral red for fire, violet-blue for lightning. Dark jade interface frames with high contrast, restrained bloom.
Text (verbatim): “TIÊN LỘ”, “BÍ CẢNH”, “YÊU VƯƠNG”, “ĐỘT PHÁ”. Limit all other text; use compact symbols or numbers where needed. Vietnamese diacritics must be correct.
Constraints: one image only, exactly four screens, no watermark, no commercial logos, no Candy Crush references, distinct silhouettes for all tile types, touch-friendly controls, consistent art style, premium yet playful mobile-game polish.
```

</details>

Ảnh dùng để review bố cục và art style. Khi triển khai UI thật, chữ, chỉ số, biểu tượng và quy tắc màn chơi phải được dựng bằng thành phần giao diện của game để bảo đảm chính xác và thích ứng thiết bị.
