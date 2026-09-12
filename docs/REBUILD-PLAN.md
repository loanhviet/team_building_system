# REBUILD PLAN — Đợt làm lại R0–R6

> **Đây là nguồn sự thật (single source of truth) cho đợt làm lại hiện tại.**
> `docs/PLAN.md` giữ nguyên làm **lịch sử** Phase 0–13 (kiến trúc, data model, thuật toán vẫn tra ở đó).
> `docs/BRD.md` là yêu cầu nghiệp vụ gốc từ BTC.
>
> Tài liệu này được viết để **một agent/người khác mở ra là code được ngay**, không cần đọc lại
> hội thoại nào. Mỗi phase có checklist `- [ ]`, file + dòng cụ thể, và điều kiện nghiệm thu.

Ngày lập: 2026-09-12 · Trạng thái: R0 chưa bắt đầu

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

- [ ] Thêm CLI flag `--reset`: xoá toàn bộ dữ liệu nghiệp vụ (giữ schema) trước khi seed, vì bản hiện
      tại chỉ `return` sớm nếu đã có `admin@teambuilding.vn` (dòng 37-40)
- [ ] Site: giữ HN/HCM
- [ ] Team: giữ 8 team hiện có (TEAM_DEFS)
- [ ] Employee: giữ 120 người, cách sinh tên giữ nguyên
- [ ] **Event A `TB2026`**, trạng thái cuối = `information_published`:
  - [ ] 2 `shifts`: Ca 1, Ca 2 (`depart_after_time="17:00"`)
  - [ ] **4 `transport_legs`** đúng BRD §7.1: `HN_SB`/`SB_HN` (hoặc theo site làm việc), `SB_KS`, `KS_SB`
        — đặt `direction` nhất quán với dữ liệu bus/journey dùng
  - [ ] `pickup_points`: ít nhất 2 điểm mỗi site (VD "Toà nhà A - Hà Nội", "Toà nhà B - Hồ Chí Minh"),
        gắn đúng `site_id`
  - [ ] 6 `flights`: 3 chiều đi (2 ca) + 3 chiều về, **có `depart_at`, `arrive_at`, `origin`, `destination`
        thật** (không để NULL như hiện tại), tổng capacity ≥ số người `is_participating=true`
  - [ ] `hotels`: 1-2 khách sạn có `address`, `checkin_date`, `checkout_date`; `room_types` + đủ `rooms`
        (capacity đủ cho số người tham gia)
  - [ ] `buses`: mỗi leg 2-3 xe, **bắt buộc có `gather_at`, `depart_at`, `pickup_point_id`, `destination`,
        `leader_name`, `leader_phone`** — đây là field BTC hiện không nhập được qua Admin, seed phải set
        thẳng vào DB để chứng minh journey render đúng khi có dữ liệu
  - [ ] `gala_configs` + ~15 `gala_tables` × 8 ghế (đủ chỗ cho registration tham gia)
  - [ ] `schedule_items`: ~12 mục trải 3 ngày, có `day_date`, `start_at`, `end_at`, `location`, `is_published=true`
  - [ ] `announcements`: 3 mục, 1 pinned
  - [ ] `registrations`: ~100/120 CBNV `submitted`, một vài `is_participating=false`, một vài có `wish_note`
  - [ ] Gọi thật `run_flight_allocation` + `run_bus_allocation` (import trực tiếp, không qua ARQ) rồi gán
        `room_assignments` thủ công cho người có phòng
  - [ ] **Cố ý để lại vài ca `is_flagged=true`** (giảm capacity 1 chuyến để thiếu slot) — để BTC có ca
        thật để xử lý, đúng tinh thần BRD §5.3
  - [ ] Confirm một phần ghế Gala (vài team) để Journey có gì để hiện, để lại vài team `pending` để test
        luồng chọn ghế
- [ ] **Event B `TB2027`**, trạng thái `registration_open`:
  - [ ] `registration_open_at` = giờ hiện tại trừ 1 ngày, `registration_close_at` = +14 ngày
  - [ ] Cấu hình ca/chặng/điểm đón giống Event A (copy config, không copy registrations)
  - [ ] **0 đăng ký** — để thử trọn luồng CBNV từ đầu
- [ ] Cập nhật danh sách tài khoản in ra cuối script + README nếu số liệu thay đổi

**Nghiệm thu:**
```bash
make down && rm -f data/teambuilding.db* && make up && make migrate
docker compose exec api python -m app.db.seed
```
Kiểm bằng SQL: 2 `events`, `transport_legs` = 4 (mỗi event), `pickup_points` > 0, `flights` có
`depart_at`/`origin`/`destination` khác NULL cho cả outbound và inbound, `gala_seats` ≥ số người tham gia
Event A, `buses.gather_at`/`pickup_point_id` khác NULL.

**Đã kiểm chứng:** _(điền khi xong)_

---

### R1 — Sửa lỗi gốc backend

**Mục tiêu:** vá đúng nguyên nhân gốc (không vá từng caller), đóng lỗ hổng quyền, thêm test route thật.
**Xong là nhìn thấy gì:** PATCH xoá field hoạt động ở mọi màn hình; `/employees` từ chối role `employee`;
import chuyến bay 2 lần không nhân đôi; test suite có test HTTP thật.

- [ ] **`services/master_data.py:53-56`** — bỏ điều kiện `if value is not None`, set thẳng mọi key
      trong `data` (routers đã dùng `exclude_unset=True` nên an toàn)
- [ ] **`services/allocation/greedy.py`** (`_score`, dòng 4-7):
  - [ ] Thêm điểm `team_together`: đếm số thành viên cùng `team_id` đã có mặt ở `flight` đó (`weights["team_together"]`)
  - [ ] Dùng `split_penalty` để trừ điểm phương án phải tách Team so với phương án giữ nguyên khối
  - [ ] Flag `shift_mismatch` **cả khi Team lọt nguyên khối** vào chuyến sai ca đa số (nhánh dòng 24-30),
        không chỉ ở nhánh tách (dòng 52-53)
  - [ ] Cập nhật `apps/api/tests/test_allocation_greedy.py` cho 2 case trên
- [ ] **`services/gala/gala_service.py:288-292`** — thêm điều kiện lọc theo `event_id` (join `GalaTable`)
      vào query đếm quota đã confirm
- [ ] **`routers/gala.py:119-137`** (`update_table`) — khi `seat_count` thay đổi, thêm/xoá `GalaSeat` cho
      khớp (thêm số ghế mới với `status=available`; chặn giảm nếu có ghế `confirmed`/`held` trong phần bị cắt)
- [ ] **`routers/gala.py:305-313`** (`gala_ws`) — thêm xác thực: đọc token qua query param hoặc cookie,
      decode giống `core/deps.py`, đóng kết nối 4401 nếu không hợp lệ hoặc không có quyền xem event đó
- [ ] **`routers/employees.py:84-95`** (`list_employees`) — đổi `_user: CurrentUser` → `_user: AdminUser`
- [ ] **`routers/schedule.py:29,78`** — `list_schedule_items`/`list_announcements`: nếu `user.role` không
      phải admin, lọc `is_published=True` / `published_at is not None` (dùng lại điều kiện
      `journey_service.py:141,158`)
- [ ] **Migration mới** (`alembic revision --autogenerate -m "unique constraints"`):
  - [ ] `flights`: unique `(event_id, flight_code)`
  - [ ] `buses`: unique `(event_id, leg_id, code)`
  - [ ] `rooms`: unique `(hotel_id, room_number)`
  - [ ] `gala_tables`: unique `(event_id, code)`
  - [ ] Trước khi thêm index: viết bước dọn trùng nếu DB hiện tại có vi phạm (kiểm bằng `GROUP BY … HAVING count(*) > 1`)
- [ ] **`routers/flights.py` import** (`~:86-147`) — đổi từ insert thuần sang upsert theo `flight_code`
      (update nếu đã tồn tại trong event, insert nếu chưa)
- [ ] **Validate ID thuộc đúng event** trước khi ghi, trả `AppError` 400 thay vì để FK violation rơi
      xuống 500:
  - [ ] `routers/flights.py:314` (`employee_ids` trong adjust) — check `Registration` tồn tại + event khớp
  - [ ] `routers/buses.py:187` — tương tự
  - [ ] `routers/registrations.py:96` — `shift_id`/`leg_id`/`pickup_point_id` phải thuộc `event_id` hiện tại
  - [ ] `routers/room_assignments.py:110` — `employee_id` phải có đăng ký `submitted` trong event
- [ ] **Gate theo trạng thái event**:
  - [ ] `POST /allocations/flight`, `POST /allocations/bus` (`flights.py:225`, `buses.py:103`) — yêu cầu
        `event.status in {registration_closed, allocation_processing}`, nếu không trả `AppError`
        `invalid_event_status` 400
  - [ ] Ghi dữ liệu nghiệp vụ (flights/buses/hotels/rooms/gala/schedule mutations) bị chặn khi
        `event.status == event_completed`
  - [ ] Thao tác ghế Gala (`hold`/`confirm`) yêu cầu `gala_configs.status` đang mở chọn (không phải `setup`/`finished`)
- [ ] **Email timing** — `services/notification/email_service.py:118` (`enqueue_email`) chuyển việc
      `queue.enqueue_job` ra **sau** `db.commit()` ở mọi call site (`registrations.py`, `flights.py`,
      `buses.py`, `schedule.py`, `events.py`)
- [ ] **Dedupe key đăng ký** — `registrations.py:156` bỏ `submitted_at` khỏi dedupe key (dùng
      `registration.id` + `template_code` là đủ) để sửa-rồi-submit-lại không bắn thêm mail
- [ ] **Audit mở rộng**:
  - [ ] Ghi `ip` thật trong `record_audit` (lấy từ `Request.client.host`, truyền qua các call site)
  - [ ] Thêm `record_audit` cho: Gala draw/turn start-skip/seat block/seat confirm, registration submit/cancel
- [ ] **`AdjustAssignmentRequest`** (`schemas/flight.py`, tương tự bus) — thêm field `team_id: int | None`;
      khi có `team_id`, service tự lấy toàn bộ `employee_ids` của Team đó trong event thay vì bắt buộc
      FE liệt kê từng người (`routers/flights.py`/`buses.py` adjust endpoint đọc field mới)
- [ ] **`journey.py:36`** — null-check `employee` trước khi gọi `build_journey`, trả 404 rõ ràng thay vì 500

**Test mới** (`apps/api/tests/conftest.py` — hiện chưa tồn tại):
- [ ] Fixture `AsyncClient` (httpx) chạy app với DB sqlite in-memory/tempfile riêng mỗi test
- [ ] Fixture tạo nhanh: event, employee+user theo từng role, registration submitted
- [ ] Test RBAC: `/employees` list 403 với `employee`, 200 với `organizer`
- [ ] Test luồng đăng ký: submit thiếu terms → 400; sau `registration_closed` → PUT bị chặn
- [ ] Test adjust vượt sức chứa → 409 `over_capacity`; kèm `force=true` → 200 + audit log có `reason`
- [ ] Test journey: chưa `information_published` → 404; sau publish → 200 đủ field
- [ ] Test allocation: chạy xong có `AllocationRun.summary_json` đúng cấu trúc, `flight_assignments` khớp
      capacity từng chuyến

**Nghiệm thu:**
```bash
docker compose exec api ruff check .
docker compose exec api pytest -v
```
Thủ công: PATCH `/api/events/{id}` với `{"destination": null}` → destination thực sự về NULL.
`curl` `/api/employees` bằng token `employee` → 403. Import cùng file chuyến bay 2 lần → số dòng
`flights` không đổi ở lần thứ 2.

**Đã kiểm chứng:** _(điền khi xong)_

---

### R2 — Design system + nền UI dùng chung

**Mục tiêu:** dựng đủ component nền để R3–R5 chỉ còn việc lắp ráp, không viết lại từ đầu mỗi màn hình.
**Xong là nhìn thấy gì:** không còn `<input type="checkbox">` trần nào trong repo; mọi nhãn tiếng Việt
nhất quán; 1 bảng dùng chung có sort/filter/export chạy được trên ít nhất 1 màn hình thật (Employees).

- [ ] Thêm shadcn primitive còn thiếu vào `apps/web/src/components/ui/`: `checkbox.tsx`,
      `radio-group.tsx`, `skeleton.tsx`, `alert.tsx`, `alert-dialog.tsx`, `tooltip.tsx`, `popover.tsx`
      (dùng `npx shadcn add …` trong container web hoặc copy pattern các file `ui/*` hiện có)
- [ ] Thay mọi `<input type="checkbox">` trần bằng `<Checkbox>`:
      `register/page.tsx:216,266,324`, `flight-allocation-panel.tsx:443`, `bus-allocation-panel.tsx:339`
- [ ] Dẹp `text-zinc-*` literal trong `apps/web/src/app/admin/**` về token (`text-muted-foreground` …)
- [ ] **`components/domain/data-table.tsx`** (mới, thay dần `entity-crud-table.tsx`):
      cột định nghĩa khai báo, ô tìm kiếm debounce, filter dropdown theo cột, click-header để sort,
      phân trang, nút Export (nhận callback build query string đúng filter đang bật — sửa đúng bug
      registrations export ở R5), giữ khả năng edit-inline mà `entity-crud-table` đang thiếu
- [ ] **`components/domain/confirm-dialog.tsx`** (mới) — `<ConfirmDialog trigger title description
      confirmLabel onConfirm>`; dùng `AlertDialog` bên dưới
- [ ] **`components/domain/job-progress.tsx`** (mới) — nhận `jobId`, tự poll `GET /api/jobs/{id}`, hiện
      progress bar `progress/total` + trạng thái + nút huỷ theo dõi; tái dùng pattern đã có ở
      `admin/employees/page.tsx:59-67`
- [ ] **`components/domain/status-badge.tsx`** (mới) — map `EventStatus` → màu + nhãn Việt, dùng
      `lib/event-status.ts` làm nguồn nhãn
- [ ] **`components/domain/empty-state.tsx`** — thêm biến thể `variant="error"` với nút "Thử lại"
      (`onRetry`), giữ biến thể rỗng hiện tại làm mặc định
- [ ] **`lib/labels.ts`** (mới) — object tra cứu tiếng Việt cho: `direction` (outbound/inbound),
      `source` (auto/manual/import), `flag_reason` (no_slot/shift_mismatch), `JobStatus`, `JobType`,
      audit `action`/`entity_type`, Gala `config.status`/turn `status`. Export hàm `label(map, key)` trả
      về key gốc nếu không tìm thấy (không bao giờ throw)
- [ ] **`lib/api.ts`** — gộp các request refresh-token đang chạy song song thành 1 promise dùng chung
      (`:54-57`); bắt `TypeError` mạng và ném `ApiError` với thông điệp tiếng Việt "Không thể kết nối
      máy chủ"; thêm `AbortSignal` timeout mặc định
- [ ] **`lib/providers.tsx`** — đặt `staleTime` mặc định hợp lý (không phải 0), thêm `QueryCache.onError`
      bắn toast chung cho lỗi không được xử lý riêng

**Nghiệm thu:**
```bash
docker compose exec web npx tsc --noEmit
docker compose exec web npm run lint
```
Chrome thật: mở `/admin/employees`, thử sort theo cột, filter, export — kiểm tra bằng mắt.

**Đã kiểm chứng:** _(điền khi xong)_

---

### R3 — Portal CBNV

**Mục tiêu:** sửa toàn bộ finding ở audit §3.1 (Đăng ký) + §3.5 (Journey) + Team leader + Shell +
Login/Account, dùng component từ R2.
**Xong là nhìn thấy gì:** CBNV đăng ký xong thấy màn hình tóm tắt rõ ràng; sau khi đóng đăng ký vẫn xem
lại được đăng ký của mình; Journey hiện đủ dữ liệu R0 đã seed, không thiếu trường nào.

**`app/(employee)/register/page.tsx`:**
- [ ] Đổi radio Có/Không, checkbox xe, checkbox điều khoản sang `<RadioGroup>`/`<Checkbox>` (R2)
- [ ] Bắt buộc: `shiftId` khác null, SĐT không rỗng, mỗi leg tick "cần xe" phải có `pickup_point_id`
      — cập nhật điều kiện `canSubmit` (`:190-191`)
- [ ] Gộp SĐT vào chính state form (bỏ cơ chế "Sửa/Lưu" riêng của `ProfileCard` cho ô SĐT ở trang này —
      submit 1 lần gồm cả PATCH SĐT + PUT registration)
- [ ] Terms: nếu `useQuery` của `/terms` lỗi, hiện `EmptyState variant="error"` thay vì ẩn checkbox +
      disable câm; khi `terms_version` từ server khác với version đã lưu trong registration, **không
      tự tick `agreed`**, bắt người dùng đọc lại
- [ ] Nhóm bus legs theo `direction` (2 nhóm: chiều đi / chiều về), thêm `EmptyState` khi `legs.length === 0`
- [ ] Lọc `pickupPoints` theo `employee.site_id` trước khi render select
- [ ] Thêm màn hình/khối "Đã đăng ký thành công" sau submit: tóm tắt Ca đã chọn, các chặng xe đã chọn,
      dòng "Đã gửi email xác nhận tới {email}"
- [ ] Hiện `event.registration_close_at` (format ngày giờ) ngay trong banner "Bạn vẫn sửa được..."
- [ ] Khi `event` null vì đã đóng đăng ký nhưng CBNV **đã có** registration `submitted` — vẫn cho xem
      lại (đổi nguồn dữ liệu: gọi `/registrations/me` trước, chỉ fallback `EmptyState "Chưa mở đăng ký"`
      khi thật sự chưa từng có registration nào)
- [ ] Thay `window.confirm` hủy đăng ký bằng `<ConfirmDialog>` có `<Textarea>` lý do, gửi `reason` lên
      `POST .../cancel`
- [ ] Xử lý `error` riêng khỏi `isLoading` ở dòng `:86-88` — lỗi thật hiện `EmptyState variant="error"`

**`app/(employee)/journey/page.tsx`:**
- [ ] Thêm dòng giờ đến (`arrive_at`) bên cạnh giờ đi cho mỗi chuyến bay
- [ ] Hiện `bus.note`, `bus.destination` nếu có
- [ ] Render `announcement.body_md` qua một markdown nhẹ (bold/italic/list/link tối thiểu — không cần
      thư viện nếu regex đơn giản đủ dùng, ponytail: ưu tiên giải pháp nhỏ nhất trước khi thêm dependency)
- [ ] Nhóm `schedule` theo `day_date`, hiện `end_at` cạnh `start_at`
- [ ] SĐT trưởng xe bọc trong `<a href="tel:...">`
- [ ] Thêm nút làm mới (`refetch`) + dòng "Cập nhật lúc {time}"
- [ ] Sửa error state (`:28-41`): tách rõ "chưa có hành trình công bố" (404 `no_published_event`) khỏi
      lỗi mạng/500 — lỗi thật dùng `EmptyState variant="error"`, không hiện `error.message` tiếng Anh thô

**`app/(employee)/team/page.tsx`:**
- [ ] Thêm cột Email, SĐT vào bảng roster (API đã trả, đang bỏ)
- [ ] Thêm search theo tên/mã NV (dùng `data-table.tsx` nếu hợp, hoặc filter đơn giản tại chỗ)
- [ ] Sửa `if (!data) return null` (`:57`) → hiện `EmptyState`
- [ ] Ẩn nút "Chọn ghế Gala" khi `gala_configs` chưa tồn tại hoặc `status === "setup"`

**`components/domain/employee-shell.tsx`:**
- [ ] Ẩn tab "Đăng ký" khi không có event `registration_open` **và** CBNV chưa từng có registration nào
      (còn có registration cũ thì vẫn cho vào xem — xem mục registerpage ở trên)
- [ ] Ẩn tab "Gala" khi chưa có `gala_configs` cho event hiện tại
- [ ] Thêm banner nhỏ dưới header hiện `StatusBadge` của event hiện tại (R2)
- [ ] Thêm `aria-current="page"` cho link active, `aria-label` cho nav

**Login/Account:**
- [ ] `app/(auth)/login/page.tsx` — lỗi sai mật khẩu hiện inline dưới field thay vì chỉ toast; thêm nút
      hiện/ẩn mật khẩu; thêm dòng "Quên mật khẩu? Liên hệ BTC" (không làm OTP, theo PLAN.md đã chốt)
- [ ] `app/(employee)/account/page.tsx` — sau đổi mật khẩu bắt buộc thành công, employee cũng được điều
      hướng tiếp (hiện chỉ admin được, `:37-39`)

**Nghiệm thu:** Chrome thật ngay trong phase này (không dồn sang R6) — đăng ký hết luồng bằng
`nv0xx@teambuilding.vn` (Event B), xem Journey của 1 người đã có dữ liệu (Event A), thử ở khung 390px.

**Đã kiểm chứng:** _(điền khi xong)_

---

### R4 — Gala (CBNV + Admin)

**Mục tiêu:** sửa toàn bộ finding ở audit §3.4.
**Xong là nhìn thấy gì:** 2 trình duyệt mở cùng lúc, giữ ghế, xác nhận — số liệu quota đúng, tên Team
đúng, mất kết nối rồi nối lại bảng vẫn khớp server.

**Backend (phần chưa nằm trong R1):**
- [ ] `gala_service.py` — hàm trả về turn queue đầy đủ (danh sách turn theo `order_no` kèm tên team,
      không chỉ turn active) nếu `GalaStateOut` schema chưa có sẵn field này, bổ sung

**CBNV — `app/(employee)/gala/[eventId]/page.tsx` + `gala-seat-map.tsx`:**
- [ ] Sửa bộ đếm quota: hiện đúng "số ghế Team đang-tới-lượt đã chọn / quota của chính Team đó" khi
      không phải lượt của mình; giữ hiện số của mình khi đúng lượt mình
- [ ] Thêm dải hàng chờ: "Bạn: thứ N · đang tới lượt: Team X" dùng danh sách turn đầy đủ ở trên
- [ ] Sửa nhãn trạng thái theo đúng `gala_configs.status` (setup/drawing/in_progress/finished) qua `lib/labels.ts`
- [ ] Hiện tên Team trên mỗi ghế đã confirmed (tooltip + nếu đủ chỗ thì text trên ghế), phân biệt màu
      "Team mình" rõ hơn viền hiện tại
- [ ] Thêm đếm ngược hold (`hold_expires_at`) cạnh đếm ngược lượt
- [ ] `heldMine` đổi từ `find` sang `filter` — nút "Bỏ chọn" xử lý nhiều ghế đang giữ
- [ ] Seat button ≥ 44px, thêm `aria-label`, `aria-pressed`; bọc floor plan trong container `overflow-auto`
      có chỉ báo "vuốt để xem" trên mobile
- [ ] `lib/use-gala-ws.ts` — khi `onopen` sau reconnect, gọi `queryClient.invalidateQueries` cho
      `["events", id, "gala", "state"]`; thêm state `connected` hiện chấm xanh/đỏ trên UI

**Admin — `components/domain/gala-admin-panel.tsx`:**
- [ ] Dialog "Sửa cấu hình" nạp giá trị hiện có từ `state.config` khi mở, không dùng hằng số mặc định (`:38-40`)
- [ ] Thêm nút "Mở/Đóng chọn ghế cho CBNV" (đổi `gala_configs.status` tường minh, không chỉ side-effect
      của draw/start) — cần thêm field/endpoint nếu backend chưa hỗ trợ set status trực tiếp
- [ ] Bọc nút "Bốc thăm" bằng `<ConfirmDialog>`; vô hiệu hoá + ẩn hoàn toàn nếu `turns` đã tồn tại (rõ
      ràng "không thể bốc lại", không chỉ disable im lặng)
- [ ] Bọc "Bỏ qua lượt" bằng `<ConfirmDialog>`
- [ ] Thêm sửa/xoá bàn (không chỉ kéo x/y)
- [ ] Hiện đếm ngược cho lượt đang chạy trên màn hình admin
- [ ] Dịch nhãn trạng thái qua `lib/labels.ts`

**Nghiệm thu:** Chrome 2 tab cùng lúc — tab A giữ ghế, tab B thấy ghế chuyển "đang giữ" theo thời gian
thực; cả 2 cùng bấm xác nhận 1 ghế → chỉ 1 tab thành công, tab kia nhận lỗi rõ ràng.

**Đã kiểm chứng:** _(điền khi xong)_

---

### R5 — Admin workspace

**Mục tiêu:** sửa toàn bộ finding còn lại ở audit §3.2, §3.3, §3.6, §3.7, dùng `data-table.tsx` +
`confirm-dialog.tsx` + `job-progress.tsx` từ R2.
**Xong là nhìn thấy gì:** mọi danh sách admin sort/search/export được; không hành động phá huỷ nào thiếu
confirm; xe có đủ field BRD §7.2 và có nút Sửa.

**Điều hướng — `app/admin/layout.tsx`, `event-workspace.tsx`:**
- [ ] Thêm bộ chọn "Sự kiện đang thao tác" vào sidebar, nhớ lựa chọn (localStorage) để không phải vào
      `/admin/events` chọn lại mỗi lần
- [ ] Thêm breadcrumb "← Sự kiện" ở đầu mỗi trang `admin/events/[id]/*`

**Dashboard — `app/admin/page.tsx` + `admin/events/[id]/page.tsx`:**
- [ ] Gộp 2 bản trùng thành 1 component `components/domain/event-dashboard.tsx`, cả 2 trang chỉ truyền `eventId`
- [ ] "Đã lên xe: N" → "N / {tổng cần xe}"; phòng tách riêng số người / số chỗ
- [ ] Thêm trạng thái phân xe **theo từng chặng** (lặp qua legs)
- [ ] Thêm số ca bị `is_flagged` nổi bật, link sang tab Chuyến bay
- [ ] Mỗi card link sang tab xử lý tương ứng

**Danh sách → `data-table.tsx`:** Events, Master Data (Team/Site), Users, Registrations, các bảng
assignment trong flights/buses/hotels, Audit log — thêm sort + search + filter + (nơi cần) export.
- [ ] `registrations-table.tsx` — sửa export gửi đúng query string đang lọc (bug §3.6); thêm option "Tất
      cả" cho mọi filter select + giữ/khôi phục nút "Xoá lọc"

**Confirm cho hành động nguy hiểm** (dùng `<ConfirmDialog>`):
- [ ] Event status transition, đặc biệt `information_published` — hiện số người sẽ nhận mail (đếm
      registrations `submitted && is_participating`) trước khi xác nhận; thêm checklist cảnh báo nếu còn
      ca flagged / xe chưa có trưởng xe / người chưa có phòng
- [ ] Super-admin ghi đè trạng thái
- [ ] Đổi role / khoá / reset mật khẩu user
- [ ] Vô hiệu hoá entity (Master Data)
- [ ] Tạo lịch trình mới (bắn mail `schedule_changed`)
- [ ] Toggle publish schedule item

**Chuyến bay — `flight-allocation-panel.tsx`:**
- [ ] Hiện `summary.flights[].remaining` per-flight (backend đã có, R1 không đổi field này)
- [ ] Hiện chi tiết Team bị tách: tên Team, không chỉ đếm
- [ ] Thêm ô chọn Team để chuyển cả team bằng field `team_id` mới ở R1, thay tick tay từng người
- [ ] Hiện danh sách lỗi import từng dòng (API đã trả, đang vứt)
- [ ] Thêm tab/link xem `GET /allocations` (lịch sử chạy)
- [ ] Bắt nhập lý do thật khi ghi đè (validate không được để nguyên chuỗi mặc định)

**Xe — `bus-allocation-panel.tsx`** (phần bù lớn nhất):
- [ ] Form tạo xe thêm đủ field: `name`, `gather_at`, `depart_at`, `pickup_point_id` (select từ
      `/pickup-points`), `destination`, `note`
- [ ] Thêm cột hành động + dialog Sửa gọi `PATCH /buses/{id}` (đã có, chưa ai gọi)
- [ ] Áp dụng phần "Team select" giống flights cho move-cả-team
- [ ] Dịch `flag_reason` qua `lib/labels.ts` (hiện đang raw)

**Khách sạn — `hotel-rooms-panel.tsx`:**
- [ ] Form hotel đủ field (`address`, `checkin_date`, `checkout_date`, `note`) + Sửa
- [ ] Thêm màn hình CRUD Room Types (API đủ, 0 UI)
- [ ] Sửa/xoá phòng
- [ ] Cho phép đổi phòng người đã gán (không chỉ chọn từ danh sách "chưa có phòng") + nút bỏ gán

**Lịch & Thông báo — `schedule-announcements-panel.tsx`:**
- [ ] Form lịch trình thêm `day_date`, `start_at`, `end_at`, `description`, `audience`
- [ ] Sửa/xoá cho cả lịch trình và thông báo
- [ ] Thông báo: toggle ghim, xem trước markdown khi soạn

**Email — `app/admin/events/[id]/emails/page.tsx`:**
- [ ] Nút xem trước (render `body_html` với dữ liệu mẫu)
- [ ] Nút "Khôi phục mặc định" khi `is_custom`

**Audit — `audit-jobs-panel.tsx`:**
- [ ] Thêm cột người thực hiện (join `actor_user_id` → email, hoặc trả kèm từ backend)
- [ ] Thêm nút mở rộng xem before/after (diff đơn giản dạng 2 cột JSON hoặc list field đổi)
- [ ] Thêm filter theo thời gian/hành động/entity_type, bỏ giới hạn cứng 30 dòng (dùng `data-table.tsx`)
- [ ] CSV export (`ops.py:43-51`) thêm cột before/after (dạng JSON string trong ô)
- [ ] Jobs panel lọc theo `event_id` nếu đang trong context 1 event

**Nghiệm thu:** Chrome thật ngay trong phase — không dồn sang R6.

**Đã kiểm chứng:** _(điền khi xong)_

---

### R6 — Nghiệm thu toàn hệ thống trên trình duyệt

**Mục tiêu:** lần đầu tiên trong dự án, chạy trọn kịch bản BRD §14 bằng trình duyệt thật, không phải curl.

- [ ] `make down && rm -f data/teambuilding.db* && make up && make migrate && make seed`
- [ ] BTC login → Event B: kiểm tra cấu hình → mở đăng ký
- [ ] 3 CBNV khác nhau đăng ký (1 người chọn Không tham gia) → kiểm tra MailHog `localhost:8025`
- [ ] Đóng đăng ký → nhập/import chuyến bay → chạy Auto Flight Allocation → xử lý ca bị flag → chỉnh tay
      1 người **và** cả 1 Team → xác nhận cảnh báo vượt slot hiện đúng
- [ ] Import phân phòng → tạo xe đủ trường (giờ/điểm tập trung/trưởng xe) → chạy phân xe → sửa 1 xe
- [ ] Dựng sơ đồ Gala → bốc thăm → **2 trình duyệt** cùng bấm 1 ghế, xác nhận chỉ 1 bên thành công,
      bên kia nhận thông báo rõ ràng
- [ ] Nhập lịch trình + thông báo → Công bố thông tin (qua checklist mới) → kiểm tra mail hàng loạt
- [ ] CBNV đăng nhập, xem Journey ở khung rộng **390px** — đủ 7 khối, không cuộn ngang
- [ ] Audit log hiện đủ người thực hiện + before/after cho vài thao tác vừa làm
- [ ] Ghi lại GIF các luồng chính (dùng `mcp__claude-in-chrome__gif_creator` nếu chạy bằng Claude Code)

**Sau khi xong:**
- [ ] Cập nhật `docs/PLAN.md` — thêm dòng trỏ sang `docs/REBUILD-PLAN.md` ở đầu file
- [ ] Cập nhật README nếu số tài khoản/lệnh seed thay đổi
- [ ] Điền "Đã kiểm chứng" cho R0–R6 ở tài liệu này

**Đã kiểm chứng:** _(điền khi xong)_

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
