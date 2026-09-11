# PLAN – Hệ thống Quản lý Team Building

> Tài liệu này là nguồn tham chiếu duy nhất cho toàn bộ quá trình triển khai.
> Ở Phase 0, copy file này thành `docs/PLAN.md` trong repo và cập nhật nó mỗi khi hoàn thành một phase
> (đánh dấu `[x]`, ghi chú lệch so với plan). Các session sau chỉ cần đọc `docs/PLAN.md` là tiếp tục được.

---

## 1. Context

Repo `/home/viet/apal_tech/project/team-building-system` hiện chỉ có duy nhất file BRD
`Yeu_cau_xay_dung_he_thong_Quan_ly_Team_Building.docx` — đây là dự án greenfield, chưa có dòng code nào.

BRD yêu cầu một **One-stop Portal** quản lý kỳ Team Building của công ty, gồm 5 module:

1. Đăng ký Team Building (CBNV)
2. Quản lý & phân bổ chuyến bay + khách sạn/phòng
3. Quản lý & điều phối xe (4 chặng)
4. Gala Dinner – bốc thăm/chọn chỗ ngồi
5. My Team Building Journey – dashboard hành trình cá nhân

Cộng thêm Admin Dashboard, Notification/Email, Audit Log, Import/Export Excel, và vòng đời trạng thái chương trình.

Vấn đề đang giải: hiện BTC quản lý rời rạc (Excel, email, chat), CBNV không biết mình bay chuyến nào, đi xe nào,
ở phòng nào. Kết quả mong muốn: một hệ thống duy nhất — Single Source of Truth — nơi CBNV đăng ký và tra cứu
toàn bộ hành trình, còn BTC có công cụ phân bổ tự động + điều chỉnh ngoại lệ.

**Bổ sung ngoài BRD:** một trợ lý chat RAG (Qdrant) hỏi đáp thông tin chuyến đi.

---

## 2. Quyết định kiến trúc đã chốt

| Hạng mục | Quyết định | Ghi chú |
|---|---|---|
| Backend | **FastAPI** (Python 3.12, async) | SQLAlchemy 2.x async + aiosqlite, Alembic, Pydantic v2 |
| Frontend | **Next.js 15** App Router + TypeScript | Tailwind + shadcn/ui, TanStack Query, react-hook-form + zod |
| Database | **SQLite** (WAL mode) | File nằm trong volume Docker; schema thiết kế portable sang Postgres |
| Auth | **Email + mật khẩu, JWT** | Thay cho SSO trong BRD. Access token 15', refresh token 7 ngày (rotate) |
| Queue | **Redis + ARQ** | Worker async, cùng codebase với API. Redis kiêm distributed lock cho Gala |
| Thuật toán phân bổ | **Greedy + trọng số cấu hình được** | Tách sau interface `AllocationStrategy` để thay CP-SAT về sau nếu cần |
| Multi-event | **Có ngay từ đầu** | Mọi bảng nghiệp vụ mang `event_id` |
| Phân phòng | **Quản lý + import + gán thủ công** | Không auto-allocate (đúng đề xuất MVP mục 6 BRD) |
| Vector DB | **Qdrant** | Chỉ dùng ở Phase 8 |
| LLM/Embedding | **Provider-agnostic** | Interface `LLMProvider` / `EmbeddingProvider`, chọn qua env. Mặc định Claude API + embedding local đa ngữ |
| Môi trường | **docker-compose toàn bộ** | api, worker, web, redis, qdrant, mailhog. Có file override cho dev hot-reload |
| Email | SMTP qua MailHog ở dev | Production đổi bằng env, không đổi code |

### Khác biệt so với BRD (cần thông báo với BTC)

| BRD | Thực tế triển khai | Lý do |
|---|---|---|
| Đăng nhập bằng SSO công ty | Email + mật khẩu, tài khoản do Admin import/khởi tạo | Chưa có hạ tầng SSO. Auth tách thành module riêng để cắm SSO sau mà không đụng nghiệp vụ |
| Auto-fill họ tên/email/team từ HRM | Admin import danh sách CBNV từ Excel, form tự điền từ master data đó | Chưa có API nhân sự |
| Auto Room Allocation | Chỉ import + gán thủ công | BRD mục 6 cũng đề xuất vậy cho MVP; quy tắc giới tính/cấp bậc chưa chốt |
| Microsoft Teams notification | Không làm | BRD xếp Phase 2 |
| — | Chat RAG hỏi đáp chuyến đi | Yêu cầu thêm của chủ dự án |

---

## 3. Kiến trúc tổng thể

```
                       ┌────────────────────┐
   Browser ──────────▶ │  web (Next.js)     │  SSR + client fetch
   (CBNV / BTC)        └─────────┬──────────┘
                                 │ REST /api  +  WS /ws/gala  +  SSE /api/chat
                       ┌─────────▼──────────┐
                       │  api (FastAPI)     │──── ghi/đọc ──┐
                       │  - routers         │               │
                       │  - services        │         ┌─────▼──────┐
                       │  - enqueue jobs ───┼────┐    │  SQLite    │
                       └────────────────────┘    │    │  (WAL)     │
                                                 │    └─────▲──────┘
                       ┌────────────────────┐    │          │
                       │  redis             │◀───┘          │
                       │  - ARQ queue       │               │
                       │  - seat locks      │◀──┐           │
                       │  - pub/sub Gala    │   │           │
                       └─────────┬──────────┘   │           │
                                 │ pull job     │           │
                       ┌─────────▼──────────┐   │           │
                       │  worker (ARQ)      │───┴───────────┘
                       │  - allocation      │
                       │  - email           │──▶ mailhog (dev) / SMTP (prod)
                       │  - import/export   │
                       │  - RAG indexing    │──▶ qdrant
                       └────────────────────┘
```

**Nguyên tắc bố cục code:** router (HTTP) → service (nghiệp vụ) → repository/model (dữ liệu).
Worker import thẳng lớp service — không gọi lại API qua HTTP.

---

## 4. Cấu trúc thư mục

```
team-building-system/
├── docker-compose.yml
├── docker-compose.override.yml        # dev: bind mount + hot reload
├── .env.example
├── Makefile                            # make up / down / migrate / seed / test / logs
├── docs/
│   ├── PLAN.md                         # copy của file này
│   ├── BRD.md                          # BRD đã convert sang markdown
│   └── decisions/                      # ADR ngắn khi có quyết định lệch plan
├── apps/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── pyproject.toml              # quản lý bằng uv
│   │   ├── alembic/versions/
│   │   ├── tests/
│   │   └── app/
│   │       ├── main.py                 # FastAPI app, CORS, exception handlers
│   │       ├── core/                   # config, security, deps, logging, errors, pagination
│   │       ├── db/                      # session, base, pragmas (WAL), seed
│   │       ├── models/                  # SQLAlchemy models (mục 5)
│   │       ├── schemas/                 # Pydantic DTO
│   │       ├── routers/                 # auth, events, master, registrations, flights,
│   │       │                            # hotels, buses, gala, journey, admin, jobs,
│   │       │                            # imports, exports, chat, ws
│   │       ├── services/                # nghiệp vụ thuần, không biết HTTP
│   │       │   ├── allocation/          # strategies + scoring + validators
│   │       │   ├── notification/        # template render + outbox
│   │       │   ├── importer/            # excel parse + validate
│   │       │   └── rag/                 # ingest, retrieve, providers
│   │       └── worker/
│   │           ├── settings.py          # ARQ WorkerSettings
│   │           └── tasks/               # 1 file/nhóm task
│   └── web/
│       ├── Dockerfile
│       ├── package.json
│       └── src/
│           ├── app/
│           │   ├── (auth)/login
│           │   ├── (employee)/          # register, journey, announcements, chat
│           │   ├── (gala)/gala          # màn chọn ghế realtime
│           │   └── admin/               # toàn bộ khu quản trị
│           ├── components/              # ui/ (shadcn), shared/, domain/
│           ├── lib/                     # api client, auth, query client, utils
│           └── types/                   # types sinh từ OpenAPI
└── data/                                # volume: teambuilding.db, uploads/
```

---

## 5. Data model

Quy ước chung: `id` INTEGER PK autoincrement, `created_at`/`updated_at` UTC, xoá mềm bằng `is_active` ở master data.
Mọi bảng nghiệp vụ có `event_id` + index trên `(event_id, ...)`.

### 5.1 Auth & tổ chức

- **teams** — `id, code, name, parent_id?, is_active`
- **sites** — `id, code, name, is_active` (HN/HCM… configurable, không hard-code)
- **employees** — `id, employee_code, full_name, email UNIQUE, team_id, site_id, phone, gender?, position?, is_active`
- **users** — `id, employee_id? (FK, nullable cho admin ngoài), email UNIQUE, password_hash, role, is_active, must_change_password, last_login_at`
  - `role` ∈ `employee | team_leader | organizer | super_admin`
- **refresh_tokens** — `id, user_id, token_hash, expires_at, revoked_at, user_agent`

### 5.2 Event & cấu hình

- **events** — `id, code, name, description, start_date, end_date, destination, status, registration_open_at, registration_close_at, published_at`
  - `status` ∈ `draft | registration_open | registration_closed | allocation_processing | information_published | event_started | event_completed` (mục 12 BRD)
- **event_settings** — `id, event_id, key, value_json` — terms & điều kiện, chính sách phí phạt, trọng số phân bổ, cấu hình Gala, hạn sửa đăng ký…
- **shifts** — `id, event_id, code, name, description, depart_after_time?, sort_order` — **không hard-code số ca**
- **transport_legs** — `id, event_id, code, name, direction, sort_order` — mặc định seed 4 chặng, thêm được
- **pickup_points** — `id, event_id, site_id?, name, address, is_active`

### 5.3 Module 1 – Đăng ký

- **registrations** — `id, event_id, employee_id, status (draft|submitted|cancelled), is_participating, shift_id?, agreed_terms_at, terms_version, wish_note, submitted_at, cancelled_at, cancel_reason` — UNIQUE `(event_id, employee_id)`
- **registration_transport_needs** — `id, registration_id, leg_id, is_needed, pickup_point_id?` — UNIQUE `(registration_id, leg_id)`

### 5.4 Module 2 – Chuyến bay & khách sạn

- **flights** — `id, event_id, flight_code, airline, direction (outbound|inbound), shift_id?, depart_at, arrive_at, origin, destination, capacity, note`
- **flight_assignments** — `id, event_id, flight_id, employee_id, direction, source (auto|manual|import), is_locked, is_flagged, flag_reason, assigned_by, assigned_at` — UNIQUE `(event_id, employee_id, direction)`
  - `is_locked`: BTC ghim người này, lần chạy auto sau không được đổi
- **hotels** — `id, event_id, name, address, checkin_date, checkout_date, note`
- **room_types** — `id, hotel_id, name, capacity, quantity`
- **rooms** — `id, hotel_id, room_type_id, room_number, capacity, note`
- **room_assignments** — `id, event_id, room_id, employee_id, source, assigned_by, assigned_at` — UNIQUE `(event_id, employee_id)`

### 5.5 Module 3 – Xe

- **buses** — `id, event_id, leg_id, code, name, capacity, gather_at, depart_at, pickup_point_id?, destination, leader_employee_id?, leader_name?, leader_phone?, note`
- **bus_assignments** — `id, event_id, leg_id, bus_id, employee_id, source, assigned_by, assigned_at` — UNIQUE `(event_id, employee_id, leg_id)`

### 5.6 Module 4 – Gala Dinner

- **gala_configs** — `id, event_id, name, stage_label, turn_duration_seconds, hold_ttl_seconds, seat_quota_rule (by_team_size|fixed), fixed_quota?, status (setup|drawing|in_progress|finished)`
- **gala_tables** — `id, event_id, code, name, x, y, shape (round|rect), seat_count, is_active`
- **gala_seats** — `id, table_id, seat_number, label, status (available|held|confirmed|blocked), held_by_team_id?, hold_expires_at?, team_id?, employee_id?, version`
- **gala_turns** — `id, event_id, team_id, order_no, seat_quota, status (waiting|active|done|skipped|expired), started_at, expires_at`

### 5.7 Lịch trình, thông báo, vận hành

- **schedule_items** — `id, event_id, day_date, start_at, end_at, title, description, location, audience (all|shift|team), audience_ref_id?, sort_order, is_published`
- **announcements** — `id, event_id, title, body_md, is_pinned, published_at, created_by`
- **email_templates** — `id, event_id?, code, subject, body_html, description` — code: `registration_confirmed`, `info_published`, `flight_changed`, `bus_changed`, `schedule_changed`, `otp_reset`…
- **email_outbox** — `id, event_id?, to_email, template_code, payload_json, dedupe_key UNIQUE, status (queued|sending|sent|failed), attempts, last_error, sent_at`
- **jobs** — `id, arq_job_id, type, status (queued|running|succeeded|failed), params_json, progress, total, result_json, error, created_by, created_at, finished_at`
- **allocation_runs** — `id, event_id, job_id, type (flight|bus), params_json (trọng số), summary_json (đã xếp / còn slot / số Team bị tách / số flag), status, created_by`
- **import_batches** — `id, event_id?, type, filename, storage_path, status, total_rows, ok_rows, error_rows, errors_json, created_by`
- **audit_logs** — `id, event_id?, actor_user_id, action, entity_type, entity_id, before_json, after_json, reason, ip, created_at`

### 5.8 RAG (Phase 8)

- **rag_documents** — `id, event_id, source_type, source_id, title, content, checksum, scope (public|employee), scope_ref_id?, chunk_count, indexed_at`
- **chat_sessions** — `id, user_id, event_id, title, created_at`
- **chat_messages** — `id, session_id, role (user|assistant), content, citations_json, tokens, created_at`

---

## 6. Thiết kế Queue & Worker

**Hàng đợi ARQ** (`apps/api/app/worker/settings.py`), các queue tách theo mức ưu tiên:
`q:default`, `q:email`, `q:heavy` (allocation, import/export, RAG index).

| Task | Trigger | Ghi chú |
|---|---|---|
| `send_email` | API/service enqueue | Đọc `email_outbox`, render template, gửi SMTP. Retry 3 lần, backoff 5s/30s/120s |
| `send_bulk_emails` | Publish thông tin, thay đổi hàng loạt | Fan-out thành nhiều `send_email`, chunk 100 |
| `run_flight_allocation` | Admin bấm "Chạy phân bổ" | Ghi `allocation_runs`, cập nhật `progress` |
| `run_bus_allocation` | Admin bấm "Phân xe" | Phụ thuộc kết quả flight |
| `import_excel` | Upload file | Parse → validate → ghi `import_batches.errors_json` |
| `export_dataset` | Admin bấm Export | Sinh file vào `data/exports/`, trả link tải |
| `reindex_rag` | Sau khi publish / cron | Diff theo `checksum`, chỉ re-embed phần đổi |
| `expire_gala_holds` | ARQ cron mỗi 5s khi Gala `in_progress` | Nhả ghế hết TTL, chuyển lượt nếu hết giờ |

**Quy tắc bắt buộc:**
- API **không bao giờ** chạy tác vụ > 1 giây trong request. Luôn trả `202 + {job_id}`, FE poll `GET /api/jobs/{id}` (hoặc nghe WS).
- Mọi task **idempotent**: email chống trùng bằng `email_outbox.dedupe_key`; allocation chạy trong 1 transaction, kết quả cũ bị thay hoàn toàn trừ bản ghi `is_locked`.
- Ghi `jobs` trong SQLite song song với ARQ (kết quả ARQ trong Redis có TTL, không đủ cho UI lịch sử).
- **SQLite chỉ có 1 writer**: bật `PRAGMA journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`. Task dài phải chia transaction ngắn theo batch (500 rows), không giữ write-lock suốt job.

---

## 7. Thuật toán phân bổ

### 7.1 Auto Flight Allocation (mục 5.3–5.4 BRD)

Trọng số lưu trong `event_settings['flight_allocation_weights']`, sửa được trong Admin:

```python
DEFAULT_WEIGHTS = {
    "same_shift": 10,       # đúng nguyện vọng ca của cá nhân
    "team_together": 8,     # mỗi thành viên cùng Team đã ở chuyến đó
    "fill_rate": 2,         # ưu tiên lấp đầy chuyến đang dùng dở
    "split_penalty": 15,    # phạt mỗi lần phải tách Team
}
```

Thuật toán (greedy, chạy riêng cho mỗi `direction`):

1. Gom CBNV đã `submitted` + `is_participating` theo Team → sắp xếp Team giảm dần theo size.
2. Giữ nguyên các assignment có `is_locked`, trừ slot tương ứng.
3. Với mỗi Team: thử xếp **nguyên khối** vào chuyến còn đủ slot, chấm điểm mọi chuyến khả thi → chọn điểm cao nhất.
4. Không đủ slot ở bất kỳ chuyến nào → tách: chia Team theo nguyện vọng ca, xếp nhóm con lớn nhất trước, cộng `split_penalty` và **flag** từng bản ghi bị tách ca sai nguyện vọng.
5. CBNV còn dư không xếp được → `is_flagged = true`, `flag_reason = 'no_slot'` để BTC xử lý (mục 5.3 BRD).
6. Ghi `allocation_runs.summary_json`: đã xếp / tổng, slot còn lại theo từng chuyến, số Team bị tách, danh sách flag.

**Manual Adjustment** (mục 5.5): endpoint đổi 1 người hoặc cả nhóm sang chuyến khác; service validate lại
sức chứa → trả cảnh báo `over_capacity` / `shift_mismatch` / `team_split`; BTC vẫn có thể xác nhận ghi đè
kèm `reason`, và mọi thay đổi ghi `audit_logs`.

### 7.2 Auto Bus Allocation (mục 7.3)

Chạy sau khi có kết quả chuyến bay, cho từng `leg`. Thứ tự ưu tiên: (1) cùng chuyến bay → (2) cùng Team →
(3) tối ưu công suất → (4) không vượt sức chứa. Cùng hạ tầng `AllocationStrategy`, cùng cơ chế flag + manual adjust.

---

## 8. Phân quyền

| Vai trò | Quyền |
|---|---|
| `employee` | Đăng ký/sửa đăng ký **của mình** trong thời gian cho phép; xem Journey của mình; chat RAG trong phạm vi dữ liệu của mình |
| `team_leader` | Như employee + xem danh sách/trạng thái Team mình; thao tác chọn ghế Gala cho Team |
| `organizer` (BTC) | Toàn bộ khu Admin của event được gán: master data, chuyến bay, xe, phòng, Gala, lịch trình, thông báo, chạy phân bổ, import/export |
| `super_admin` | Như organizer + quản lý tài khoản, phân quyền, cấu hình hệ thống, xem audit log đầy đủ |

Thực thi bằng FastAPI dependency `require_roles(...)` + `scope_to_self()` cho endpoint dữ liệu cá nhân.
**Không lọc quyền ở frontend** — FE chỉ ẩn UI, BE luôn kiểm tra lại.

---

## 9. Lộ trình triển khai theo phase

Mỗi phase kết thúc bằng một trạng thái **chạy được end-to-end** (`make up` lên là dùng được).
Sau mỗi phase: cập nhật `docs/PLAN.md`, commit.

### Phase 0 — Nền tảng & Docker
- [ ] Khởi tạo git repo, `.gitignore`, `.env.example`, `Makefile`
- [ ] Convert BRD `.docx` → `docs/BRD.md`; copy plan này → `docs/PLAN.md`
- [ ] `apps/api`: FastAPI skeleton, `core/config.py` (pydantic-settings), `db/session.py` (async engine + PRAGMA WAL),
      Alembic init, `/health`, structured logging (JSON), exception handler chuẩn hoá lỗi
- [ ] `apps/web`: Next.js 15 + TS + Tailwind + shadcn/ui, TanStack Query provider, API client (fetch wrapper + refresh token), layout gốc
- [ ] **Docker**: `apps/api/Dockerfile` (python:3.12-slim + uv), `apps/web/Dockerfile` (node:22-alpine multi-stage, output standalone)
- [ ] **docker-compose.yml**: `api` (8000), `worker`, `web` (3000), `redis` (7-alpine), `qdrant`, `mailhog` (8025 UI)
      — volumes `./data:/data`, `redis_data`, `qdrant_storage`; healthcheck cho redis/qdrant; `depends_on` có điều kiện
- [ ] **docker-compose.override.yml** (dev): bind mount source, `uvicorn --reload`, `next dev`, ARQ `--watch`
- **Xong khi:** `make up` → web gọi được `/health` của api, worker log "connected to redis", MailHog UI mở được

### Phase 1 — Auth, RBAC, Master data, Event lifecycle
- [ ] Models + migration: `teams, sites, employees, users, refresh_tokens, events, event_settings, shifts, transport_legs, pickup_points, audit_logs`
- [ ] Auth: `POST /api/auth/login|refresh|logout`, `GET /api/auth/me`, `POST /api/auth/change-password`; bcrypt; JWT access 15' + refresh 7d rotate
- [ ] Dependency phân quyền + audit log middleware cho mọi thao tác ghi của admin
- [ ] CRUD master data (teams, sites, shifts, legs, pickup points) + import CBNV từ Excel (qua queue) với báo cáo lỗi từng dòng
- [ ] Event CRUD + **state machine** chuyển trạng thái có validate (không cho mở lại đăng ký khi đã published trừ super_admin)
- [ ] FE: trang login, admin shell (sidebar + guard theo role), trang quản lý master data, trang quản lý event
- [ ] Seed script: 1 super_admin, 2 site, ~8 team, ~120 employee giả, 1 event demo
- **Xong khi:** login được bằng 3 vai trò, import 120 CBNV từ Excel mẫu, đổi trạng thái event trên UI

### Phase 2 — Module 1: Đăng ký Team Building + Email
- [ ] Models: `registrations`, `registration_transport_needs`, `email_templates`, `email_outbox`, `jobs`
- [ ] API: `GET/PUT /api/registrations/me`, `POST /api/registrations/me/submit`, `POST .../cancel`;
      chặn theo `event.status` và hạn `registration_close_at`
- [ ] Validate: chọn "Có tham gia" → bắt buộc tick đã đọc quy định + chính sách phí phạt mới cho Submit (mục 4.3)
- [ ] Nhu cầu xe 4 chặng + chọn điểm đón/trả từ `pickup_points` (mục 4.5); ô mong muốn tự do (mục 4.6)
- [ ] Task `send_email` + template `registration_confirmed` (Team, trạng thái, ca, nhu cầu xe) — mục 4.7
- [ ] Admin: danh sách đăng ký có search/filter/sort/export Excel; xem cột "mong muốn"
- [ ] FE: form đăng ký (react-hook-form + zod), màn hình xác nhận thành công, banner trạng thái event
- **Xong khi:** CBNV đăng ký xong nhận email trong MailHog; admin export danh sách ra Excel

### Phase 3 — Module 2a: Chuyến bay + Auto Allocation
- [ ] Models: `flights`, `flight_assignments`, `allocation_runs`, `import_batches`
- [ ] CRUD chuyến bay + import Excel (mã chuyến, ngày/giờ, điểm đi/đến, slot)
- [ ] `services/allocation/`: interface `AllocationStrategy`, `GreedyFlightStrategy`, scoring theo trọng số, validators
- [ ] `POST /api/events/{id}/allocations/flight` → `202 {job_id}`; worker chạy; `GET /api/jobs/{id}` theo dõi progress
- [ ] Màn hình kết quả: theo chuyến (đã xếp/slot còn lại), theo Team (mức độ bị tách), danh sách **flag** cần xử lý
- [ ] Manual adjustment: đổi 1 người / bulk cả nhóm, ghim `is_locked`, cảnh báo vượt slot & vi phạm quy tắc, bắt nhập lý do
- [ ] Audit log đầy đủ before/after (mục 5.6)
- **Xong khi:** chạy phân bổ cho 120 CBNV + ~6 chuyến, xem được báo cáo, chỉnh tay được và có cảnh báo đúng

### Phase 4 — Module 2b: Khách sạn & phòng
- [ ] Models: `hotels`, `room_types`, `rooms`, `room_assignments`
- [ ] CRUD khách sạn/loại phòng/phòng + import danh sách phòng và **import kết quả phân phòng** từ Excel
- [ ] Màn gán thủ công: danh sách CBNV chưa có phòng ↔ sơ đồ phòng, validate sức chứa
- [ ] Export danh sách phân phòng
- **Xong khi:** import được file phân phòng mẫu, gán tay được, không cho vượt sức chứa

### Phase 5 — Module 3: Xe & điều phối
- [ ] Models: `buses`, `bus_assignments`
- [ ] CRUD xe theo từng chặng (mã, sức chứa, giờ tập trung/khởi hành, điểm đón/đến); chỉ định **Trưởng xe** (họ tên + SĐT — mục 7.4)
- [ ] `GreedyBusStrategy` chạy qua queue, ưu tiên cùng chuyến bay → cùng Team → lấp đầy → không vượt sức chứa
- [ ] Manual adjust + cảnh báo + audit; export danh sách xe theo chặng
- **Xong khi:** phân xe tự động cho cả 4 chặng dựa trên kết quả Phase 3, in được danh sách từng xe

### Phase 6 — Module 5: My Team Building Journey + Thông báo
- [ ] Models: `schedule_items`, `announcements`
- [ ] `GET /api/journey/me` — aggregate 1 lần gọi: cá nhân & Team, chuyến bay đi/về, xe 4 chặng (kèm Trưởng xe),
      khách sạn/phòng, chỗ Gala (nếu có), lịch trình, thông báo mới nhất
- [ ] Chỉ trả dữ liệu khi `event.status = information_published` (trừ admin xem preview)
- [ ] Admin: soạn lịch trình, soạn thông báo, nút **Công bố thông tin** → enqueue `send_bulk_emails`
- [ ] Trigger email khi đổi chuyến bay / đổi xe / đổi lịch trình (mục 11) — gom nhóm, chống spam bằng `dedupe_key`
- [ ] FE: trang Journey dạng timeline, responsive mobile-first (mục 13)
- **Xong khi:** publish event → toàn bộ CBNV nhận email, mở trang thấy đủ hành trình trên điện thoại

### Phase 7 — Module 4: Gala Dinner
- [ ] Models: `gala_configs`, `gala_tables`, `gala_seats`, `gala_turns`
- [ ] Admin: trình dựng sơ đồ (kéo thả bàn trên canvas, đặt vị trí sân khấu, set số ghế/bàn, khoá ghế không khả dụng)
- [ ] Bốc thăm: random thứ tự Team (seed lưu lại để tái lập), cấu hình thời gian mỗi lượt (mục 8.3)
- [ ] Quota ghế theo số thành viên hợp lệ của Team (mục 8.4)
- [ ] **Seat locking** (mục 8.5): `SET seat:{id} {team_id} NX EX {ttl}` trên Redis khi chọn → confirm ghi DB trong
      transaction có kiểm tra `version` (optimistic lock) → nhả khoá. Cron `expire_gala_holds` dọn hold quá hạn
- [ ] `WS /ws/gala/{event_id}`: broadcast trạng thái ghế + lượt hiện tại qua Redis pub/sub
- [ ] FE: sơ đồ kiểu chọn ghế rạp phim, 4 trạng thái ghế (trống / đã chọn / của Team mình / không khả dụng), đồng hồ đếm ngược
- **Xong khi:** 2 trình duyệt cùng chọn 1 ghế → chỉ 1 thành công, bên kia thấy ghế đổi trạng thái tức thì

### Phase 8 — Chat RAG (Qdrant)
- [ ] `services/rag/providers/`: interface `LLMProvider` + `EmbeddingProvider`, implement Anthropic + OpenAI + local, chọn qua env
- [ ] Ingest: chuyển dữ liệu event thành `rag_documents` (lịch trình, thông báo, quy định, thông tin khách sạn,
      FAQ do BTC nhập) + tài liệu cá nhân hoá (hành trình của từng CBNV) với `scope`
- [ ] Task `reindex_rag`: chunk → embed → upsert Qdrant (payload có `event_id`, `scope`, `scope_ref_id`)
- [ ] Retrieval **có lọc quyền**: filter Qdrant theo `scope in ['public']` OR `scope_ref_id == user.employee_id`
      — tuyệt đối không để CBNV hỏi ra thông tin người khác
- [ ] `POST /api/chat/sessions/{id}/messages` streaming SSE, trả kèm citations
- [ ] FE: trang chat, hiển thị nguồn trích dẫn, gợi ý câu hỏi mẫu
- **Xong khi:** hỏi "mấy giờ tôi tập trung ở sân bay?" trả đúng theo dữ liệu cá nhân, và không lộ dữ liệu người khác

### Phase 9 — Hoàn thiện
- [ ] Admin Dashboard (mục 10): tổng CBNV, đã/chưa đăng ký, theo ca, nhu cầu xe từng chặng, tình trạng slot bay, tình trạng phân xe/phòng
- [ ] Chuẩn hoá export Excel toàn hệ thống; màn hình xem Audit log + Jobs
- [ ] Tests: pytest cho allocation/permission/state machine; Playwright smoke cho 3 luồng chính
- [ ] Rà responsive mobile, trang lỗi, empty state, loading skeleton
- [ ] `README.md` hướng dẫn chạy, biến môi trường, backup file SQLite

---

## 10. Docker

**`docker-compose.yml`** (production-like) — 6 service:

| Service | Image/Build | Port | Volume | Ghi chú |
|---|---|---|---|---|
| `api` | build `apps/api` | 8000 | `./data:/data` | `uvicorn app.main:app --host 0.0.0.0`; chạy `alembic upgrade head` lúc khởi động |
| `worker` | cùng image `api` | — | `./data:/data` | `arq app.worker.settings.WorkerSettings` |
| `web` | build `apps/web` | 3000 | — | Next standalone output; `NEXT_PUBLIC_API_URL` |
| `redis` | `redis:7-alpine` | 6379 | `redis_data` | `--appendonly yes`, healthcheck `redis-cli ping` |
| `qdrant` | `qdrant/qdrant:latest` | 6333 | `qdrant_storage` | chỉ cần từ Phase 8 (profile `rag`) |
| `mailhog` | `mailhog/mailhog` | 1025/8025 | — | dev only (profile `dev`) |

**`docker-compose.override.yml`** (tự động áp dụng khi dev): bind mount `./apps/api:/app` và `./apps/web:/app`,
`uvicorn --reload`, `next dev`, `arq --watch`, `NODE_ENV=development`.

**Biến môi trường chính** (`.env.example`): `DATABASE_URL=sqlite+aiosqlite:////data/teambuilding.db`,
`REDIS_URL`, `JWT_SECRET`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_DAYS`, `SMTP_HOST/PORT/USER/PASS/FROM`,
`APP_BASE_URL`, `QDRANT_URL`, `LLM_PROVIDER`, `EMBEDDING_PROVIDER`, `ANTHROPIC_API_KEY`, `CORS_ORIGINS`.

**Lưu ý SQLite trong Docker:** file DB nằm trên bind mount `./data` (không phải named volume) để backup bằng
`cp` được; `api` và `worker` cùng mount — bắt buộc WAL + `busy_timeout`.

---

## 11. Cách kiểm thử

Sau mỗi phase, chạy kiểm thử thủ công theo kịch bản tương ứng, cộng với:

```bash
make up                 # dựng toàn bộ stack
make migrate            # alembic upgrade head
make seed               # tạo dữ liệu demo: 1 event, ~120 CBNV, 8 team, 6 chuyến bay
make test               # pytest (api) + vitest (web)
make logs s=worker      # theo dõi worker
```

**Kịch bản end-to-end nghiệm thu toàn hệ thống** (chạy sau Phase 9):

1. Super admin login → tạo event → import 120 CBNV → cấu hình 2 ca, 4 chặng, điểm đón → mở đăng ký
2. 3 CBNV khác nhau login → đăng ký (1 người không tham gia) → kiểm tra email trong MailHog `localhost:8025`
3. Đóng đăng ký → nhập 6 chuyến bay → chạy Auto Flight Allocation → kiểm tra `allocation_runs.summary_json`,
   xử lý các bản ghi flag, chỉnh tay 1 người và xác nhận có cảnh báo vượt slot
4. Import phân phòng → tạo xe cho 4 chặng → chạy phân xe → gán Trưởng xe
5. Dựng sơ đồ Gala → bốc thăm → mở 2 trình duyệt chọn cùng 1 ghế, xác nhận chỉ 1 bên thành công
6. Nhập lịch trình + thông báo → **Công bố thông tin** → kiểm tra email hàng loạt trong MailHog
7. CBNV login trên màn hình rộng 390px → xem Journey đủ 6 khối thông tin
8. Mở chat RAG hỏi về giờ tập trung/khách sạn/lịch trình → xác nhận có citation và **không** trả được dữ liệu của người khác
9. Kiểm tra Audit log ghi đủ mọi thay đổi, Jobs hiển thị lịch sử chạy

---

## 12. Câu hỏi còn mở với BTC (mục 16 BRD)

Plan đã chọn mặc định hợp lý cho tất cả; khi BTC chốt khác thì chỉ cần đổi cấu hình, **không phải sửa kiến trúc**:

| # | Câu hỏi BRD | Mặc định đang áp dụng |
|---|---|---|
| 1, 4 | Ưu tiên Team đi cùng hay đúng ca? | Trọng số cấu hình được; mặc định ưu tiên đúng ca nhẹ hơn giữ Team nguyên khối |
| 2 | Ca là nguyện vọng hay có đối tượng ưu tiên bắt buộc? | Nguyện vọng; có `is_locked` để BTC ghim trường hợp bắt buộc |
| 3 | Quy tắc tách Team khi thiếu slot | Tách theo nguyện vọng ca, giữ nhóm con lớn nhất, flag phần còn lại |
| 5, 6 | Phân phòng tự động hay thủ công? Quy tắc? | Import + gán thủ công. Auto để Phase sau khi chốt quy tắc |
| 7, 8 | Cơ chế Gala & ai đại diện Team? | Random thứ tự Team → đại diện chọn ghế theo lượt; vai trò `team_leader` |
| 9 | CBNV sửa đăng ký đến khi nào? | Đến `registration_close_at`, cấu hình theo event |
| 10 | Nguồn dữ liệu CBNV | Import Excel (chưa có SSO/API) |

---

## 13. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| SQLite nghẽn ghi khi worker chạy job dài + API ghi đồng thời | WAL + `busy_timeout` + transaction ngắn theo batch. Nếu vẫn nghẽn: đổi `DATABASE_URL` sang Postgres (schema đã portable) |
| Gala Dinner có 100+ người thao tác cùng lúc | Khoá ghế trên Redis (atomic `SET NX`) + optimistic lock DB + broadcast qua pub/sub; test tải trước sự kiện |
| Chat RAG rò rỉ dữ liệu cá nhân người khác | Lọc quyền ở tầng Qdrant filter **và** kiểm tra lại ở tầng service; có test riêng cho việc này |
| Chất lượng phân bổ không vừa ý BTC | Trọng số sửa được trong Admin + luôn có manual adjustment; `AllocationStrategy` cho phép thay bằng CP-SAT sau |
| Không có SSO → quản lý mật khẩu | `must_change_password` ở lần đầu; auth tách module để cắm SSO sau |
