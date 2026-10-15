# Mười map đầu — Vân Hải Tiên Sơn

Catalog local hiện có 10 map chơi được. Map 1–2 là tutorial; map 3–10 có layout và mục tiêu trong `game-maps.json`. Map 6–10 có seed và báo cáo cân bằng trong `map-seeds/`; các tỷ lệ dưới đây là ước lượng bot từ holdout 1.000 lượt, không phải cam kết tỷ lệ thắng của người chơi.

## Nhịp chương và mốc thưởng

Hành trình đi từ học ghép ô đến khai thông đường núi, nhận kiếm, học thức Thứ, rồi dùng những gì đã học để vượt yêu thú và boss hộ sơn. Thắng map mở map kế; các món tại mốc dưới đây chỉ nhận khi đạt 3 sao.

| Map | Trạng thái | Vai trò | Mốc thưởng |
|---:|---|---|---|
| 1 | Chơi được | Học ghép 3 Kiếm | — |
| 2 | Chơi được | Tạo rồi kích hoạt ô Lôi cấp 4 | — |
| 3 | Chơi được | Thu thập Kiếm và Hỏa | Kiếm cơ bản |
| 4 | Chơi được | Phá đá chắn để khai thông đường núi | — |
| 5 | Chơi được | Thu thập ô Kiếm cấp 4 tại Kiếm Bia | Thứ |
| 6 | Đã tạo và cân bằng | Phá đá chắn, độ khó trung bình | — |
| 7 | Đã tạo và cân bằng | Trận Battle dễ với yêu thú canh cốc | — |
| 8 | Đã tạo và cân bằng | Thu Hỏa/Lôi trên bàn có đá chắn | Thiêu |
| 9 | Đã tạo và cân bằng | Thu Kiếm và ô Hỏa cấp 4 | — |
| 10 | Đã tạo và cân bằng | Boss hộ sơn, mạnh hơn yêu thú map 7 | Vân |

## Brief từng map

### Map 1 — Bài học ghép 3 *(đã có)*

- **Vai trò:** Dạy thao tác đổi ô và ghép ba viên Kiếm trong lượt chơi đầu.
- **Mục tiêu/cơ chế:** Thu thập 3 Kiếm; tutorial `match-three`. Map 5×5, 8 lượt.
- **Người chơi học:** Chỉ nước đổi hợp lệ mới tiêu lượt; ô được ghép sẽ đóng góp vào mục tiêu.
- **Truyện/phần tiếp:** Người chơi đến chân Vân Hải Tiên Sơn và khơi thông luồng linh khí đầu tiên. Map 2 giới thiệu ghép lớn hơn.

### Map 2 — Bài học Lôi cấp 4 *(đã có)*

- **Vai trò:** Giới thiệu ô cường hóa và lợi ích của việc chủ động tạo match lớn.
- **Mục tiêu/cơ chế:** Tạo ô Lôi cấp 4 rồi ghép để kích hoạt tia sét; tutorial `charged-lightning`. Map 6×5, 8 lượt.
- **Người chơi học:** Ghép bốn ô tạo ô cường hóa; một match sau có thể kích hoạt hiệu ứng diện rộng.
- **Truyện/phần tiếp:** Người chơi vượt trận pháp ở sơn môn. Map 3 chuyển từ bài hướng dẫn sang mục tiêu thu thập kết hợp.

### Map 3 — Thu thập Kiếm và Hỏa *(đã có)*

- **Vai trò:** Kiểm tra người chơi có thể theo dõi hai mục tiêu cùng lúc sau phần hướng dẫn.
- **Mục tiêu/cơ chế:** Thu thập 12 Kiếm và 12 Hỏa. Map 6×7, 19 lượt.
- **Người chơi học:** Quan sát mục tiêu còn thiếu và chọn match phù hợp thay vì chỉ ưu tiên một loại ô.
- **Truyện/phần thưởng:** Vượt thử thách nhập môn để nhận **Kiếm cơ bản khi đạt 3 sao**. Kiếm cộng 1 sát thương cho mỗi ô bị xóa. Map 4 mở đường lên núi.

### Map 4 — Đường đá chắn *(đã có)*

- **Vai trò:** Giới thiệu đá chắn như một chướng ngại cần dọn để đi tiếp.
- **Mục tiêu/cơ chế:** Phá 5 đá chắn bằng match ở cạnh; dùng mục tiêu `BreakRocks`. Map 7×7, 12 lượt, dễ.
- **Người chơi học:** Chọn vị trí match để vừa tiến mục tiêu vừa tạo sát thương hiệu quả.
- **Truyện/phần thưởng:** Người chơi khai thông đường núi, phát hiện Kiếm Bia cổ. Map 5 là thử thách trước bia; không yêu cầu kiếm thưởng từ map 3.

### Map 5 — Kiếm Bia thức thứ nhất *(đã có)*

- **Vai trò:** Đặt mốc học thức kiếm đầu tiên sau khi người chơi đã gặp chướng ngại.
- **Mục tiêu/cơ chế:** Thu thập 1 ô Kiếm cấp 4. Map 6×7, 27 lượt, dễ.
- **Người chơi học:** Tạo và kích hoạt ô cường hóa để hoàn thành mục tiêu.
- **Truyện/phần thưởng:** Kiếm Bia truyền thức **Thứ** nếu map đạt 3 sao. Map 6 tiếp tục thử thách phá đá; Thứ không phải điều kiện thắng.

### Map 6 — Phá Thạch Khai Lộ *(đã tạo)*

- **Vai trò:** Mở rộng bài học đá chắn với một mục tiêu phá đá ở độ khó trung bình.
- **Mục tiêu/cơ chế:** Phá 3 đá chắn; `BreakRocks`. Bàn 7×8, 25 lượt.
- **Cân bằng:** Holdout 1.000 seed: thắng 69,6%, đạt 3 sao 46,1%. Trung vị số lượt thử để thắng là 1; để đạt 3 sao là 2.
- **Seed và báo cáo:** [seed](map-seeds/6/seed.json), [balance](map-seeds/6/balance.json).

### Map 7 — Yêu Thú Canh Cốc *(đã tạo)*

- **Vai trò:** Trận Battle đầu tiên, độ khó dễ.
- **Mục tiêu/cơ chế:** Đánh bại yêu thú canh cốc, HP 791. Bàn 7×8, 30 lượt.
- **Cân bằng:** Holdout 1.000 seed: thắng 100%, đạt 3 sao 84,4%. Trung vị số lượt thử để thắng và đạt 3 sao đều là 1.
- **Truyện/phần tiếp:** Trận thắng mở cửa vào cốc; map 8 chuyển sang thu thập trên bàn có đá chắn.
- **Seed và báo cáo:** [seed](map-seeds/7/seed.json), [balance](map-seeds/7/balance.json).

### Map 8 — Linh Cốc Đá Chắn *(đã tạo)*

- **Vai trò:** Màn thu thập dễ với đá chắn cản trở đường đi.
- **Mục tiêu/cơ chế:** Thu 24 Hỏa và 24 Lôi. Có 4 ô đá chắn trên bàn 5×8; đá không phải mục tiêu. Map có 30 lượt.
- **Cân bằng:** Holdout 1.000 seed: thắng 99,9%, đạt 3 sao 81,2%. Trung vị số lượt thử để thắng và đạt 3 sao đều là 1.
- **Truyện/phần thưởng:** Đạt 3 sao nhận bị động **Thiêu**, cộng 1 sát thương mỗi ô bị xóa lên boss. Map 9 luyện kết hợp thu ô thường và ô cấp 4.
- **Seed và báo cáo:** [seed](map-seeds/8/seed.json), [balance](map-seeds/8/balance.json).

### Map 9 — Kiếm Hỏa Hợp Luyện *(đã tạo)*

- **Vai trò:** Ôn tập hai mục tiêu thu thập, độ khó dễ.
- **Mục tiêu/cơ chế:** Thu 1 Kiếm và 1 Hỏa cấp 4. Mục tiêu Kiếm không lọc cấp nên tính mọi cấp Kiếm; hai mục tiêu dùng loại ô khác nhau. Bàn 7×6, 27 lượt.
- **Cân bằng:** Kiếm và Hỏa có trọng số xuất hiện 150. Holdout 1.000 seed: thắng 94,3%, đạt 3 sao 81,0%. Trung vị số lượt thử để thắng và đạt 3 sao đều là 1.
- **Truyện/phần tiếp:** Vượt thử luyện để mở đường lên đỉnh. Map 10 khép lại chương bằng trận chiến hộ sơn.
- **Seed và báo cáo:** [seed](map-seeds/9/seed.json), [balance](map-seeds/9/balance.json).

### Map 10 — Hộ Sơn Yêu Vương *(đã tạo)*

- **Vai trò:** Boss cuối chương ở độ khó trung bình.
- **Mục tiêu/cơ chế:** Đánh bại Hộ Sơn Yêu Vương, HP 987. Bàn 7×7, 30 lượt; HP cao hơn yêu thú map 7 (791).
- **Cân bằng:** Holdout 1.000 seed: thắng 100%, đạt 3 sao 50,2%. Trung vị số lượt thử để thắng là 1; để đạt 3 sao là 2.
- **Truyện/phần thưởng:** Thanh tẩy boss và mở đường lên tiên sơn. Đạt 3 sao nhận bị động **Vân**, cộng 1 sát thương mỗi ô bị xóa lên boss.
- **Seed và báo cáo:** [seed](map-seeds/10/seed.json), [balance](map-seeds/10/balance.json).

## Nguyên tắc khi chuyển brief thành map

- Map 6–10 đã có trong catalog local cùng seed và balance report; chưa publish các map này lên Firestore.
- Các mốc thưởng giữ theo cấu hình: map 3 Kiếm cơ bản, map 5 Thứ, map 8 Thiêu, map 10 Vân; mỗi món cần 3 sao.
- Thắng map mở tiếp tiến trình kể cả chưa đạt 3 sao. Không map nào yêu cầu sở hữu món thưởng từ map trước để hoàn thành.
- Ưu tiên mục tiêu/cơ chế hiện có (`Collect`, `BreakRocks`, `BreakSeals`, `Battle`, `Boss`). Map 8 dùng đá chắn như vật cản nhưng không có mục tiêu `BreakRocks`.
- Catalog local có 10 map liên tục trong chương `chapter-1`; thắng map mở tiếp tiến trình kể cả khi chưa đạt 3 sao.
