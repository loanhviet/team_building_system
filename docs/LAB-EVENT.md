# TBLAB — sự kiện để học & debug thuật toán phân bổ

## Tại sao cần event riêng

TB2026 (`seed.py`) có 120 nhân viên / 97 người tham gia. Khi một lần phân bổ ra kết quả
lạ, bạn **không có cách nào** tự tính lại bằng tay để biết là thuật toán sai hay hiểu sai.

TBLAB chỉ có **16 người tham gia**, chọn sao cho *mỗi nhánh* của mỗi thuật toán được kích
hoạt đúng một lần, và toàn bộ kết quả vừa trong một bảng bạn kiểm được trên giấy.

```bash
docker compose exec api python -m app.db.seed_lab          # tạo
docker compose exec api python -m app.db.seed_lab --reset   # xoá sạch và tạo lại
```

Đăng nhập: mã LAB làm cả email và mật khẩu — `lab001@teambuilding.vn` / `LAB001`.
`LAB001 / LAB005 / LAB008 / LAB010` là `team_leader` nên chọn được ghế Gala.
BTC: `btc@teambuilding.vn / btc123`, super admin: `admin@teambuilding.vn / admin123`.

**Chuyến bay và xe cố tình để trống.** Bạn tự chạy rồi đối chiếu với bảng ở dưới. Gala
cũng chưa bốc thăm. Phòng đã gán sẵn 10/16 người để còn 6 người cho bạn tập gán tay.

---

## Dàn nhân sự (22 người)

| Mã | Team | Site | Ca | Đăng ký | Điểm đón | Vai trò |
|---|---|---|---|---|---|---|
| LAB001 | ALPHA | HN | Ca1 | tham gia | HN-A | team_leader |
| LAB002 | ALPHA | HN | Ca1 | tham gia | HN-A | |
| LAB003 | ALPHA | HN | Ca1 | tham gia | HN-B | |
| LAB004 | ALPHA | HN | Ca1 | tham gia | **chưa chọn** | |
| LAB005 | BETA | HN | Ca1 | tham gia | HN-A | team_leader |
| LAB006 | BETA | HN | Ca1 | tham gia | HN-A | |
| LAB007 | BETA | HN | **Ca2** | tham gia | HN-B | |
| LAB008 | GAMMA | HN | Ca2 | tham gia | HN-A | team_leader |
| LAB009 | GAMMA | HN | Ca2 | tham gia | HN-A | |
| LAB010 | DELTA | HCM | Ca1 | tham gia | SG-A | team_leader |
| LAB011 | DELTA | HCM | Ca1 | tham gia | SG-A | |
| LAB012 | DELTA | HCM | Ca1 | tham gia | SG-B | |
| LAB013 | DELTA | HCM | Ca1 | tham gia | SG-B | |
| LAB014 | DELTA | HCM | **Ca2** | tham gia | SG-A | |
| LAB015 | GAMMA | HCM | Ca1 | tham gia | SG-A | |
| LAB016 | GAMMA | HCM | Ca1 | tham gia | SG-A | |
| LAB017 | ALPHA | HN | – | đã gửi, **không** tham gia | | |
| LAB018 | DELTA | HCM | – | đã gửi, **không** tham gia | | |
| LAB019 | BETA | HN | Ca1 | **đã huỷ** | | |
| LAB020 | GAMMA | HN | – | **chưa từng mở form** | | |
| LAB021 | DELTA | HCM | – | **chưa từng mở form** | | |
| LAB022 | ALPHA | HN | – | **chưa từng mở form** | | |

Số người tham gia theo (team, site) — đây chính là đơn vị mà allocator gom nhóm:

| Nhóm | Số người | Ca |
|---|---|---|
| (DELTA, HCM) | 5 | 4×Ca1 + 1×Ca2 |
| (ALPHA, HN) | 4 | 4×Ca1 |
| (BETA, HN) | 3 | 2×Ca1 + 1×Ca2 |
| (GAMMA, HN) | 2 | 2×Ca2 |
| (GAMMA, HCM) | 2 | 2×Ca1 |

> LAB017/018 (không tham gia), LAB019 (huỷ), LAB020-022 (chưa đăng ký) **không xuất hiện
> trong bất kỳ thuật toán nào**. Đó là bài kiểm tra đầu tiên: 16, không phải 22.

## Tài nguyên

**Chuyến bay** — HN có 6+4 = 10 chỗ cho 9 người; HCM có 5+1 = 6 chỗ cho 7 người
(**thiếu đúng 1**). Chuyến về cố tình **không gán Ca**.

| Chuyến | Chiều | Ca | Site | Chỗ | Khởi hành | Đến |
|---|---|---|---|---|---|---|
| LAB-HN1 | đi | Ca1 | HN | 6 | 08:00 | 09:20 |
| LAB-HN2 | đi | Ca2 | HN | 4 | 14:00 | 15:20 |
| LAB-SG1 | đi | Ca1 | HCM | 5 | 08:30 | 09:40 |
| LAB-SG2 | đi | Ca2 | HCM | **1** | 15:00 | 16:10 |
| LAB-HN9 | về | – | HN | 5 | 16:00 | 17:20 |
| LAB-HN10 | về | – | HN | 5 | 18:00 | 19:20 |
| LAB-SG9 | về | – | HCM | 7 | 17:00 | 18:10 |

**Xe** — 4 chặng. Hai chặng đầu/cuối gắn điểm đón (phía nhà), hai chặng giữa **không có
điểm đón** (phía điểm đến — đón ở sân bay/khách sạn).

| Chặng | flight_timing | Xe (điểm đón · giờ chạy · chỗ) |
|---|---|---|
| HOME_AIR (đi) | before_flight | X1 HN-A·05:30·5 · X2 HN-B·05:30·3 · X3 HN-A·11:00·3 · X4 SG-A·06:00·4 · X5 SG-B·06:00·3 · **X6 SG-A·07:30·2** |
| AIR_HOTEL (đi) | after_flight | X7 –·10:00·12 · **X8 –·16:00·4** · X9 –·17:00·4 |
| HOTEL_AIR (về) | before_flight | X10 –·13:00·10 · X11 –·15:00·8 |
| AIR_HOME (về) | after_flight | X12 HN-A·17:45·4 · X13 HN-B·17:45·3 · X14 HN-A·19:45·4 · X15 HN-B·19:45·3 · X16 SG-A·18:30·5 · X17 SG-B·18:30·3 |

X6 và X8 in đậm vì chúng **trông hợp lệ nhưng lệch cửa sổ thời gian** — xem Bài 3.

**Khách sạn** — 8 phòng đôi + 1 phòng đơn (209) = 17 giường cho 16 người. Đã gán 10
người vào 201–205. Phòng đơn để bạn chạm mốc `room_full` (409) trong 2 cú click.

**Gala** — 3 bàn × 6 ghế = 18 ghế, **2 ghế đã khoá** → 16 ghế chọn được.
Tổng hạn mức = 4+3+4+5 = **16**. Đúng sát mép. `turn_duration=30s`, `hold_ttl=15s` để bạn
xem được hết-lượt/lượt-bù trong vòng một phút. Trạng thái `setup` — bạn tự bốc thăm.

---

## Ba công thức cần nhớ

**1. Điểm chấm một chuyến/xe** (`greedy.py::_score`, `bus_greedy.py::_score`)

```
score = W_same_shift × (số người đúng ca / tổng nhóm)
      + W_team_together × (1 nếu chuyến đã có người cùng team, ngược lại 0)
      + W_fill_rate × min(1, (đã xếp + nhóm này) / sức chứa)
```
Preset `balanced`: `same_shift=40, team_together=30, fill_rate=20, split_penalty=10`.

**2. Ngưỡng tách team** (`greedy.py`, nhánh `force_split`)

```
allowed_ratio = split_penalty / (same_shift + split_penalty) = 10 / (40+10) = 0.2
tách team  ⟺  (số người lệch ca / tổng nhóm) > 0.2      ← so sánh NGẶT
```
Đọc là: *"chịu lệch ca tối đa 20% để giữ team đi cùng chuyến."*

**3. Cửa sổ giờ xe ↔ giờ bay** (`bus_greedy.py::bus_compatible`)

```
before_flight:  giờ_chạy_xe ∈ [giờ_bay_cất − 6h , giờ_bay_cất − 90 phút]
after_flight:   giờ_chạy_xe ∈ [giờ_bay_hạ , giờ_bay_hạ + 3h]
điểm đón:       xe KHÔNG gắn điểm đón thì nhận mọi người;
                xe CÓ gắn thì chỉ nhận người đăng ký đúng điểm đó
```

---

## Bài 1 — Phân bay chiều đi

Tự tính trước, rồi chạy: *Admin → Sự kiện TBLAB → Phân chuyến bay → chiều đi → Chạy*.

Allocator xử lý nhóm **lớn trước**: DELTA(5) → ALPHA(4) → BETA(3) → GAMMA-HN(2) → GAMMA-HCM(2).

<details>
<summary>Tính tay từng bước (mở sau khi đã tự thử)</summary>

**DELTA/HCM (5 người, 4×Ca1 + 1×Ca2)** — `whole_fit` = chuyến còn ≥5 chỗ và đúng site:
SG1 (5 chỗ) ✓, SG2 (1 chỗ) ✗. → `best_whole = SG1`.
Lệch ca = 1 (LAB014 là Ca2, SG1 là Ca1). `1/5 = 0.2`. Kiểm tra `0.2 > 0.2` → **False**
(so sánh ngặt) → **không tách**. Cả 5 lên SG1, LAB014 bị gắn cờ `shift_mismatch`.
→ SG1 đầy 5/5.

**ALPHA/HN (4 người, toàn Ca1)** — `whole_fit` = HN1 (6 chỗ) ✓, HN2 (4 chỗ) ✓. Chấm điểm:
- HN1 (Ca1): `40×(4/4) + 30×0 + 20×(4/6)` = 40 + 0 + 13.3 = **53.3**
- HN2 (Ca2): `40×(0/4) + 30×0 + 20×(4/4)` = 0 + 0 + 20 = **20**

→ HN1. Lệch ca = 0 → không tách. HN1 = 4/6.

**BETA/HN (3 người, 2×Ca1 + 1×Ca2)** — HN1 chỉ còn 2 chỗ < 3 ✗; HN2 còn 4 ✓ →
`best_whole = HN2` (Ca2). Lệch ca = 2 (hai người Ca1). `2/3 = 0.667 > 0.2` →
**TÁCH**. Chia theo ca, nhóm to trước:
- nhóm Ca1 (2 người): HN1 `40×1 + 0 + 20×(6/6)` = 60 · HN2 `0 + 0 + 20×(2/4)` = 10 → **HN1**, đầy 6/6
- nhóm Ca2 (1 người): HN1 hết chỗ → **HN2**, đúng ca, không cờ

**GAMMA/HN (2 người, Ca2)** — HN1 hết chỗ; HN2 còn 3 ✓ → nguyên nhóm lên HN2 = 3/4.

**GAMMA/HCM (2 người, Ca1)** — SG1 hết chỗ, SG2 chỉ 1 chỗ < 2 → không có `whole_fit`
→ nhánh tách. Ứng viên = chuyến còn chỗ **và đúng site HCM**: chỉ SG2.
*HN2 vẫn còn 1 chỗ nhưng bị `_site_ok` loại thẳng — đây là bộ lọc CỨNG, không phải trừ điểm.*
Lấy 1 người lên SG2 (Ca2 ≠ Ca1 → cờ `shift_mismatch`). Người còn lại: vòng lặp sau
không còn chuyến nào → cờ `no_slot`, ghi row với `flight_id = NULL`.

</details>

**Kết quả đúng** (đã chạy và xác nhận):

| Chuyến | Người | Cờ |
|---|---|---|
| LAB-HN1 6/6 | LAB001-004 (ALPHA), LAB005-006 (BETA Ca1) | – |
| LAB-HN2 3/4 | LAB007 (BETA Ca2), LAB008-009 (GAMMA HN) | – |
| LAB-SG1 5/5 | LAB010-014 (DELTA) | LAB014 `shift_mismatch` |
| LAB-SG2 1/1 | LAB015 | LAB015 `shift_mismatch` |
| *không có chuyến* | LAB016 | `no_slot` |

`assigned=15, flagged=3, split_teams=[BETA, GAMMA]`

Ba điều đáng để ý:
- **GAMMA bị báo "tách" dù nhóm HN của nó lên nguyên một chuyến.** Cờ này đến từ nhóm
  HCM. Team trải hai site thì *bắt buộc* nằm trên ≥2 chuyến — không sửa được.
- **`no_slot` không làm mất người.** Row vẫn được ghi với `flight_id=NULL` để BTC thấy
  và xử lý tay trong workbench (xem `runner.py`, đoạn cuối).
- Preflight báo **cảnh báo** `thiếu 1 chỗ bay` chứ không chặn — chặn thì bạn không bao
  giờ tới được tình huống `no_slot` để tập xử lý.

### Bài 1b — tự làm: đẩy DELTA qua ngưỡng

Cho LAB013 rút khỏi sự kiện (`is_participating = false`) → DELTA còn 4 người, lệch ca
`1/4 = 0.25 > 0.2` → **tách**. Chạy lại chiều đi.

<details><summary>Kết quả đúng</summary>

`split_teams = [BETA, DELTA]`, **flagged = 0**:
`SG1: LAB010, LAB011, LAB012, LAB015, LAB016` · `SG2: LAB014`

LAB014 được tách ra và lên đúng chuyến Ca2 của mình, nhờ đó SG1 dư 2 chỗ cho **cả hai**
người GAMMA-HCM → `no_slot` biến mất. Luật tách team sinh ra để giảm lệch ca, ở đây nó
giải luôn bài thiếu chỗ. Đây là lý do nên chấm điểm chứ không xếp cứng.
</details>

## Bài 2 — Phân bay chiều về (đối chứng)

Chạy chiều về. **16/16 xếp hết, 0 cờ, 0 team bị tách.**

| Chuyến | Người |
|---|---|
| LAB-HN9 4/5 | LAB001-004 |
| LAB-HN10 5/5 | LAB005-009 |
| LAB-SG9 7/7 | LAB010-016 |

Câu hỏi: *cùng một hàm `allocate()`, cùng một team lệch ca — sao không có cờ nào?*

Vì chuyến về có `shift_id = NULL`, và `_is_shift_mismatch()` trả `False` ngay khi
`flight.shift_id is None`. "Ca" trong BRD chỉ là khái niệm của chiều đi (Ca 1 / Ca 2 đi
sớm hay sau giờ giao dịch). Không có gì để lệch thì không gắn cờ.

Để ý LAB-HN9 dừng ở 4/5 dù HN10 phải nhận 5. `fill_rate` chấm HN9 và HN10 bằng điểm
(cùng 4/5), tie-break là `-flight_id` → id nhỏ hơn thắng. Greedy **không lùi lại** để
cân bằng.

## Bài 3 — Phân xe: một cờ, ba nguyên nhân khác nhau

> Chạy phân bay **trước**. Chặng có `flight_timing` mà chưa ai có chuyến thì preflight
> chặn cứng `flight_allocation_required` — đúng, vì mọi xe sẽ không có giờ bay để so.

**HOME_AIR (before_flight)** → `13/16 xếp được, 3 người cờ no_compatible_bus`:

| Xe | Người |
|---|---|
| X1 HN-A·05:30 5/5 | LAB001, LAB002, **LAB004**, LAB005, LAB006 |
| X2 HN-B·05:30 1/3 | LAB003 |
| X3 HN-A·11:00 2/3 | LAB008, LAB009 |
| X4 SG-A·06:00 3/4 | LAB010, LAB011, LAB014 |
| X5 SG-B·06:00 2/3 | LAB012, LAB013 |
| *không có xe* | LAB007, LAB015, LAB016 |

Ba người đó cùng một cờ nhưng **ba nguyên nhân hoàn toàn khác nhau** — đây là bài học
chính của chặng này:

- **LAB007** — đúng cửa sổ, **sai điểm đón**. Bay HN2 (cất 14:00) → cửa sổ
  `[08:00, 12:30]`. Xe duy nhất trong cửa sổ đó là X3, mà X3 gắn HN-A còn LAB007 đăng ký
  HN-B. → thiếu một xe HN-B buổi trưa.
- **LAB015** — đúng điểm đón, **lệch cửa sổ**. Bay SG2 (cất 15:00) → cửa sổ
  `[09:00, 13:30]`. X6 đúng SG-A nhưng chạy 07:30 → sớm quá. X4 (06:00) cũng ngoài cửa sổ.
- **LAB016** — **không có chuyến bay nào** (`no_slot` ở Bài 1). `flight_depart_at = None`
  → `bus_compatible` trả `False` ngay. Lỗi ở chuyến bay **lan xuống** xe.

Và **LAB004** (chưa chọn điểm đón) lên X1 bình thường: `pickup_point_id = None` nghĩa là
"xe nào cũng được", chỉ còn giờ bay ràng buộc. Preflight cảnh báo `pickup_missing` nhưng
không chặn.

**AIR_HOTEL (after_flight, xe không gắn điểm đón)** → `15/16`:

| Xe | Người |
|---|---|
| X7 –·10:00 11/12 | LAB001-006 (hạ 09:20), LAB010-014 (hạ 09:40) |
| X8 –·16:00 3/4 | LAB007, LAB008, LAB009 (hạ 15:20) |
| X9 –·17:00 1/4 | LAB015 |
| *không có xe* | LAB016 |

Đây là chặng từng **hoàn toàn không xếp được ai** trước khi sửa `bus_compatible`: xe ở Đà
Nẵng không có điểm đón, nhưng đăng ký của CBNV mang điểm đón *ở nhà* trên **cả 4 chặng*,
nên mọi xe bị coi là không tương thích với mọi người.

Câu hỏi hay: *sao LAB015 không lên X8 cùng 3 người kia mà phải chờ X9?*
SG2 hạ **16:10**, X8 chạy **16:00** — sớm hơn 10 phút. Cửa sổ `after_flight` bắt đầu
*đúng* lúc máy bay hạ. Đổi X8 sang 16:15 rồi chạy lại để thấy nó nhảy sang X8.

**HOTEL_AIR** `16/16` và **AIR_HOME** `16/16` — hai chặng sạch, dùng làm đối chứng.
Ở HOTEL_AIR để ý LAB012 và LAB013 (cùng team, cùng chuyến, cùng điểm đón — tức **cùng một
nhóm**) lại bị chia ra X10/X11: greedy lấy `remaining[:best.remaining]`, xe chọn hết chỗ
thì phần còn lại sang vòng sau. Nó **không đổi xe khác để giữ nhóm nguyên vẹn**.

## Bài 4 — Gala Dinner

1. *Admin → TBLAB → Gala*. Hạn mức: ALPHA 4, BETA 3, GAMMA 4, DELTA 5 = **16**, ghế chọn
   được = **16**. Đúng sát mép.
2. **Khoá thêm 1 ghế rồi bốc thăm** → `not_enough_seats: Tổng ghế hiện có (15) không đủ
   cho tổng hạn mức các Team (16)`. Ghế khoá không được tính là sức chứa (`draw_turns`
   đếm row `gala_seats` thật, không cộng `GalaTable.seat_count`). Mở lại rồi bốc thăm.
3. Thứ tự bốc thăm **random mỗi lần** (`rng.shuffle`, seed lưu ở `config.draw_seed`).
   Không bốc lại được khi đã có lượt — `already_drawn`.
4. Mở tab thứ hai, đăng nhập `lab001@teambuilding.vn / LAB001`, vào `/gala/3`. BTC bấm
   *Bắt đầu lượt*; nếu tới lượt ALPHA thì LAB001 giữ/xác nhận ghế được.
5. **Xem lượt hết giờ**: `turn_duration=30s`. Giữ 1 ghế rồi đừng xác nhận. Sau 30s cron
   `expire_gala_holds_task` (chạy mỗi 5s) sẽ đánh lượt `expired`, **nhả ghế đang giữ**, và
   sang team kế tiếp. Xem log: `make logs s=worker`.
6. **Lượt bù**: khi hết lượt chờ, team nào `expired`/`skipped` mà chưa đủ ghế sẽ được cấp
   **một** lượt bù (`is_makeup`), mang **nguyên hạn mức gốc** — vì mọi phép đếm quota là
   luỹ kế cả event. Thử: để ALPHA xác nhận 2/4 rồi cho hết giờ, đến lượt bù xác nhận tiếp
   2 ghế nữa.
7. `hold_ttl=15s < turn_duration=30s`. Thử đổi `hold_ttl` thành `120` (dài hơn lượt) rồi
   lặp lại bước 5 — ghế vẫn phải được nhả khi lượt kết thúc.

## Bài 5 — `is_locked` và chạy lại

1. Chạy phân bay chiều đi.
2. Trong workbench, chuyển LAB016 (người `no_slot`) sang LAB-HN2 — nó còn 1 chỗ.
   → 409 `site_mismatch`: LAB016 ở site HCM, HN2 phục vụ HN. **Bộ lọc site chặn cả tay.**
3. Đổi cách: chuyển LAB009 (GAMMA, HN, Ca2) từ HN2 sang HN1 → HN1 đã 6/6 → 409
   `over_capacity`.
4. Tăng sức chứa HN1 lên 7, rồi chuyển LAB009 sang HN1 → được, có cảnh báo lệch ca cần
   xác nhận (`soft_warning_required`, gửi lại với `accept_soft_warnings`).
   Row thành `source=manual, is_locked=true`.
5. **Chạy lại phân bay.** LAB009 vẫn ở HN1 — allocator chỉ xoá row `is_locked=false`, và
   người bị pin được loại khỏi danh sách ứng viên, chỗ của họ trừ vào sức chứa từ đầu.
6. Bấm *Bỏ ghim* rồi chạy lại → LAB009 quay về HN2.

## Bài 6 — Luồng đăng ký + nhắc

TBLAB đang ở `registration_closed`. Chuyển về `registration_open` (BTC làm được, đây là
chuyển hợp lệ trong `FORWARD_TRANSITIONS`). Cửa sổ đăng ký đã mở sẵn quanh hôm nay.

- Đăng nhập `lab020@teambuilding.vn / LAB020` (chưa từng đăng ký) → `/register`. Mở form
  là hệ thống tạo row `draft`.
- Thử chọn điểm đón của site khác → 400 `pickup_site_mismatch`.
- Thử gửi mà không tick điều khoản → 400 `terms_not_agreed`.
- Gửi xong xem email trong MailHog `localhost:8025`.
- Nút **Nhắc nhở chưa gửi (n)** ở trang đăng ký: `n` gồm cả người **chưa từng mở form**,
  **không** gồm người đã huỷ (LAB019) và người đã nhắc hôm nay. Bấm lần hai cùng ngày →
  nút về (0).
- Chuyển lại `registration_closed` → nút tắt, endpoint trả `registration_not_open`.

> **Con số sẽ là 123, không phải 3.** `unsubmitted_employees()` lấy **mọi** nhân viên
> `is_active` của công ty, không chỉ người LAB — DB này còn 120 nhân viên `NV*` của TB2026.
> 142 active − 19 đã trả lời (LAB001-018 gửi + LAB019 huỷ) = 123. Đúng thiết kế: một kỳ
> Team Building mới thì mời cả công ty. Nếu muốn con số gọn để học, chạy
> `seed_lab --reset` trên DB chỉ có TBLAB, hoặc set `is_active=false` cho nhóm `NV*`.

---

## Mẹo debug

| Muốn xem | Nơi xem |
|---|---|
| Job phân bổ chạy ra sao | `GET /api/jobs?event_id=3` hoặc panel Job trong workbench; `result_json` có summary |
| Vì sao một người bị cờ | `GET /api/events/3/flight-assignments?direction=outbound` — có `flag_reason`, `requested_shift_name`, `employee_site_id` |
| Vì sao một người không có xe | `GET /api/events/3/bus-assignments?leg_id=<id>` — có `requested_pickup_point_name` và `flight_code`, đủ để tự áp 3 công thức |
| Preflight đang chặn gì | `GET /api/events/3/allocations/{flight\|bus}/preflight?...` — phân biệt `blockers` (chặn) và `warnings` (cho chạy) |
| Điều kiện công bố | `GET /api/events/3/readiness` |
| Log worker (cron Gala, email) | `make logs s=worker` |
| Ai làm gì | `GET /api/events/3/audit-logs` |

Đặt breakpoint/`print` hiệu quả nhất ở 3 chỗ, đúng theo 3 công thức trên:

- `app/services/allocation/greedy.py::_score` và nhánh `force_split`
- `app/services/allocation/bus_greedy.py::bus_compatible`
- `app/services/gala/gala_service.py::confirm_seat` (phép đếm quota luỹ kế)

Chạy thẳng allocator không qua HTTP/worker, in ra và **rollback** để không bẩn dữ liệu:

```python
# docker compose exec -T api python - <<'PY'
import asyncio
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models.event import Event
from app.models.system import AllocationRun
from app.services.allocation.runner import run_flight_allocation

async def main():
    async with AsyncSessionLocal() as db:
        ev = (await db.execute(select(Event).where(Event.code == "TBLAB"))).scalar_one()
        run = AllocationRun(event_id=ev.id, type="flight", status="running", params_json={})
        db.add(run); await db.flush()
        print(await run_flight_allocation(db, ev.id, "outbound", None, run.id))
        await db.rollback()          # <- không ghi gì vào DB
asyncio.run(main())
PY
```

Muốn về trạng thái ban đầu bất cứ lúc nào: `docker compose exec api python -m app.db.seed_lab --reset`.
