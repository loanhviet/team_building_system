# REBUILD PLAN — Đợt làm lại R0–R6

> **Đây là nguồn sự thật (single source of truth) cho đợt làm lại hiện tại.**
> `docs/PLAN.md` giữ nguyên làm **lịch sử** Phase 0–13 (kiến trúc, data model, thuật toán vẫn tra ở đó).
> `docs/BRD.md` là yêu cầu nghiệp vụ gốc từ BTC.
>
> Tài liệu này được viết để **một agent/người khác mở ra là code được ngay**, không cần đọc lại
> hội thoại nào. Mỗi phase có checklist `- [ ]`, file + dòng cụ thể, và điều kiện nghiệm thu.

Ngày lập: 2026-09-12 · Trạng thái: R0-R5 xong, browser đã kết nối được và đã click-through rộng (không
theo đúng kịch bản R6) — tìm + sửa 4 lỗi thật (Select/RadioGroup controlled-value, seed thiếu
params_json). R6 CHƯA xong: còn thiếu kịch bản đăng ký 3 người, đóng đăng ký→phân bổ→công bố trọn
luồng, đua 2 tab Gala, và test 390px thật

---

## 1. Vì sao có đợt làm lại này

Sau khi Phase 0–13 báo "hoàn thành", người dùng dùng thử và phản hồi: *"các chức năng hiện đang sử dụng
chưa thấy rõ chức năng của nó, chưa cảm thấy hoạt động tốt"*.

Audit lại toàn bộ `docs/BRD.md` đối chiếu code cho thấy: **backend và data model gần như đúng BRD**
(schema đủ bảng, `journey_service` trả đủ 7 khối, thuật toán phân bổ có thật, Redis seat-lock có thật).
Vấn đề nằm ở 3 chỗ khác:

1. **Dữ liệu demo là khung xương smoke-test**, không phải dữ liệu thật → mọi màn hình trông rỗng.
2. **Một số trường BRD bắt buộc không có ô nhập nào trong Admin** → CBNV vĩnh viễn không thấy.
3. **Lớp UI chưa được làm tới** — không có state loading/error thật, nhãn tiếng Anh lọt ra UI tiếng Việt,
   không confirm cho hành động nguy hiểm, không có sort/filter/export như BRD §10 bắt buộc.

**Nguyên nhân gốc của cả ba:** cả 13 phase trước đều ghi *"**Chưa** click-through trình duyệt"*.
Hệ thống chưa bao giờ được bấm thật. Mọi thứ `curl 200`, `ruff` sạch, `tsc` sạch — và dùng thì thấy sai.

---

## 2. Bằng chứng — đọc trực tiếp `data/teambuilding.db`

| Thứ | BRD cần | Thực tế trong DB |
|---|---|---|
| Chặng xe | **4 chặng** (§7.1) | **1** (`HN -> San bay`) |
| Điểm đón/trả | danh sách BTC cấu hình (§4.5) | **0** → ô chọn điểm đón không bao giờ render |
| Chuyến bay | mã, **ngày, giờ, điểm đi/đến**, slot (§5.1) | 4 chuyến, `depart_at=NULL`, `origin=NULL`, `destination=NULL` |
| Phân bổ bay | (§5.2) | 21 người / 12 slot → **9 người flagged không có chuyến** |
| Chiều về | (§9) | **0 bản ghi** — chỉ chạy chiều đi |
| Sơ đồ Gala | rạp phim cho 120 người (§8.1) | **1 bàn, 8 ghế** |
| Phòng | (§6) | 3 phòng cho 21 người, 4 người được gán |
| Lịch trình | (§9) | **1 mục**, không giờ, không ngày |
| Đăng ký | 120 CBNV | **21** |

Hành trình thực tế của `nv002@teambuilding.vn` (tài khoản mẫu ghi trong README):

```
Chuyến bay : VN001 · — → — · giờ —
Chiều về   : (không có)
Xe         : XE01, tập trung 05:30, Trưởng xe Anh Tuan
Phòng      : 101
Gala       : Team chưa chọn bàn/ghế
Lịch trình : 1 dòng, không giờ
```

Màn hình đúng, dữ liệu rỗng. Và `make seed` còn tạo ra **ít hơn thế**: `apps/api/app/db/seed.py:94`
chỉ tạo 1 event `draft`, không ca, không chặng, không điểm đón, không chuyến bay.
`GET /events/current` (`apps/api/app/routers/events.py:78`) chỉ trả event ở trạng thái
`registration_open`, nên sau `make seed` trang `/register` hiện "Chưa mở đăng ký" — **dead end ngay
màn hình đầu tiên**.

---

## 3. Kết quả audit theo từng module BRD

### 3.1 Module 1 — Đăng ký (BRD §4)

| Yêu cầu | Trạng thái | Vị trí |
|---|---|---|
| §4.2 auto-fill hồ sơ | OK | `components/domain/profile-card.tsx` |
| §4.2 Team chọn từ Master Data | THIẾU | read-only, không dropdown, không kênh báo sai dữ liệu |
| §4.2 SĐT | LỖI | không bắt buộc; lưu qua PATCH riêng — gõ số rồi bấm "Gửi đăng ký" mà quên bấm "Lưu" là **mất trắng** (`profile-card.tsx:59-77`) |
| §4.3 checkbox quy định gate Submit | LỖI | render trong `{terms && …}` (`register/page.tsx:321`) — `/terms` lỗi là Submit **disable vĩnh viễn không báo gì**; đã submit rồi thì checkbox **tự tick lại** kể cả khi `terms_version` đổi (`:142-144`) |
| §4.4 chọn Ca 1/Ca 2 | THIẾU | wording "nguyện vọng" đúng (`:253-255`) nhưng **không bắt buộc** — submit `shift_id=null` vẫn qua (`:190`) |
| §4.5 nhu cầu xe 4 chặng + điểm đón | THIẾU | render phẳng, không nhóm theo `direction`, không empty state (`:259`), điểm đón **không lọc theo site** (`:295-299`), tick "cần xe" mà bỏ trống điểm đón vẫn submit (`:157`) |
| §4.6 mong muốn/đề xuất | OK | `:308-319` |
| §4.7 màn hình thành công + email | THIẾU | chỉ 1 toast (`:171`), không màn hình xác nhận, không tóm tắt |
| §13 sửa đến `registration_close_at` | LỖI | không hiện hạn; event đóng là `/register` bị thay bằng "Chưa mở đăng ký" (`:77-84`) → **CBNV không xem lại được mình đã đăng ký gì** |

Thêm: `:86-88` gate trên `registrationLoading \|\| !registration` mà **không xử lý `error`** → bất kỳ lỗi
nào của `/registrations/me` là **treo vĩnh viễn ở "Đang tải form đăng ký..."**.

### 3.2 Module 2 — Chuyến bay (BRD §5)

| Yêu cầu | Trạng thái | Vị trí |
|---|---|---|
| §5.1 nhập/import chuyến bay | LỖI | có, nhưng **import 2 lần là nhân đôi toàn bộ** — thiếu unique `(event_id, flight_code)` |
| §5.2 auto allocation | OK | chạy qua ARQ, `services/allocation/runner.py` |
| §5.3 không vượt slot | OK | `base.py:32-34` |
| §5.3 ưu tiên Team đi cùng | LỖI | **trọng số `team_together` và `split_penalty` không được đọc** — `greedy.py:4-7` chỉ dùng `same_shift` + `fill_rate`. BTC chỉnh 2 ô này trong Admin thì **không có gì xảy ra** |
| §5.3 flag ca không đáp ứng | THIẾU | chỉ flag ở nhánh tách Team. Team lọt nguyên khối vào chuyến **sai ca thì không flag** (`greedy.py:24-30`) |
| §5.4 hiện **slot còn lại** | THIẾU | backend tính đủ (`runner.py:111-125`), **FE vứt đi** — chỉ hiện 3 con số tổng (`flight-allocation-panel.tsx:383-386`) |
| §5.4 **mức độ Team bị tách** | THIẾU | rút thành `split_team_ids.length` — không tên Team, không drill-down |
| §5.5 chỉnh tay **cả Team** | THIẾU | phải tick tay từng người, không filter/search/select-all (`:427-483`) |
| §5.5 validate lại + cảnh báo | MỘT PHẦN | chỉ check sức chứa (`routers/flights.py:304-312`); ghi đè vượt slot **2 click với lý do mặc định "Điều chỉnh thủ công từ Admin"** còn nguyên (`:59` + `:510-516`) |
| §5.6 audit before/after + ai sửa | THIẾU | DB lưu đủ, **UI không hiện `actor`, không hiện `before/after`, CSV export cũng bỏ** (`routers/ops.py:43-51`) |

### 3.3 Module 3 — Xe (BRD §7) — **lỗ hổng lớn nhất**

Form thêm xe chỉ có **4 ô**: mã, sức chứa, trưởng xe, SĐT (`bus-allocation-panel.tsx:179-208`).

`BusCreate` nhận thêm `name`, `gather_at`, `depart_at`, `pickup_point_id`, `destination`, `note`
(`schemas/bus.py:6-16`), và `PATCH /buses/{id}` (`routers/buses.py:63`) tồn tại nhưng **không có nút
Sửa nào trong toàn bộ Admin** — bảng xe không có cột hành động.

Hệ quả chuỗi: `services/journey_service.py:81-85` render `gather_at` / `depart_at` / `pickup_name` /
`pickup_address` lên màn hình CBNV → **BRD §7.5 (CBNV xem giờ tập trung, điểm tập trung) vĩnh viễn
trống** trừ khi ai đó viết SQL tay. Trưởng xe cũng chỉ đặt được lúc tạo.

Phân xe tự động thì **đúng**: ưu tiên cùng chuyến bay → cùng Team → lấp đầy → không vượt sức chứa
(`services/allocation/bus_greedy.py:26-60`).

### 3.4 Module 4 — Gala (BRD §8)

Backend đúng gần hết: sơ đồ, random thứ tự (có seed, chặn bốc lại), timer cấu hình + cron quét mỗi 5s,
quota theo sĩ số, Redis `SET NX` + optimistic `version`, pub/sub realtime.

Lỗi ở lớp trên:

- **Bộ đếm quota sai** — hiện `myConfirmedCount` của Team **mình** đối chiếu `seat_quota` của Team
  **đang tới lượt** (`app/(employee)/gala/[eventId]/page.tsx:107`)
- **Không có hàng chờ** — `state.turns` có `order_no` + tên mọi Team, UI chỉ hiện lượt đang chạy
- **Sai chữ** — bốc thăm xong vẫn ghi "Chưa bắt đầu bốc thăm" cho mọi trạng thái không có lượt active (`:114-117`)
- **Ghế Team khác không có tên Team** — tất cả cùng màu lagoon, tooltip `Ghế 5 — confirmed` (lẫn tiếng Anh, `gala-seat-map.tsx:155`)
- **WebSocket không xác thực** — `routers/gala.py:305-313` không có dependency auth; `lib/use-gala-ws.ts:12` không gửi token. Biết `event_id` là xem được live feed
- **Nối lại WS không resync** — `use-gala-ws.ts:26-30` reconnect mỗi 2s nhưng không invalidate query → bảng lệch âm thầm, không chỉ báo kết nối
- **Dialog cấu hình admin luôn hiện mặc định cứng** `"Gala Dinner"/"Sân khấu"/60/30` (`gala-admin-panel.tsx:38-40`) — mở ra bấm Lưu là **ghi đè ngược** turn duration thật
- **Bốc thăm một lần duy nhất**, không reset được, không confirm trước khi bốc (`:234-238`)
- **Không có nút công bố/mở-đóng chọn ghế** — `GalaConfig.status` chỉ đổi như tác dụng phụ của draw/start/skip
- Ghế 28×28px (`SEAT_SIZE`), sàn cố định `min 640×380` trong khung `max-w-3xl` → điện thoại cuộn ngang, không zoom, không `aria-label`
- `confirm_seat` đếm quota **không lọc event** (`services/gala/gala_service.py:288-292`) → sang event thứ 2 là sai
- `PATCH /tables/{id}` đổi `seat_count` nhưng **không thêm/xoá `gala_seats`** (`routers/gala.py:119-137`)

### 3.5 Module 5 — My Journey (BRD §9)

Backend trả đủ 7 khối, gate `information_published` đúng (`journey_service.py:26-49`).

FE bỏ sót: `arrive_at` (`journey/page.tsx:92-110`), `bus.note`, `bus.destination`, `end_at` của lịch
trình; `body_md` render **thô** (markdown hiện nguyên `**bold**`, `:82`); không nhóm lịch theo ngày,
`day_date` in 2 lần hoặc không in; SĐT trưởng xe không `tel:`; không có placeholder "chiều về chưa phân
bổ"; lỗi 500 hiện thành "Hành trình chưa sẵn sàng" kèm chuỗi tiếng Anh `Request failed: 500` từ
`lib/api.ts:64`; không có nút thử lại (`retry: false`).

### 3.6 §10 Admin Dashboard & quản lý dữ liệu

- Chỉ số BRD yêu cầu: tổng CBNV, đã/chưa ĐK, theo Ca, nhu cầu xe theo chặng, slot bay — **đủ**
- "Tình trạng phân bổ xe/phòng" — `Đã lên xe: 47` **không mẫu số**; phòng `120/300 chỗ` (trộn người với
  chỗ). Không card nào link tới màn hình xử lý (`app/admin/page.tsx:131-140`)
- Dashboard bị **copy nguyên si** sang `app/admin/events/[id]/page.tsx:32-95` — 2 bản phải đồng bộ tay
- **"Tất cả danh sách cần tìm kiếm, lọc, sắp xếp và export"** — **sắp xếp: 0/11 màn hình**. Events,
  Master Data, Users, danh sách phân bổ, audit đều không search/filter. Export thiếu ở events/master-data/users
- **Export đăng ký bỏ qua filter đang bật** — `registrations-table.tsx:57-70` không gửi query string,
  `routers/registrations.py:246` gọi `_admin_list_query(db, event_id, None, None)`. Lọc Ca 2 + Team X
  rồi Export ra **toàn bộ event**. Sai dữ liệu âm thầm.
- Màn hình Đăng ký **không xoá được filter** (không "Tất cả", không nút Xoá lọc) → chọn nhầm là kẹt, phải F5
- Không có màn hình **ai chưa đăng ký** — dashboard đếm được nhưng không liệt kê để đi nhắc

### 3.7 §12 Trạng thái chương trình

Luồng chuyển trạng thái đúng (`services/event_service.py:19-51`, super_admin ghi đè được). Nhưng:

- **Không có confirm nào.** Một click "Chuyển sang: Đã công bố" là bắn `send_bulk_emails_task` cho toàn
  công ty (`routers/events.py:186`) — không hỏi, không hiện "N người sẽ nhận email", không undo
  (`event-workspace.tsx:95`)
- **Trạng thái không gate gì cả.** Grep toàn backend: chỉ `registration_service.py:26` và
  `journey_service.py:37` check status. Chạy phân bổ khi đang mở đăng ký được, import chuyến bay vào
  event đã kết thúc được, sửa điều khoản sau khi công bố được
- Không có checklist tiền-công-bố (còn ai chưa có chuyến/xe/phòng? xe nào chưa có trưởng xe?)

### 3.8 §13 Yêu cầu kỹ thuật

- Single Source of Truth — OK · Configurable (không hardcode) — **OK, điểm mạnh nhất của hệ thống**
- Audit Log — ghi đủ vào DB, **không đọc ra được**; cột `ip` (`models/audit.py:21`) không bao giờ được ghi
- Data validation — thiếu unique cho `flights`/`buses`/`rooms`/`gala_tables`; `employee_ids` không
  validate → FK violation nổ thành **500** (`routers/flights.py:314`, `buses.py:187`, `room_assignments.py:110`)
- Phân quyền — **có rò**:
  - `GET /employees` là `CurrentUser` (`routers/employees.py:84-95`) → mọi user đăng nhập xem được toàn
    bộ danh bạ nhân sự (tên, email, team, site, SĐT)
  - `GET /schedule-items` (`routers/schedule.py:29`) trả cả mục **chưa publish** cho mọi user
  - `GET /announcements` (`routers/schedule.py:78`) trả cả bản nháp
  - WS Gala không auth (xem §3.4)
- Responsive — OK phần shell CBNV (bottom nav, `max-w-3xl`); **chưa OK** sơ đồ Gala và bảng 5 cột Team

### 3.9 Lỗi gốc dùng chung

`apps/api/app/services/master_data.py:53-56`:

```python
async def update[ModelT](db, instance, data: dict) -> ModelT:
    for key, value in data.items():
        if value is not None:          # <-- đây
            setattr(instance, key, value)
```

Routers **đã** truyền `model_dump(exclude_unset=True)` đúng cách, nên dòng `if value is not None` là
**nguyên nhân duy nhất** khiến **mọi** PATCH trong hệ thống không xoá được field: xoá trống Điểm đến /
Mô tả / Ngày / SĐT trưởng xe → hiện toast xanh "Đã lưu" và **không có gì thay đổi**.
Sửa 1 dòng, hết cho tất cả caller.

---

## 4. Quyết định phạm vi (đã chốt với chủ dự án)

| Hạng mục | Quyết định |
|---|---|
| UI/UX | **Thiết kế lại toàn bộ** — design system, component, luồng màn hình CBNV + Admin |
| Chat RAG (`/chat`) | **Giữ nguyên, không đầu tư.** Không có trong BRD gốc. Sẽ thiết kế lại sau khi tham khảo repo ragflow. Đợt này chỉ chuẩn hoá màu/nhãn cho khỏi lạc lõng |
| Dữ liệu demo | **Seed đầy đủ, nhiều kịch bản** |
| Cách triển khai | **Chia phase, commit từng phase** |
| Import/Export | **XLSX**, không làm CSV (BRD §10 để ngỏ "Excel/CSV"). Export audit log giữ CSV vì là log, không phải bảng nghiệp vụ |

---

## 5. Lộ trình R0–R6

Mỗi phase kết thúc bằng trạng thái **chạy được end-to-end**, tick checklist dưới đây, điền mục
"Đã kiểm chứng", rồi commit.

### R0 — Seed thật (mở khoá mọi thứ còn lại)

**Mục tiêu:** sau `make seed`, mọi màn hình CBNV + Admin có dữ liệu thật để nhìn, không còn màn hình trống.
**Xong là nhìn thấy gì:** login `nv002@teambuilding.vn` → `/journey` hiện đủ 7 khối có dữ liệu thật
(bay 2 chiều có giờ, xe có điểm tập trung, phòng, ghế Gala, lịch trình nhiều mục có giờ).

File: `apps/api/app/db/seed.py` (viết lại toàn bộ, hiện 115 dòng).

- [x] Thêm CLI flag `--reset`: xoá toàn bộ dữ liệu nghiệp vụ (giữ schema) trước khi seed, vì bản hiện
      tại chỉ `return` sớm nếu đã có `admin@teambuilding.vn` (dòng 37-40)
- [x] Site: giữ HN/HCM
- [x] Team: giữ 8 team hiện có (TEAM_DEFS)
- [x] Employee: giữ 120 người, cách sinh tên giữ nguyên
- [x] **Event A `TB2026`**, trạng thái cuối = `information_published`:
  - [x] 2 `shifts`: Ca 1, Ca 2 (`depart_after_time="17:00"`)
  - [x] **4 `transport_legs`** đúng BRD §7.1: `HN_SB`/`SB_HN` (hoặc theo site làm việc), `SB_KS`, `KS_SB`
        — đặt `direction` nhất quán với dữ liệu bus/journey dùng
  - [x] `pickup_points`: ít nhất 2 điểm mỗi site (VD "Toà nhà A - Hà Nội", "Toà nhà B - Hồ Chí Minh"),
        gắn đúng `site_id`
  - [x] 6 `flights`: 3 chiều đi (2 ca) + 3 chiều về, **có `depart_at`, `arrive_at`, `origin`, `destination`
        thật** (không để NULL như hiện tại), tổng capacity ≥ số người `is_participating=true`
  - [x] `hotels`: 1-2 khách sạn có `address`, `checkin_date`, `checkout_date`; `room_types` + đủ `rooms`
        (capacity đủ cho số người tham gia)
  - [x] `buses`: mỗi leg 2-3 xe, **bắt buộc có `gather_at`, `depart_at`, `pickup_point_id`, `destination`,
        `leader_name`, `leader_phone`** — đây là field BTC hiện không nhập được qua Admin, seed phải set
        thẳng vào DB để chứng minh journey render đúng khi có dữ liệu
  - [x] `gala_configs` + ~15 `gala_tables` × 8 ghế (đủ chỗ cho registration tham gia)
  - [x] `schedule_items`: ~12 mục trải 3 ngày, có `day_date`, `start_at`, `end_at`, `location`, `is_published=true`
  - [x] `announcements`: 3 mục, 1 pinned
  - [x] `registrations`: ~100/120 CBNV `submitted`, một vài `is_participating=false`, một vài có `wish_note`
  - [x] Gọi thật `run_flight_allocation` + `run_bus_allocation` (import trực tiếp, không qua ARQ) rồi gán
        `room_assignments` thủ công cho người có phòng
  - [x] **Cố ý để lại vài ca `is_flagged=true`** (giảm capacity 1 chuyến để thiếu slot) — để BTC có ca
        thật để xử lý, đúng tinh thần BRD §5.3
  - [x] Confirm một phần ghế Gala (vài team) để Journey có gì để hiện, để lại vài team `pending` để test
        luồng chọn ghế
- [x] **Event B `TB2027`**, trạng thái `registration_open`:
  - [x] `registration_open_at` = giờ hiện tại trừ 1 ngày, `registration_close_at` = +14 ngày
  - [x] Cấu hình ca/chặng/điểm đón giống Event A (copy config, không copy registrations)
  - [x] **0 đăng ký** — để thử trọn luồng CBNV từ đầu
- [x] Cập nhật danh sách tài khoản in ra cuối script + README nếu số liệu thay đổi

**Nghiệm thu:**
```bash
make down && rm -f data/teambuilding.db* && make up && make migrate
docker compose exec api python -m app.db.seed
```
Kiểm bằng SQL: 2 `events`, `transport_legs` = 4 (mỗi event), `pickup_points` > 0, `flights` có
`depart_at`/`origin`/`destination` khác NULL cho cả outbound và inbound, `gala_seats` ≥ số người tham gia
Event A, `buses.gather_at`/`pickup_point_id` khác NULL.

**Đã kiểm chứng:** viết lại toàn bộ `apps/api/app/db/seed.py` (115 → ~400 dòng). Chạy
`docker compose exec api python -m app.db.seed --reset` sạch, không lỗi. `ruff check` sạch, `pytest`
29/29 pass (không phải test mới, chỉ xác nhận không phá vỡ gì). Kiểm SQL trực tiếp trên
`data/teambuilding.db` sau seed: 2 events (TB2026 `information_published`, TB2027
`registration_open`), 4 `transport_legs` mỗi event, 4 `pickup_points`, 6 `flights` cả 2 chiều đều có
`depart_at`/`origin`/`destination`, 12 `buses` đều có `gather_at`+`leader_name`+`leader_phone` (6/12 có
`pickup_point_id` — đúng, chặng sân bay↔khách sạn không có "điểm đón" master data), 120 `gala_seats`
(61 đã confirmed cho 5/8 team, 1 team đang "active", 2 team "waiting" — để test luồng chọn ghế thật ở
R4/R6), 105/120 đăng ký (97 tham gia), phân bổ bay/xe chạy thật qua `run_flight_allocation`/
`run_bus_allocation` (có `is_flagged=true` ở cả 2 chiều — nhiều hơn dự kiến ban đầu vì thuật toán greedy
hiện tại tách Team ngay cả khi tổng slot đủ nhưng phân mảnh giữa các chuyến, đúng bug đã ghi ở mục 3.2,
sẽ giảm sau khi sửa `_score` ở R1), 90 `room_assignments`, 12 `schedule_items` đủ giờ/ngày, 3
`announcements`. Gọi thật `GET /api/journey/me` cho `nv009@teambuilding.vn` (nhân viên thường, không
phải leader) qua curl — trả đủ 7 khối, không thiếu trường nào (xem log phiên làm việc). `GET
/api/events/current` trả đúng Event B cho luồng đăng ký từ đầu.
Sửa phát sinh trong lúc kiểm: bus "XE-HCM1"/"XE-HCM2" lúc đầu ghi đích đến "Sân bay Tân Sơn Nhất"/"Văn
phòng Hồ Chí Minh" — vô lý vì cả 6 chuyến bay đều là Hà Nội↔Đà Nẵng (seed không mô hình multi-origin
theo site); đổi lại thành hub Hà Nội chung, giữ nguyên các điểm đón HCM để vẫn có nhiều điểm đón cho
CBNV chọn. Đổi ví dụ tài khoản "employee" trong README/print từ `nv002` sang `nv009`, vì logic
team_leader mới (1 leader/team = nhân viên đầu tiên của mỗi team) khiến `nv001`..`nv008` đều là leader.

---

### R1 — Sửa lỗi gốc backend

**Mục tiêu:** vá đúng nguyên nhân gốc (không vá từng caller), đóng lỗ hổng quyền, thêm test route thật.
**Xong là nhìn thấy gì:** PATCH xoá field hoạt động ở mọi màn hình; `/employees` từ chối role `employee`;
import chuyến bay 2 lần không nhân đôi; test suite có test HTTP thật.

- [x] **`services/master_data.py:53-56`** — bỏ điều kiện `if value is not None`, set thẳng mọi key
      trong `data` (routers đã dùng `exclude_unset=True` nên an toàn)
- [x] **`services/allocation/greedy.py`** (`_score`, dòng 4-7):
  - [x] Thêm điểm `team_together`: đếm số thành viên cùng `team_id` đã có mặt ở `flight` đó (`weights["team_together"]`)
  - [x] Dùng `split_penalty` để trừ điểm phương án phải tách Team so với phương án giữ nguyên khối
  - [x] Flag `shift_mismatch` **cả khi Team lọt nguyên khối** vào chuyến sai ca đa số (nhánh dòng 24-30),
        không chỉ ở nhánh tách (dòng 52-53)
  - [x] Cập nhật `apps/api/tests/test_allocation_greedy.py` cho 2 case trên (+ 1 case phát sinh: flag
        `null`-safety khi `flight.shift_id is None`, xem "Đã kiểm chứng")
- [x] **`services/gala/gala_service.py:288-292`** — thêm điều kiện lọc theo `event_id` (join `GalaTable`)
      vào query đếm quota đã confirm
- [x] **`routers/gala.py:119-137`** (`update_table`) — khi `seat_count` thay đổi, thêm/xoá `GalaSeat` cho
      khớp (thêm số ghế mới với `status=available`; chặn giảm nếu có ghế `confirmed`/`held` trong phần bị cắt)
- [x] **`routers/gala.py:305-313`** (`gala_ws`) — thêm xác thực: đọc token qua query param hoặc cookie,
      decode giống `core/deps.py`, đóng kết nối 4401 nếu không hợp lệ hoặc không có quyền xem event đó
- [x] **`routers/employees.py:84-95`** (`list_employees`) — đổi `_user: CurrentUser` → `_user: AdminUser`
- [x] **`routers/schedule.py:29,78`** — `list_schedule_items`/`list_announcements`: nếu `user.role` không
      phải admin, lọc `is_published=True` / `published_at is not None` (dùng lại điều kiện
      `journey_service.py:141,158`)
- [x] **Migration mới** (`alembic revision --autogenerate -m "unique constraints"`):
  - [x] `flights`: unique `(event_id, flight_code)`
  - [x] `buses`: unique `(event_id, leg_id, code)`
  - [x] `rooms`: unique `(hotel_id, room_number)`
  - [x] `gala_tables`: unique `(event_id, code)`
  - [x] Trước khi thêm index: viết bước dọn trùng nếu DB hiện tại có vi phạm (kiểm bằng `GROUP BY … HAVING count(*) > 1`)
- [x] **`routers/flights.py` import** (`~:86-147`) — đổi từ insert thuần sang upsert theo `flight_code`
      (update nếu đã tồn tại trong event, insert nếu chưa)
- [x] **Validate ID thuộc đúng event** trước khi ghi, trả `AppError` 400 thay vì để FK violation rơi
      xuống 500:
  - [x] `routers/flights.py:314` (`employee_ids` trong adjust) — check `Registration` tồn tại + event khớp
  - [x] `routers/buses.py:187` — tương tự
  - [x] `routers/registrations.py:96` — `shift_id`/`leg_id`/`pickup_point_id` phải thuộc `event_id` hiện tại
  - [x] `routers/room_assignments.py:110` — `employee_id` phải có đăng ký `submitted` trong event
- [x] **Gate theo trạng thái event**:
  - [x] `POST /allocations/flight`, `POST /allocations/bus` (`flights.py:225`, `buses.py:103`) — yêu cầu
        `event.status in {registration_closed, allocation_processing}`, nếu không trả `AppError`
        `invalid_event_status` 400 (`assert_allocation_allowed` mới trong `event_service.py`)
  - [x] ~~Ghi dữ liệu nghiệp vụ (flights/buses/hotels/rooms/gala/schedule mutations) bị chặn khi
        `event.status == event_completed`~~ — làm cho **flights** (create/update/import/adjust) và
        **buses** (create/update/adjust) và **schedule** (create/update item) qua `assert_event_not_completed`
        mới. **Chưa làm** cho hotels/rooms/gala config/tables/announcements — những endpoint đó chưa từng
        fetch `Event` nên cần thêm 1 query nữa mỗi chỗ; để lại làm follow-up khi đụng tới các router đó ở R5
        (không muốn mở rộng 20+ endpoint trong 1 lần sửa chỉ để thêm 1 check)
  - [x] Thao tác ghế Gala (`hold`/`confirm`) yêu cầu `gala_configs.status` đang mở chọn — **đã đúng sẵn**,
        không cần sửa: `get_active_turn` chỉ trả về turn khi có `status="active"`, và turn chỉ "active" khi
        config đang "drawing"/"in_progress" (xem `_activate_next_waiting`/`start_turn`); `hold_seat`/
        `confirm_seat` đã raise `not_your_turn` khi không có active turn, tức khi config là `setup` hoặc
        `finished` thì mọi thao tác ghế đã bị chặn từ trước
- [x] **Email timing** — `services/notification/email_service.py:118` (`enqueue_email`) chuyển việc
      `queue.enqueue_job` ra **sau** `db.commit()` ở mọi call site (`registrations.py`, `flights.py`,
      `buses.py`, `worker/tasks/notifications.py`). Tách thành `enqueue_email` (chỉ ghi DB, trả `outbox_id`)
      + `dispatch_email`/`dispatch_emails` (gọi sau khi đã `commit`). `schedule.py`/`events.py` không cần
      sửa — chúng chỉ `queue.enqueue_job("send_bulk_emails_task", ...)`, và task đó tự `enqueue_email`+
      `commit`+`dispatch` đúng thứ tự bên trong worker
- [x] **Dedupe key đăng ký** — `registrations.py:156` bỏ `submitted_at` khỏi dedupe key (dùng
      `registration.id` là đủ) để sửa-rồi-submit-lại không bắn thêm mail
- [x] **Audit mở rộng**:
  - [x] Ghi `ip` thật trong `record_audit` — **không** truyền `Request` qua từng call site (~20 chỗ); thay
        vào đó thêm `core/request_context.py` (ContextVar) + middleware `capture_client_ip` trong
        `main.py` set nó mỗi request, `record_audit` tự đọc — 0 call site nào phải đổi signature
  - [x] Thêm `record_audit` cho: Gala draw/turn start/turn skip/seat block-unblock/seat confirm,
        registration submit/cancel
- [x] **`AdjustAssignmentRequest`** (`schemas/flight.py`, tương tự bus) — thêm field `team_id: int | None`;
      khi có `team_id`, service tự lấy toàn bộ `employee_ids` của Team đó trong event thay vì bắt buộc
      FE liệt kê từng người (`routers/flights.py`/`buses.py` adjust endpoint đọc field mới)
- [x] **`journey.py:36`** — null-check `employee` trước khi gọi `build_journey`, trả 404 rõ ràng thay vì 500

**Test mới** (`apps/api/tests/conftest.py` — hiện chưa tồn tại):
- [x] Fixture `AsyncClient` (httpx) chạy app với DB sqlite in-memory riêng mỗi test (`StaticPool` giữ 1
      connection chung cho cả engine, `get_db`/`get_queue` override qua `app.dependency_overrides`)
- [x] Fixture tạo nhanh: event, employee+user theo từng role, registration submitted (`world` fixture +
      helper `make_employee`)
- [x] Test RBAC: `/employees` list 403 với `employee`, 200 với `organizer` (`test_routes_rbac.py`)
- [x] Test luồng đăng ký: submit thiếu terms → 400; sau `registration_closed` → PUT bị chặn
      (`test_routes_registration.py`)
- [x] Test adjust vượt sức chứa → 409 `over_capacity`; kèm `force=true` → 200 + audit log có `reason`
      (`test_routes_flight_adjust.py`, thêm cả case `invalid_employee_ids`)
- [x] Test journey: chưa `information_published` → 404; sau publish → 200 đủ field (`test_routes_journey.py`)
- [x] Test allocation: chạy xong có `AllocationRun.summary_json` đúng cấu trúc, `flight_assignments` khớp
      capacity từng chuyến (`test_allocation_runner.py`, gọi thẳng `run_flight_allocation` — HTTP endpoint
      chỉ enqueue ARQ job, test hành vi thật ở tầng service như `test_allocation_greedy.py` đã làm)

**Nghiệm thu:**
```bash
docker compose exec api ruff check .
docker compose exec api pytest -v
```
Kết quả: `ruff check` sạch. `pytest` **43 passed** (29 gốc + 4 test greedy mới + 10 test route/service mới).

Thủ công (curl thật, không chỉ đọc code):
- `PATCH /api/events/2` với `{"destination": null}` → response trả `"description": null` thật — field
  bị xoá đúng như mong đợi (trước R1: giữ nguyên giá trị cũ, báo "đã lưu" giả)
- `GET /api/employees` với token `employee` → `403`; với token `organizer` → `200`
- Import cùng 1 file `.xlsx` chứa `VNTEST1` **2 lần liên tiếp** → cả 2 lần `ok_rows: 1`, nhưng
  `SELECT count(*) FROM flights WHERE flight_code='VNTEST1'` vẫn là **1** (trước R1: sẽ là 2)
- Đăng ký thật qua `nv020@teambuilding.vn` (Event B) → **1 email** tới MailHog; gọi lại `/submit` lần 2
  (sửa-rồi-nộp-lại) → **vẫn 1 email** trong MailHog (dedupe key theo `reg.id` hoạt động)
- `PATCH /api/events/2` (bất kỳ) → `audit_logs.ip` ghi đúng IP client (`172.20.0.1` khi gọi từ host qua
  cổng expose) — middleware + contextvar hoạt động mà không phải sửa router nào
- Gala WS: kết nối không kèm `?token=` → server từ chối handshake (`connection rejected (403 Forbidden)`
  trong log uvicorn — `websocket.close()` trước khi `accept()` khiến uvicorn trả 403 ở tầng HTTP upgrade
  thay vì một WS close frame có code, nhưng thuộc tính cần bảo vệ — client không có token không kết nối
  được — đã đúng); kèm `?token=<jwt hợp lệ>` → kết nối thành công

**Phát hiện thêm trong lúc kiểm thử (không có trong checklist gốc, sửa luôn vì test mới bắt được):**
Sau khi sửa `_score` để flag `shift_mismatch` ở cả nhánh whole-fit, một test allocation ở tầng service
(`test_allocation_runner.py`) phát hiện: chuyến bay **không có `shift_id`** (đúng thực tế của mọi chuyến
bay **chiều về**, vì BRD chỉ có khái niệm Ca cho chiều đi) khiến **100% người được xếp vào đó bị flag
`shift_mismatch` oan** (vì `candidate.shift_id != None` luôn đúng). Đây chính là nguồn gốc con số
"24 người bị flag ở chiều về" quan sát được lúc kiểm chứng R0 — không phải một chuyến thiếu slot, mà
mọi người rớt vào nhánh tách Team đều bị gắn cờ sai. Thêm hàm `_is_shift_mismatch(candidate, flight)`
bỏ qua so khớp khi `flight.shift_id is None`. Seed lại sau fix: **chiều về 0/97 bị flag** (đúng), **chiều
đi 42/97 bị flag** — con số này giờ phản ánh đúng tình trạng thiếu slot Ca 2 thật (chuyến Ca 2 chỉ có 22
chỗ trong khi ~32 người chọn Ca 2), không phải lỗi thuật toán.

---

### R2 — Design system + nền UI dùng chung

**Mục tiêu:** dựng đủ component nền để R3–R5 chỉ còn việc lắp ráp, không viết lại từ đầu mỗi màn hình.
**Xong là nhìn thấy gì:** không còn `<input type="checkbox">` trần nào trong repo; mọi nhãn tiếng Việt
nhất quán; 1 bảng dùng chung có sort/filter/export chạy được trên ít nhất 1 màn hình thật (Employees).

- [x] Thêm shadcn primitive còn thiếu vào `apps/web/src/components/ui/`: `checkbox.tsx`,
      `radio-group.tsx`, `skeleton.tsx`, `alert.tsx`, `alert-dialog.tsx`, `tooltip.tsx`, `popover.tsx`
      (dùng `npx shadcn add …` trong container web hoặc copy pattern các file `ui/*` hiện có)
- [x] Thay mọi `<input type="checkbox">` trần bằng `<Checkbox>`:
      `register/page.tsx:216,266,324`, `flight-allocation-panel.tsx:443`, `bus-allocation-panel.tsx:339`
      (cặp radio Có/Không tham gia ở dòng 216 cũng đổi sang `<RadioGroup>` luôn, cùng vấn đề)
- [x] Dẹp `text-zinc-*` literal trong `apps/web/src/app/admin/**` về token (`text-muted-foreground` …)
      — toàn bộ chỉ là `text-zinc-500`, sed 1 lệnh cho 13 file
- [x] **`components/domain/data-table.tsx`** (mới) — cột khai báo qua `DataTableColumn<T>[]`
      (`key`/`header`/`cell`/`sortValue?`/`className?`), click-header để sort (client-side, có mũi tên
      lên/xuống), phân trang tuỳ chọn (`pageSize`, client-side). **Lệch so với mô tả gốc:** không tự
      có ô tìm kiếm/filter/export bên trong — nhận `toolbar` (ReactNode) để màn hình cha tự quản search/
      filter, vì nhiều màn hình lọc **server-side** (query param) và nút Export phải gửi đúng filter đó;
      để DataTable tự giữ state search sẽ lệch khỏi request Export thật. `entity-crud-table.tsx` **chưa
      xoá** — vẫn dùng cho Master Data/Settings, sẽ thay dần khi R5 chạm tới từng màn hình đó
- [x] **`components/domain/confirm-dialog.tsx`** (mới) — `<ConfirmDialog trigger title description
      confirmLabel onConfirm>`, dùng `AlertDialog` (Base UI) bên dưới, tự quản `pending`/đóng dialog
      sau khi `onConfirm` xong
- [x] **`components/domain/job-progress.tsx`** (mới) — nhận `jobId`, tự poll `GET /api/jobs/{id}`, hiện
      thanh tiến trình `progress/total` + trạng thái; tái dùng pattern đã có ở
      `admin/employees/page.tsx`. **Lược bớt:** không có nút huỷ theo dõi riêng — `refetchInterval` tự
      dừng khi job `succeeded`/`failed`, không có job nào chạy vô hạn để cần huỷ
- [x] **`components/domain/status-badge.tsx`** (mới, tên thật `EventStatusBadge`) — map `EventStatus` →
      1 trong 3 `Badge` variant (default/secondary/outline) + nhãn Việt từ `lib/event-status.ts`
- [x] **`components/domain/empty-state.tsx`** — thêm `variant="error"` (icon cảnh báo, tiêu đề màu đỏ)
      + `onRetry` (nút "Thử lại"), biến thể rỗng cũ vẫn là mặc định, không phá API cũ
- [x] **`lib/labels.ts`** (mới) — `direction`, `source` (auto/manual/import), `flag_reason`, job
      `status`/`type`, audit `action`/`entity_type` (đủ 24 giá trị grep được từ backend), Gala
      `config.status`/turn `status`/seat `status`. Mỗi map có hàm `xxxLabel(key)` riêng thay vì 1 hàm
      `label(map, key)` chung — gọi `directionLabel(x)` rõ ràng hơn `label(directionMap, x)` tại chỗ dùng;
      đều fallback về key gốc (hoặc "—" khi rỗng), không bao giờ throw
- [x] **`lib/api.ts`** — `tryRefresh` giờ dùng 1 `refreshPromise` dùng chung (6 request 401 cùng lúc chỉ
      gọi `/auth/refresh` đúng 1 lần); `fetchWithTimeout` bọc mọi `fetch` (trừ `apiChatStream` — stream SSE
      cố ý không đặt timeout cố định) bắt `AbortError`/lỗi mạng thành `ApiError` tiếng Việt, timeout mặc
      định 15s; thông điệp fallback đổi từ `Request failed: {status}` sang tiếng Việt
- [x] **`lib/providers.tsx`** — `staleTime: 30_000` mặc định; `QueryCache.onError` bắn toast chung, bỏ
      qua khi query có `meta.silent` (cơ chế opt-out cho màn hình đã tự hiện lỗi inline — **chưa** gắn
      `meta.silent` vào query nào cả, để R3-R5 tự thêm khi chạm tới từng màn hình, tránh sửa lan man
      ngoài phạm vi R2)

**Nghiệm thu:**
```bash
docker compose exec web npx tsc --noEmit
docker compose exec web npm run lint
```
Cả 2 sạch. `apps/web/package.json`/`package-lock.json` không đổi (mọi primitive Base UI cần đều đã có
sẵn trong `@base-ui/react`, không phải cài thêm gói nào).

**`/admin/employees` đã chuyển sang dùng `DataTable`** làm màn hình chứng minh cụ thể: cột Mã NV/Họ tên/
Email/Team/Địa điểm có thể click để sort (client-side trên trang 50 dòng hiện tại), khối import dùng
`JobProgress` thay vì dòng chữ tĩnh cũ. Search/filter/export/phân trang **giữ nguyên logic server-side
đã có** (đây vốn là màn hình tốt nhất trong audit, không cần viết lại phần đó).

**Đã kiểm chứng:** `ruff`/`pytest` không đổi vì R2 không đụng backend (32→43 test vẫn pass, xem R1).
`tsc --noEmit` và `next lint` sạch sau toàn bộ thay đổi. `grep` xác nhận 0 `type="checkbox"`/`type="radio"`
trần còn lại trong `src/`, 0 `zinc-` còn lại trong `admin/**`+`components/domain/**`. Seed lại
(`--reset`) chạy sạch, `docker compose up` cả 5 service (thêm `mailhog`/`web`) lên khoẻ mạnh, `curl` xác
nhận `/login` và `/admin/employees` trả 200.
**Chưa click-through trình duyệt thật** — Chrome extension (`claude-in-chrome`) không kết nối được
trong môi trường sandbox này (`tabs_context_mcp` báo "Browser extension is not connected"). Đây đúng là
việc mà audit đã chỉ ra là nguyên nhân gốc của toàn bộ đợt làm lại này, nên **không** giả vờ đã làm khi
chưa làm được: cần người dùng hoặc phiên có Chrome extension kết nối, mở `/admin/employees`, thử sort
theo cột, filter, export bằng mắt thật trước khi coi bước này là xong hoàn toàn. Việc này nên làm ngay
khi có điều kiện, và bắt buộc phải làm trước R6.

---

### R3 — Portal CBNV

**Mục tiêu:** sửa toàn bộ finding ở audit §3.1 (Đăng ký) + §3.5 (Journey) + Team leader + Shell +
Login/Account, dùng component từ R2.
**Xong là nhìn thấy gì:** CBNV đăng ký xong thấy màn hình tóm tắt rõ ràng; sau khi đóng đăng ký vẫn xem
lại được đăng ký của mình; Journey hiện đủ dữ liệu R0 đã seed, không thiếu trường nào.

**`app/(employee)/register/page.tsx`:**
- [x] Đổi radio Có/Không, checkbox xe, checkbox điều khoản sang `<RadioGroup>`/`<Checkbox>` (R2)
- [x] Bắt buộc: `shiftId` khác null, SĐT không rỗng, mỗi leg tick "cần xe" phải có `pickup_point_id`
      — cập nhật điều kiện `canSubmit`
- [x] Gộp SĐT vào chính state form — `ProfileCard` thêm prop `controlledPhone` (bỏ cơ chế "Sửa/Lưu"
      riêng chỉ trên trang này, `account/page.tsx` vẫn giữ inline-edit cũ); submit 1 lần: PATCH SĐT
      (chỉ nếu đổi) → PUT registration → POST submit
- [x] Terms: `/terms` lỗi → hiện `EmptyState variant="error"` ngay dưới form thay vì ẩn checkbox câm;
      không tự tick `agreed` nữa nếu `registration.terms_version !== terms.terms_version` — **cần thêm
      field mới**: `RegistrationOut`/`Registration` (FE+BE) trước đó không có `terms_version` dù model
      đã lưu, phải thêm để so sánh được
- [x] Nhóm bus legs theo `direction` (Chiều đi / Chiều về / Chặng khác), `EmptyState` dạng text khi
      `legs.length === 0`
- [x] Lọc `pickupPoints` theo site — cần gọi thêm `GET /api/employees/me` (đã có sẵn, chưa ai gọi ở
      trang này) để lấy `site_id` của CBNV
- [x] Màn hình "Đăng ký thành công": tóm tắt Ca + các chặng xe đã chọn + "Đã gửi email xác nhận tới {email}"
- [x] Hiện `event.registration_close_at` trong banner
- [x] **Xem lại đăng ký sau khi đóng cổng** — cần thêm endpoint backend mới `GET /api/registrations/me`
      (unscoped, không tự tạo draft) vì trước đó không có cách nào tìm registration khi không còn
      `event_id` từ `/events/current`. Trang giờ dùng `readOnly` prop: còn `registration_open` → form
      sửa được như cũ; đóng rồi → hiện đúng dữ liệu đã gửi, mọi input `disabled`, ẩn nút Gửi/Huỷ
- [x] Thay `window.confirm` bằng `<ConfirmDialog>` có `<Textarea>` lý do (không bắt buộc), gửi `reason`
- [x] Tách `error` khỏi `isLoading` — lỗi thật (`registrationError`) hiện `EmptyState variant="error"`
      thay vì treo vĩnh viễn ở "Đang tải form đăng ký..."

**`app/(employee)/journey/page.tsx`:**
- [x] Thêm giờ đến (`arrive_at`) cạnh giờ đi mỗi chuyến bay + ghi chú "chưa có chuyến về" khi chỉ có 1 chiều
- [x] Hiện `bus.note`, `bus.destination`
- [x] `components/domain/lite-markdown.tsx` (mới) — bold/italic/link/bullet qua regex, không thêm
      dependency, dùng cho `announcement.body_md`
- [x] Nhóm `schedule` theo `day_date`, hiện `end_at` cạnh `start_at`
- [x] SĐT trưởng xe bọc `<a href="tel:...">`
- [x] Nút làm mới (icon xoay khi `isFetching`) + "Cập nhật lúc {time}" (`dataUpdatedAt` của react-query)
- [x] Tách lỗi 404 `no_published_event` (empty state thật, có link sang `/register`) khỏi lỗi mạng/500
      (`EmptyState variant="error"` + nút Thử lại) — không còn hiện `error.message` tiếng Anh thô
- [x] *Ngoài checklist, cùng gốc:* link "Xem sơ đồ Gala" trước đây chỉ hiện khi đang `drawing`/
      `in_progress` — sau khi bốc thăm xong (`finished`) CBNV mất luôn đường vào xem chỗ ngồi của mình;
      đổi thành hiện bất cứ khi nào `journey.gala` tồn tại

**`app/(employee)/team/page.tsx`:**
- [x] Thêm cột Email, SĐT vào bảng roster
- [x] Search theo tên/mã NV (filter tại chỗ, feed vào `DataTable` mới của R2 — cũng đổi luôn sang
      `DataTable` cho có sort, thay vì thêm mỗi ô tìm kiếm rời rạc)
- [x] Sửa `if (!data) return null` → `EmptyState`
- [x] Ẩn nút "Chọn ghế Gala" khi chưa cấu hình Gala — gọi thẳng `GET /gala/config` thay vì dựa vào
      `useEmployeeEvent().galaStatus` (giá trị đó chỉ có sau khi `journey` được publish, tức luôn `null`
      trong giai đoạn BTC đang tổ chức bốc thăm/chọn ghế — đúng lúc leader cần thấy nút này nhất)

**`components/domain/employee-shell.tsx`:**
- [x] Ẩn tab "Đăng ký" khi không có event `registration_open` **và** CBNV chưa từng có registration nào
      (dùng chung endpoint `/registrations/me` mới)
- [x] Ẩn tab "Gala" khi chưa có `gala_configs` cho event hiện tại
- [x] Banner nhỏ dưới header hiện `EventStatusBadge` (R2) — **sửa luôn 1 bug phát sinh**: variant
      `"outline"` của Badge chỉ có viền + `text-foreground`, vô hình trên nền `--night` tối; đổi
      `draft`/`event_completed` sang `"secondary"` (pill có nền, luôn đọc được trên mọi nền)
- [x] `aria-current="page"` cho link active (cả desktop lẫn bottom nav mobile), `aria-label` cho cả 2 `<nav>`

**Login/Account:**
- [x] `app/(auth)/login/page.tsx` — lỗi hiện inline (`role="alert"`) thay vì chỉ toast; nút hiện/ẩn mật
      khẩu; dòng "Quên mật khẩu? Liên hệ BTC"
- [x] `app/(employee)/account/page.tsx` — employee cũng được điều hướng tiếp (`/`) sau đổi mật khẩu
      **bắt buộc**; đổi mật khẩu tự nguyện (không bị ép) thì ở lại trang — cờ `wasForced` truyền qua
      `mutation.mutate(wasForced)` thay vì đọc lại từ closure, để tránh phụ thuộc thời điểm re-render

**Việc phát sinh ngoài checklist gốc (cùng nằm trong phạm vi R3):**
- Thêm `GET /api/registrations/me` (BE, `routers/registrations.py` — router mới `me_router`, nối ở
  `main.py`) + `terms_version` trong `RegistrationOut`/`Registration` (FE) — bắt buộc phải có để 2 mục
  "xem lại sau khi đóng" và "không tự tick điều khoản cũ" chạy được, nhưng không nằm trong checklist
  liệt kê ban đầu vì lúc viết plan chưa nhận ra thiếu 2 chỗ backend này
- `ProfileCard` thêm `controlledPhone` (không đổi API cũ `editablePhone`, không ảnh hưởng `account/page.tsx`)
- `EventStatusBadge` variant map sửa (ảnh hưởng bất kỳ chỗ nào dùng sau này, không riêng shell)

**Nghiệm thu:** Chrome thật ngay trong phase này (không dồn sang R6) — đăng ký hết luồng bằng
`nv0xx@teambuilding.vn` (Event B), xem Journey của 1 người đã có dữ liệu (Event A), thử ở khung 390px.

**Đã kiểm chứng:** `ruff` sạch, `pytest` 45/45 pass (thêm 2 test cho `/registrations/me`: sống sót qua
`registration_closed`, trả `null` khi `event_completed`). `tsc --noEmit` + `next lint` sạch qua toàn bộ
đợt sửa. Verify bằng curl thật (không phải chỉ đọc code):
- `/registrations/me`: trả registration hiện tại; sau khi transition Event B → `registration_closed`,
  `/events/current` về `null` nhưng `/registrations/me` **vẫn** trả đúng registration cũ (rồi transition
  ngược lại `registration_open` để không đổi seed data) — đúng hành vi "xem lại sau khi đóng cổng"
- Luồng đăng ký mới (nv030, Event B): `GET /employees/me` → có `site_id`; `PATCH` phone → `PUT`
  registration → `POST` submit, cả 3 bước nối tiếp thành công; 1 email tới MailHog
- `GET /events/1/team/roster` (nv001, leader) trả đủ `email`/`phone` mỗi thành viên (trước đây FE bỏ,
  giờ hiển thị); `GET /events/1/gala/config` trả `status` đúng
- 5 route CBNV (`/login /journey /register /team /account`) đều trả 200 qua curl
**Chưa click-through Chrome thật** (extension không kết nối được trong môi trường này — xem ghi chú R2).
Cần làm khi có điều kiện, bắt buộc trước R6. Khung 390px cũng chưa xem được bằng mắt vì lý do tương tự.

---

### R4 — Gala (CBNV + Admin)

**Mục tiêu:** sửa toàn bộ finding ở audit §3.4.
**Xong là nhìn thấy gì:** 2 trình duyệt mở cùng lúc, giữ ghế, xác nhận — số liệu quota đúng, tên Team
đúng, mất kết nối rồi nối lại bảng vẫn khớp server.

**Backend (phần chưa nằm trong R1):**
- [x] `gala_service.py` — **đã có sẵn**: `_turns_out()` (`routers/gala.py`) đã trả toàn bộ turn theo
      `order_no` kèm `team_name`, không chỉ turn active; `GalaStateOut.turns` đã đúng shape. Không cần
      sửa gì — chỉ FE chưa dùng hết dữ liệu này (giờ đã dùng, xem bên dưới)
- [x] *Phát sinh khi làm, không có trong checklist gốc:* `GalaSeatOut` **thiếu** `hold_expires_at` dù
      model đã lưu — thêm vào schema + đưa vào payload WS `seat_update` khi `hold` (trước đó FE không
      thể tự đếm ngược giữ ghế vì API không trả field này)

**CBNV — `app/(employee)/gala/[eventId]/page.tsx` + `gala-seat-map.tsx`:**
- [x] Sửa bộ đếm quota: đổi từ đếm ghế đã confirmed của **Team mình** sang đếm của **Team đang tới
      lượt** (`activeTeamConfirmedCount`) — verify bằng dữ liệu seed thật: trước fix, leader Sales
      (13 ghế đã confirmed) xem lúc Customer Success đang chọn sẽ thấy "13/12 ghế" (vô lý, vượt quota
      của Team khác); sau fix thấy đúng "0/12 ghế"
- [x] Dải hàng chờ: liệt kê toàn bộ turn theo thứ tự (pill có viền/gạch ngang theo trạng thái) +
      dòng "Team bạn: thứ N trong hàng chờ" (N = vị trí trong các Team còn `waiting`, không tính Team
      đã xong) — verify bằng trace tay trên dữ liệu seed thật (8 turn, my_team ở các vị trí done/waiting
      khác nhau) khớp kỳ vọng
- [x] Nhãn trạng thái qua `galaConfigStatusLabel`/`galaSeatStatusLabel` (`lib/labels.ts`, R2)
- [x] Tên Team trên mỗi ghế confirmed qua `title`/`aria-label` (tooltip); ghế Team mình đổi hẳn màu nền
      sang `--lantern` thay vì chỉ viền — phân biệt rõ hơn nhiều so với các Team khác (đều cùng màu lagoon)
- [x] Đếm ngược hold cạnh nút "Bỏ chọn" — dùng `hold_expires_at` mới thêm ở trên
- [x] `heldMine` đổi `find`→`filter`; render 1 nút "Bỏ chọn ghế N" cho từng ghế đang giữ
- [x] Seat 44px (từ 28px, `CLUSTER` tăng theo cho khỏi chồng bàn cạnh nhau); `aria-label` mô tả đủ số
      ghế + trạng thái + Team; `aria-pressed` cho ghế đang giữ/đã chọn của mình; dòng "Vuốt để xem" hiện
      trên mobile (`sm:hidden`)
- [x] `lib/use-gala-ws.ts` — thêm callback `onOpen` (gọi `invalidateQueries` mỗi khi (re)connect) + trả
      về `{ connected }`; trang CBNV hiện chấm xanh/đỏ + chữ "Đang cập nhật trực tiếp"/"Mất kết nối..."
- [x] Tách `useCountdown` ra `lib/use-countdown.ts` dùng chung CBNV + Admin (trước đó định nghĩa lặp
      lại trong 1 file, giờ 1 nguồn)

**Admin — `components/domain/gala-admin-panel.tsx`:**
- [x] Dialog "Sửa cấu hình" nạp giá trị thật từ `state.config` khi mở (`openConfigDialog`), không còn
      hằng số mặc định `"Gala Dinner"/60/30` ghi đè lên cấu hình đã lưu
- [ ] ~~Nút "Mở/Đóng chọn ghế cho CBNV"~~ — **quyết định không làm**: cơ chế lượt đã tự gate hoàn toàn
      ai được thao tác khi nào (`hold`/`confirm` đòi hỏi có turn `status=active` đúng Team — không có
      turn active thì không ai thao tác được, tương đương "đã đóng"). Thêm 1 field `is_open` riêng cho
      `GalaConfig.status` có nguy cơ tạo trạng thái mâu thuẫn (config nói "đóng" nhưng turn vẫn active)
      mà BRD không yêu cầu rõ; để trống thay vì làm nửa vời
- [x] "Bốc thăm" bọc `<ConfirmDialog>` + **ẩn hẳn** (không chỉ disable) khi đã có turn, thay bằng dòng
      chữ "Đã bốc thăm — không thể bốc lại"
- [x] "Bỏ qua lượt" bọc `<ConfirmDialog destructive>`, mô tả nêu rõ tên Team sẽ mất lượt
- [x] Sửa/xoá bàn: thêm `EditTableDialog` (code/số ghế/hình) + danh sách bàn dạng Card với nút Sửa/Xoá;
      xoá là soft-delete (`PATCH is_active:false`) — **phát sinh khi làm**: endpoint cũ set `is_active`
      mà không kiểm tra ghế đang giữ/confirmed trong bàn, có thể "xoá" một bàn còn ghế đã xác nhận (ẩn
      khỏi sơ đồ nhưng vẫn tính vào quota Team) — thêm chặn 409 `seats_in_use` ở router + test route mới
- [x] Đếm ngược lượt đang chạy hiện cạnh "Đang chọn: Team X"
- [x] Nhãn trạng thái qua `lib/labels.ts` (trạng thái config + từng turn trong "Thứ tự bốc thăm")

**Nghiệm thu:** Chrome 2 tab cùng lúc — tab A giữ ghế, tab B thấy ghế chuyển "đang giữ" theo thời gian
thực; cả 2 cùng bấm xác nhận 1 ghế → chỉ 1 tab thành công, tab kia nhận lỗi rõ ràng.

**Đã kiểm chứng:** `ruff` sạch, `pytest` **46/46** (thêm 1 test route mới: xoá bàn còn ghế confirmed →
409, xoá sau khi ghế trống → 200). `tsc --noEmit` + `next lint` sạch. Verify bằng curl thật trên dữ liệu
seed (event 1, đã bốc thăm 8 Team, đang ở lượt Customer Success):
- `GET /gala/state` trả `hold_expires_at` trong mỗi seat; hold 1 ghế → response có `hold_expires_at`
  tương lai đúng bằng `hold_ttl_seconds`; release → về `null` — khớp thiết kế đếm ngược
- Đối chiếu trực tiếp SQLite: Team Sales (my_team của nv001) có 13 ghế confirmed trong khi Team đang
  active (Customer Success) có 0 — xác nhận cụ thể bug bộ đếm quota cũ sẽ hiện "13/12 ghế" sai, bug này
  không còn tái hiện với code mới (đếm đúng theo `activeTurn.team_id`)
- Admin: tạo bàn test → sửa code → xoá (`is_active:false`, ghế đang trống) → `200`; test route riêng
  xác nhận xoá bị chặn `409` khi có ghế confirmed
- `/gala/1` (CBNV) và `/admin/events/1/gala` đều trả 200 qua curl
**Chưa click-through Chrome thật** (extension không kết nối được — xem R2/R3). Đặc biệt cần làm trước
R6: kịch bản "2 tab cùng bấm 1 ghế" chỉ có thể verify thật bằng trình duyệt, curl tuần tự không mô
phỏng được race condition đồng thời.

---

### R5 — Admin workspace

**Mục tiêu:** sửa toàn bộ finding còn lại ở audit §3.2, §3.3, §3.6, §3.7, dùng `data-table.tsx` +
`confirm-dialog.tsx` + `job-progress.tsx` từ R2.
**Xong là nhìn thấy gì:** mọi danh sách admin sort/search/export được; không hành động phá huỷ nào thiếu
confirm; xe có đủ field BRD §7.2 và có nút Sửa.

**Điều hướng — `app/admin/layout.tsx`, `event-workspace.tsx`:**
- [x] Thêm bộ chọn "Sự kiện đang thao tác" vào sidebar, nhớ lựa chọn (localStorage) để không phải vào
      `/admin/events` chọn lại mỗi lần
- [x] Thêm breadcrumb "← Sự kiện" ở đầu mỗi trang `admin/events/[id]/*`

**Dashboard — `app/admin/page.tsx` + `admin/events/[id]/page.tsx`:**
- [x] Gộp 2 bản trùng thành 1 component `components/domain/event-dashboard.tsx`, cả 2 trang chỉ truyền `eventId`
- [x] "Đã lên xe: N" → "N / {tổng cần xe}"; phòng tách riêng số người / số chỗ
- [x] Thêm trạng thái phân xe **theo từng chặng** (lặp qua legs)
- [x] Thêm số ca bị `is_flagged` nổi bật, link sang tab Chuyến bay
- [x] Mỗi card link sang tab xử lý tương ứng

**Danh sách → `data-table.tsx`:** Events, Master Data (Team/Site), Users, Registrations, các bảng
assignment trong flights/buses/hotels, Audit log — thêm sort + search + filter + (nơi cần) export.
- [x] `registrations-table.tsx` — sửa export gửi đúng query string đang lọc (bug §3.6); thêm option "Tất
      cả" cho mọi filter select + giữ/khôi phục nút "Xoá lọc"

**Confirm cho hành động nguy hiểm** (dùng `<ConfirmDialog>`):
- [x] Event status transition, đặc biệt `information_published` — hiện số người sẽ nhận mail (đếm
      registrations `submitted && is_participating`) trước khi xác nhận; thêm checklist cảnh báo nếu còn
      ca flagged / xe chưa có trưởng xe / người chưa có phòng
- [x] Super-admin ghi đè trạng thái
- [x] Đổi role / khoá / reset mật khẩu user
- [x] Vô hiệu hoá entity (Master Data)
- [x] Tạo lịch trình mới (bắn mail `schedule_changed`)
- [x] Toggle publish schedule item

**Chuyến bay — `flight-allocation-panel.tsx`:**
- [x] Hiện `summary.flights[].remaining` per-flight (backend đã có, R1 không đổi field này)
- [x] Hiện chi tiết Team bị tách: tên Team, không chỉ đếm
- [x] Thêm ô chọn Team để chuyển cả team bằng field `team_id` mới ở R1, thay tick tay từng người
- [x] Hiện danh sách lỗi import từng dòng (API đã trả, đang vứt)
- [x] Thêm tab/link xem `GET /allocations` (lịch sử chạy)
- [x] Bắt nhập lý do thật khi ghi đè (validate không được để nguyên chuỗi mặc định)

**Xe — `bus-allocation-panel.tsx`** (phần bù lớn nhất):
- [x] Form tạo xe thêm đủ field: `name`, `gather_at`, `depart_at`, `pickup_point_id` (select từ
      `/pickup-points`), `destination`, `note`
- [x] Thêm cột hành động + dialog Sửa gọi `PATCH /buses/{id}` (đã có, chưa ai gọi)
- [x] Áp dụng phần "Team select" giống flights cho move-cả-team
- [x] Dịch `flag_reason` qua `lib/labels.ts` (hiện đang raw)

**Khách sạn — `hotel-rooms-panel.tsx`:**
- [x] Form hotel đủ field (`address`, `checkin_date`, `checkout_date`, `note`) + Sửa
- [x] Thêm màn hình CRUD Room Types (API đủ, 0 UI)
- [x] Sửa/xoá phòng
- [x] Cho phép đổi phòng người đã gán (không chỉ chọn từ danh sách "chưa có phòng") + nút bỏ gán

**Lịch & Thông báo — `schedule-announcements-panel.tsx`:**
- [x] Form lịch trình thêm `day_date`, `start_at`, `end_at`, `description`, `audience`
- [x] Sửa/xoá cho cả lịch trình và thông báo
- [x] Thông báo: toggle ghim, xem trước markdown khi soạn

**Email — `app/admin/events/[id]/emails/page.tsx`:**
- [x] Nút xem trước (render `body_html` với dữ liệu mẫu)
- [x] Nút "Khôi phục mặc định" khi `is_custom`

**Audit — `audit-jobs-panel.tsx`:**
- [x] Thêm cột người thực hiện (join `actor_user_id` → email, hoặc trả kèm từ backend)
- [x] Thêm nút mở rộng xem before/after (diff đơn giản dạng 2 cột JSON hoặc list field đổi)
- [x] Thêm filter theo thời gian/hành động/entity_type, bỏ giới hạn cứng 30 dòng (dùng `data-table.tsx`)
- [x] CSV export (`ops.py:43-51`) thêm cột before/after (dạng JSON string trong ô)
- [x] Jobs panel lọc theo `event_id` nếu đang trong context 1 event

**Nghiệm thu:** Chrome thật ngay trong phase — không dồn sang R6.

**Đã kiểm chứng:** `ruff` sạch, `pytest` **55/55** (từ 47/47 cuối R4 → thêm test cho: dashboard theo
chặng/flag counts, audit `actor_email` + filter theo `action`, `GET /jobs?event_id=` lọc qua
`json_extract`, xoá phòng/loại phòng bị chặn khi còn người ở — rồi thành công sau khi bỏ gán, lịch trình
lọc đúng theo `audience=shift` — bug thật tìm thấy khi viết test này: chỉ nhánh `audience=team` được lọc,
`shift` lọt qua mọi CBNV bất kể ca; sửa 1 dòng ở `journey_service.py` theo đúng pattern của nhánh `team`
bên cạnh, và phải dời `Registration` lookup lên trước vòng lặp schedule vì code cũ khai báo nó sau khi
dùng). `tsc --noEmit` + `next lint` sạch sau mỗi lần đổi FE.

Endpoint mới thêm ở R5 (đúng luật "không thêm endpoint mà không có FE gọi" — mỗi cái đều được wire ngay):
`PATCH/DELETE /hotels/{hid}/room-types/{tid}`, `DELETE /hotels/{hid}/rooms/{rid}` (409 khi còn người ở),
`DELETE /room-assignments/{id}` (bỏ gán), `DELETE /schedule-items/{id}`, `DELETE /announcements/{id}`,
`DELETE /email-templates/{code}` (khôi phục mặc định), `POST /email-templates/{code}/preview` (render
Jinja với dữ liệu mẫu, không đụng DB — cho xem trước cả nội dung chưa lưu).

Đã lắp nốt 2 endpoint có sẵn nhưng chưa ai gọi từ bảng tra cứu §6.1: `GET /allocations` (lịch sử phân bổ
bay) và `GET /allocations/bus/history` (lịch sử phân xe) — cả hai giờ có dialog "Lịch sử phân bổ/phân xe"
trong panel tương ứng.

**Chưa click-through Chrome thật** — `claude-in-chrome` vẫn chưa kết nối được trong suốt phiên làm R3-R5
(đã hỏi và được đồng ý dùng `tsc`/`lint`/`ruff`/`pytest`/test route thay thế, xem quyết định ở đầu phiên).
Rủi ro cụ thể cần click thật trước khi coi R5 là "xong" theo đúng luật ở CLAUDE.md:
- `ConfirmDialog` (AlertDialog) lồng bên trong `Dialog` đang mở — dùng mới ở nút "Lưu" lịch trình và
  toggle publish khi sự kiện đã công bố; chưa từng có ở codebase trước đó, có thể có vấn đề z-index/focus
  giữa 2 lớp overlay của Base UI mà biên dịch không bắt được
- DataTable với cột chứa `<Select>`/`Checkbox` bên trong (Users, các bảng phân bổ) — sort/click có thể
  đụng nhau với việc chọn dòng
- Toàn bộ form mới (Xe, Khách sạn, Room Types, Lịch trình) chưa xác nhận layout ở 390px
- `dangerouslySetInnerHTML` ở màn hình xem trước email — nội dung do chính BTC gõ nên không phải input
  của người lạ, nhưng chưa xem bằng mắt HTML thật trông thế nào

---

### R6 — Nghiệm thu toàn hệ thống trên trình duyệt

**Mục tiêu:** lần đầu tiên trong dự án, chạy trọn kịch bản BRD §14 bằng trình duyệt thật, không phải curl.

- [x] `docker compose exec api python -m app.db.seed --reset` (tương đương phần dữ liệu của bước
      `make down/up/migrate/seed` — không restart lại container vì stack đã chạy sẵn)
- [ ] BTC login → Event B: kiểm tra cấu hình → mở đăng ký _(đã login + xem dashboard/Sự kiện, chưa
      chủ động bấm "mở đăng ký" vì Event B đã ở `registration_open` sẵn từ seed)_
- [ ] 3 CBNV khác nhau đăng ký (1 người chọn Không tham gia) — **mới làm 1/3**: nv001 đăng ký "Không
      tham gia" trên Event B trọn luồng (submit → email → summary → xem lại/sửa), MailHog nhận đúng
      mail `registration_confirmed`. Chưa thử 2 người còn lại (nhất là chưa thử luồng "Có tham gia" +
      chọn ca + tick xe, vì đó là nhánh code chưa test qua browser)
- [ ] Đóng đăng ký → import/allocation/xử lý flag/chỉnh tay từng người + cả Team — **chưa làm**; chỉ mới
      xem panel Chuyến bay ở trạng thái đã có sẵn dữ liệu (không tự chạy lại allocation/import trong
      phiên này)
- [ ] Import phân phòng → tạo xe đủ trường → chạy phân xe → sửa 1 xe — **chưa làm** việc tạo xe mới/
      chạy phân xe; chỉ xem panel Xe với dữ liệu có sẵn
- [ ] Dựng sơ đồ Gala → bốc thăm → 2 trình duyệt cùng bấm 1 ghế — **chưa làm** (cần 2 tab/2 phiên đăng
      nhập khác nhau cùng lúc, chưa dựng kịch bản này)
- [ ] Công bố thông tin (qua checklist mới) → kiểm tra mail hàng loạt — **chỉ test dialog xác nhận rồi
      Huỷ** (cố ý không bấm thật để tránh gửi ~120 email giả cho seed data); dialog + checklist cảnh
      báo hiện đúng, nhưng luồng gửi mail thật cho `information_published` chưa được xác nhận qua
      browser
- [ ] CBNV xem Journey ở khung 390px — **không thực hiện được**: `resize_window` (cả tab hiện tại lẫn
      tab mới) không thực sự thu nhỏ cửa sổ trình duyệt trong môi trường này (`window.innerWidth` vẫn
      báo 1920 sau khi gọi resize) — đây là giới hạn công cụ của phiên này, không phải đã kiểm tra và
      đạt. Cần thử lại ở môi trường/công cụ khác trước khi coi mục này là xong
- [x] Audit log hiện đúng người thực hiện + before/after — xác nhận bằng thao tác thật (sửa Loại phòng
      "Phòng Đôi", xem lại trong tab Audit ngay sau đó: đúng `btc@teambuilding.vn`, đúng nhãn thao tác,
      before/after JSON đúng)
- [ ] Ghi GIF — chưa làm

**Sau khi xong:**
- [ ] Cập nhật `docs/PLAN.md` — thêm dòng trỏ sang `docs/REBUILD-PLAN.md` ở đầu file
- [ ] Cập nhật README nếu số tài khoản/lệnh seed thay đổi
- [ ] Điền "Đã kiểm chứng" cho R0–R6 ở tài liệu này

**Đã kiểm chứng — R6 CHƯA XONG, đây là ghi nhận một phiên browser-testing thật đầu tiên (không theo
kịch bản đủ 8 bước ở trên, mà đi lướt qua gần hết các màn hình R2–R5 để tìm lỗi thật):**

`claude-in-chrome` đã kết nối được lần đầu trong đợt rebuild này. Thay vì chạy đúng kịch bản 8 bước ở
trên từ đầu đến cuối, phiên này đi kiểm tra rộng — gần như mọi màn hình Admin (Tổng quan, Sự kiện,
Master Data, Tài khoản, Chuyến bay, Xe, Khách sạn, Gala, Lịch & TB, Email, Audit) và CBNV (Đăng ký,
Hành trình, Team, Gala) — và tìm ra **4 lỗi thật, đều đã sửa và có commit riêng trên nhánh
`rebuild/r6-browser-acceptance`**:

1. **`874f63f`** — Mọi `<Select>` trong toàn hệ thống hiện giá trị thô (vd "2") thay vì nhãn (vd "Team
   Building 2027") khi đã chọn giá trị nào đó. Nguyên nhân: `<Select.Value>` của Base UI cần prop
   `items` trên `Select.Root` để tự tra nhãn — component `Select` dùng chung ở
   `components/ui/select.tsx` chưa từng truyền prop này. Sửa 1 chỗ, mọi `Select` trong app tự có nhãn
   đúng mà không phải sửa từng nơi gọi.
2. **`c66254d`** — `Select` bị "kẹt" ở chế độ uncontrolled vĩnh viễn nếu giá trị ban đầu là `undefined`
   (ví dụ chọn "chặng đầu tiên" sau khi danh sách chặng load xong) — Base UI chốt trạng thái
   controlled/uncontrolled ngay ở lần render đầu và không bao giờ kiểm tra lại. Phát hiện qua bộ chọn
   chặng xe: dữ liệu bên dưới đúng nhưng ô chọn vẫn hiện "Chọn chặng". Sửa bằng cách remount 1 lần
   đúng lúc giá trị thật xuất hiện lần đầu. Cùng commit này còn sửa `seed.py` thiếu `params_json` cho
   `AllocationRun` (khiến cột "Còn trống" và thẻ tóm tắt phân bổ luôn trống khi mở trang, chỉ hiện sau
   khi tự bấm chạy phân bổ ngay trong tab đó).
3. **`022d009`** — `RadioGroup` bị đúng lỗi y hệt #2 — phát hiện qua overlay lỗi dev của Next.js khi
   test form đăng ký: ô "Có tham gia / Không tham gia" không hiện đúng lựa chọn đã lưu khi mở lại một
   đăng ký đã gửi trước đó (dữ liệu load sau khi mount). Sửa cùng cách với Select.

Đã xác nhận hoạt động đúng qua click thật (không chỉ đọc code): Master Data sửa tên team, Tài khoản
đổi role/khoá/reset mật khẩu (hiện mật khẩu tạm trong dialog copy được), Chuyến bay (cột Còn trống,
tên Team bị tách, dialog lịch sử phân bổ), Xe (form đủ field, bộ chọn chặng hiện đúng nhãn ngay khi
load), Khách sạn (Room Types CRUD, xoá phòng/loại phòng bị chặn 409 đúng khi còn người ở/còn phòng
dùng), Lịch & TB (form sửa đủ field, `ConfirmDialog` lồng trong `Dialog` đang mở — mẫu hình mới, rủi ro
đã nêu ở R5 — hoạt động đúng không lỗi z-index/focus), Email (xem trước render đúng với dữ liệu mẫu),
Audit (actor + before/after + như trên), CBNV Hành trình (đủ khối chuyến bay 2 chiều/xe 4 chặng/phòng/
Gala/lịch trình cho tài khoản có dữ liệu thật), CBNV Đăng ký (nộp → email → màn hình thành công → xem
lại đúng lựa chọn đã lưu), Gala CBNV (hàng chờ lượt bốc thăm, "đã xong" gạch ngang đúng, viền "team
của mình" không che mất gạch ngang — chỉ là ảnh chụp màn hình lúc đầu zoom chưa đủ, xem kỹ lại thì
đúng).

**Việc mở khoá cho phiên R6 tiếp theo:** chạy đúng 8 bước kịch bản BRD §14 còn thiếu ở trên — đặc biệt
kịch bản 2 trình duyệt bấm cùng 1 ghế Gala (chỉ có thể test thật bằng trình duyệt, không mô phỏng được
bằng curl tuần tự) và test ở khung 390px thật (cần môi trường mà `resize_window` hoạt động, hoặc test
trên thiết bị di động thật / DevTools device toolbar thủ công).

---

## 6. Bảng tra cứu (để không phải audit lại)

### 6.1 Endpoint tồn tại nhưng chưa có FE nào gọi

| Endpoint | File | Ghi chú |
|---|---|---|
| `PATCH /events/{id}/hotels/{hid}` | `routers/hotels.py:49` | dùng ở R5 (sửa hotel) |
| `GET/POST /events/{id}/hotels/{hid}/room-types` | `routers/hotels.py:70,79` | dùng ở R5 (Room Types UI) |
| `PATCH /events/{id}/hotels/{hid}/rooms/{rid}` | `routers/hotels.py:142` | dùng ở R5 (sửa phòng) |
| `PATCH /events/{id}/buses/{bid}` | `routers/buses.py:63` | dùng ở R5 (nút Sửa xe) |
| `GET /events/{id}/allocations` | `routers/flights.py:270` | dùng ở R5 (lịch sử phân bổ) |
| `GET /events/{id}/allocations/bus/history` | `routers/buses.py:144` | dùng ở R5 |
| `PATCH /events/{id}/announcements/{aid}` | `routers/schedule.py:101` | dùng ở R5 (sửa/ghim thông báo) |
| `POST /events/{id}/rag/reindex` | `routers/rag.py:17` | ngoài phạm vi đợt này (chat RAG giữ nguyên) |
| `DELETE /employees/{id}` | `routers/employees.py:246` | quyết định: có cần UI xoá CBNV không — mặc định KHÔNG thêm (soft-delete qua `is_active` đã đủ), nếu BTC cần thì bổ sung |
| `GET /journey/me?event_id&employee_id` (admin preview) | `routers/journey.py:23-29` | có thể hữu ích cho R5 (BTC xem trước journey của 1 người) — tuỳ chọn, không bắt buộc |

### 6.2 Code chết (an toàn để xoá hoặc để lại có ghi chú)

| Gì | File | Xử lý |
|---|---|---|
| `get_seat_lock_owner` | `services/gala/seat_lock.py:27` | không gọi ở đâu — xoá hoặc giữ nếu R4 cần debug |
| `answer()` (non-stream) | `services/rag/chat_service.py:32` | chỉ `answer_stream` dùng — ngoài phạm vi (chat RAG giữ nguyên) |
| `AllocationStrategy` Protocol | `services/allocation/base.py:44` | 1 implementation duy nhất, không cần xoá, không cần dùng thêm |
| `worker/tasks/system.py:6 ping` | | giữ — ARQ cần ≥1 hàm đăng ký để khởi động (ghi rõ trong CLAUDE.md) |
| `ImportBatch.event_id` | `models/system.py:57` | không set — set khi implement import cho flights/buses ở R1/R5 nếu tiện, không bắt buộc |
| `models/audit.py:21 ip` | | R1 sẽ set — không còn chết sau R1 |

### 6.3 Rò quyền (đóng ở R1)

- `GET /employees` — `CurrentUser` → phải là `AdminUser`
- `GET /events/{id}/schedule-items`, `/announcements` — lọc unpublished cho non-admin
- `WS /events/{id}/gala/ws` — không auth

### 6.4 Lỗi có thể gây 500 khi dùng thật (đóng ở R1)

- Import chuyến bay 2 lần → nhân đôi (thiếu unique constraint)
- `employee_ids` không hợp lệ trong adjust flight/bus → FK violation → 500 (không map qua `AppError`)
- `journey.py:36` không null-check `employee` trước khi dùng

---

## 7. Phụ lục — Ánh xạ mục BRD → phase xử lý

| Mục BRD | Nội dung | Phase xử lý |
|---|---|---|
| §4 | Đăng ký Team Building | R3 (FE), R1 (validate backend) |
| §5 | Chuyến bay + Auto Allocation | R1 (thuật toán + gate trạng thái), R5 (UI) |
| §6 | Khách sạn/phòng | R5 |
| §7 | Xe & điều phối | R1 (bug), R5 (UI đủ field — lỗ hổng lớn nhất) |
| §8 | Gala Dinner | R1 (backend), R4 (cả 2 phía) |
| §9 | My Team Building Journey | R3 |
| §10 | Admin Dashboard & quản lý dữ liệu | R5 |
| §11 | Notification & Email | R1 (timing/dedupe) — đã implement đủ trigger từ trước |
| §12 | Trạng thái chương trình | R1 (gate), R5 (confirm + checklist công bố) |
| §13 | Yêu cầu nghiệp vụ & kỹ thuật | R1 (quyền, validation, audit) |
| §14 | User flow tổng thể | R6 (kịch bản nghiệm thu) |
| §15 | MVP đề xuất | đã có từ Phase 0-13, đợt này là hoàn thiện chất lượng |
| §16 | Câu hỏi BTC cần chốt | không đổi — xem `docs/PLAN.md` §12, mặc định đang áp dụng vẫn hợp lệ |

---

## 8. Cách kiểm chứng chung

Sau mỗi phase:
```bash
make up
docker compose exec api ruff check .
docker compose exec api pytest
docker compose exec web npx tsc --noEmit
docker compose exec web npm run lint
```

R0: kiểm bằng SQL (§R0 nghiệm thu). R1: test route mới + curl thủ công. R2-R5: **Chrome thật ngay
trong phase**, không dồn sang cuối. R6: kịch bản nghiệm thu đầy đủ ở §R6.

**Nguyên tắc bắt buộc cho agent tiếp theo:** không đánh dấu `- [x]` cho một phase nếu chưa mở trình
duyệt bấm thử. Đây là nguyên nhân gốc của toàn bộ đợt làm lại này (xem mục 1).
