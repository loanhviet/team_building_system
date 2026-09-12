# PLAN – Hệ thống Quản lý Team Building

> Tài liệu này là nguồn tham chiếu duy nhất cho toàn bộ quá trình triển khai.
> Ở Phase 0, copy file này thành `docs/PLAN.md` trong repo và cập nhật nó mỗi khi hoàn thành một phase
> (đánh dấu `[x]`, ghi chú lệch so với plan). Các session sau chỉ cần đọc `docs/PLAN.md` là tiếp tục được.

> **Cập nhật 2026-09-12:** Phase 0-13 dưới đây mô tả đúng lịch sử triển khai (kiến trúc, data model,
> thuật toán phân bổ, migration — vẫn tra cứu ở đây). Nhưng sau khi dùng thử, hệ thống lộ ra nhiều
> khoảng trống so với `docs/BRD.md` (dữ liệu demo rỗng, một số trường BRD bắt buộc không có ô nhập
> trong Admin, lớp UI chưa hoàn thiện) — nguyên nhân gốc là 13 phase trước chưa từng click-through
> bằng trình duyệt thật. **Nguồn sự thật cho công việc đang làm là
> [`docs/REBUILD-PLAN.md`](REBUILD-PLAN.md)** (đợt làm lại R0-R6): đọc file đó trước khi sửa bất kỳ
> phần nào của hệ thống.

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
| LLM/Embedding | **Provider-agnostic** | Interface `LLMProvider` / `EmbeddingProvider`, chọn qua env. Embedding: fastembed local đa ngữ. LLM: đang cấu hình DashScope (Qwen3-Max-Preview) qua endpoint tương thích OpenAI thay vì Claude API — đổi bằng `LLM_PROVIDER` trong `.env`, không cần sửa code |
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

### Phase 0 — Nền tảng & Docker ✅ (2026-09-11)
- [x] Khởi tạo git repo, `.gitignore`, `.env.example`, `Makefile`
- [x] Convert BRD `.docx` → `docs/BRD.md`; copy plan này → `docs/PLAN.md`
- [x] `apps/api`: FastAPI skeleton, `core/config.py` (pydantic-settings), `db/session.py` (async engine + PRAGMA WAL),
      Alembic init, `/api/health`, structured logging (JSON), exception handler chuẩn hoá lỗi
- [x] `apps/web`: Next.js **16** (npx create-next-app@latest lấy bản mới nhất, không phải 15 như dự kiến ban đầu —
      không ảnh hưởng kiến trúc, App Router + `output: standalone` vẫn hoạt động như plan) + TS + Tailwind,
      TanStack Query provider, API client fetch wrapper cơ bản (chưa có refresh-token — sẽ bổ sung cùng Auth ở Phase 1),
      trang chủ gọi thử `/api/health`. shadcn/ui **chưa cài** — để lúc cần UI component thật ở Phase 1/2
- [x] **Docker**: `apps/api/Dockerfile` (python:3.12-slim + uv), `apps/web/Dockerfile` (node:22-alpine multi-stage, output standalone)
- [x] **docker-compose.yml**: `api` (8000), `worker`, `web` (3000), `redis` (7-alpine), `qdrant` (profile `rag`, dùng từ Phase 8)
      — volumes `./data:/data`, `redis_data`, `qdrant_storage`; healthcheck redis; `depends_on: condition: service_healthy`
- [x] **docker-compose.override.yml** (dev, tự động áp dụng): bind mount source, `uvicorn --reload`, `next dev` (Turbopack),
      `arq --watch`, và **MailHog** (8025) định nghĩa riêng ở đây vì chỉ cần khi dev
- [x] ARQ worker cần tối thiểu 1 task mới khởi động được → thêm task `ping` placeholder (`app/worker/tasks/system.py`),
      sẽ có task thật từ Phase 2 (`send_email`)
- **Đã kiểm chứng:** `docker compose up -d --build` → `GET /api/health` trả `{"status":"ok"}`, web hiển thị "API status: ok",
      worker log "connected to redis", MailHog UI mở ở `:8025` trả 200, `ruff check` và `next lint` đều sạch
- **Xong khi:** `make up` → web gọi được `/api/health`, worker log "connected to redis", MailHog UI mở được

### Phase 1 — Auth, RBAC, Master data, Event lifecycle ✅ (2026-09-12)
- [x] Models + migration: `teams, sites, employees, users, refresh_tokens, events, event_settings, shifts, transport_legs, pickup_points, audit_logs`
      — cộng `jobs`, `import_batches` kéo sớm từ Phase 2/3 vì employee import cần ngay
- [x] Auth: `POST /api/auth/login|refresh|logout`, `GET /api/auth/me`, `POST /api/auth/change-password`.
      Access token (15') trả trong JSON, đọc qua header `Authorization`; refresh token (7d, rotate mỗi lần
      dùng) là httpOnly cookie, hash SHA-256 lưu DB. Mật khẩu hash bằng **bcrypt trực tiếp**, không qua
      passlib — bản tự-test nội bộ của passlib xung đột với bcrypt>=4.1 (`password cannot be longer than 72
      bytes`), gỡ passlib thay vì ghim version
- [x] Phân quyền: `require_roles/require_admin/require_super_admin` (FastAPI dependency) + `record_audit()`
      gọi tường minh trong từng endpoint ghi của admin (không dùng middleware tự động — cần biết before/after
      per entity nên middleware không đủ ngữ cảnh)
- [x] CRUD master data: service generic `services/master_data.py` (list/get_or_404/create/update/soft_delete
      dùng PEP 695 generics) tái dùng cho cả 5 entity (teams, sites, shifts, transport_legs, pickup_points)
- [x] Import CBNV từ Excel qua ARQ: upload → `ImportBatch`+`Job` → worker parse (openpyxl) → mỗi dòng chạy
      trong 1 SAVEPOINT (`db.begin_nested()`) nên 1 dòng lỗi không làm mất các dòng đã ok trong cùng batch →
      upsert Employee + tự tạo User (role=employee, mật khẩu khởi tạo = employee_code, must_change_password)
- [x] Event CRUD + state machine (`services/event_service.py`): organizer chỉ đi theo `FORWARD_TRANSITIONS`;
      super_admin ghi đè được sang bất kỳ trạng thái nào, mọi lần chuyển đều ghi audit log
- [x] FE: Next.js 16 + shadcn/ui — **lưu ý: bản shadcn CLI hiện tại mặc định dùng `@base-ui/react`, không phải
      Radix** → `Dialog`/`Button` không có prop `asChild`, phải dùng `buttonVariants()` làm className thẳng lên
      trigger. Login page, admin shell (sidebar + guard theo role — chỉ để chặn hiển thị, BE mới là nơi enforce
      thật), trang master-data (tabs Team/Site), trang events (list/create/transition + cấu hình
      shift/leg/pickup-point lồng trong từng event), trang employees (list + import Excel có poll job)
- [x] Seed script: 1 super_admin, 1 organizer, 2 site, 8 team, 120 employee giả (1 promote team_leader), 1 event draft
- **Bug phát hiện & sửa khi nối end-to-end** (xem chi tiết trong log commit): (1) lỗi 500 bị nuốt không log —
      `unhandled_exception_handler` giờ gọi `logger.exception`; (2) SQLite không lưu tz-aware datetime thật, trộn
      `datetime.now(UTC)` (aware) với giá trị đọc lại từ DB (naive) văng `TypeError` — chuẩn hoá toàn bộ app dùng
      naive-UTC qua `app/core/time.py::utcnow()`, bỏ `DateTime(timezone=True)`; (3) `WorkerSettings.queue_name`
      đặt khác mặc định của `enqueue_job()` nên job nằm im trong Redis, worker không bao giờ nhặt — bỏ override;
      (4) dev override dùng named volume `web_node_modules` nên thêm package mới (shadcn, sonner) không tự
      vào container đang chạy — phải xoá volume để nó tạo lại từ image mới build
- **Đã kiểm chứng:** login 3 vai trò qua curl; RBAC chặn đúng (employee POST /teams → 403); state machine
      (organizer forward-only, super_admin override) qua curl; import Excel mẫu (2 dòng OK + 2 dòng lỗi, báo lỗi
      đúng theo dòng) và nhân viên mới import login được ngay; cả 8 route FE build/type-check sạch (`next build`)
      và trả 200 khi chạy `next dev` trong container. **Chưa** click-through bằng trình duyệt thật — không có
      công cụ browser automation khả dụng trong phiên này, cần verify thủ công trước khi coi UI là "done" thật sự
- **Xong khi:** login được bằng 3 vai trò, import 120 CBNV từ Excel mẫu, đổi trạng thái event trên UI

### Phase 2 — Module 1: Đăng ký Team Building + Email ✅ (2026-09-12)
- [x] Models: `registrations`, `registration_transport_needs`, `email_templates`, `email_outbox`
      (`jobs` đã có từ Phase 1)
- [x] API: `GET/PUT /api/events/{id}/registrations/me`, `POST .../me/submit`, `POST .../me/cancel`
      (nested dưới event thay vì global `/registrations/me` — nhất quán với shifts/legs/pickup-points,
      và multi-event cần biết đăng ký cho event nào); chặn theo `event.status == registration_open` và
      `registration_close_at`. Thêm `GET /api/events/current` (event đang mở đăng ký — phải khai báo
      **trước** `GET /{event_id}` trong router, nếu không path param sẽ nuốt luôn literal "current" rồi
      lỗi convert sang int) và `GET /api/events/{id}/terms` (đọc từ `event_settings`, có default)
- [x] Validate: "Có tham gia" bắt buộc tick đồng ý quy định mới Submit được (mục 4.3) — chặn ở service
      layer (`submit_registration`), không chỉ ở FE
- [x] Nhu cầu xe theo từng chặng (`transport_needs`) + chọn điểm đón/trả từ `pickup_points` (mục 4.5);
      ô mong muốn tự do `wish_note` (mục 4.6)
- [x] Task `send_email` (ARQ, `max_tries=3` dùng cơ chế retry sẵn có của arq thay vì tự viết backoff
      5s/30s/120s — không đáng để thêm code) + template `registration_confirmed`, render bằng Jinja2 từ
      `EmailTemplate` trong DB nếu có, fallback về template mặc định hard-code trong
      `services/notification/email_service.py`. `enqueue_email()` idempotent theo `dedupe_key`
- [x] Admin: danh sách đăng ký có search + export Excel (đồng bộ, không qua queue — vài trăm dòng chưa
      tới ngưỡng cần queue theo tinh thần mục 6 PLAN; chuẩn hoá toàn bộ export vào queue ở Phase 9)
- [x] FE: `/register` — form một trang (radio tham gia, select ca, checkbox nhu cầu xe + chọn điểm đón,
      textarea mong muốn, checkbox đồng ý quy định), banner khi đã submit, nút huỷ đăng ký. Tab "Đăng ký"
      trong trang chi tiết event (admin) hiển thị danh sách + nút export
- **Bug/quyết định đáng chú ý:** form đăng ký ban đầu dùng `useEffect` để đồng bộ state từ dữ liệu
      registration fetch về — bị eslint rule mới (`react-hooks/set-state-in-effect`) chặn vì dễ gây
      cascading render; sửa bằng cách tách thành component con `RegistrationForm` nhận `registration` làm
      prop, khởi tạo `useState` bằng lazy initializer, và `key={registration.id}` ở component cha để remount
      thay vì đồng bộ qua effect — đúng pattern React khuyến nghị cho "derive local state from server data"
- **Đã kiểm chứng:** toàn bộ flow qua curl (mở đăng ký → xem terms → PUT nháp → submit thiếu tick quy định
      bị chặn 400 → submit hợp lệ → email xuất hiện đúng nội dung trong MailHog → admin list thấy đăng ký →
      export ra đúng file .xlsx đọc lại được); `ruff check`, `next lint`, `next build` đều sạch; 9 route FE
      trả 200 khi chạy trong container dev. Chưa test bằng click chuột thật trên trình duyệt (xem ghi chú
      Phase 1 — vẫn chưa có công cụ browser automation khả dụng trong phiên làm việc)
- **Xong khi:** CBNV đăng ký xong nhận email trong MailHog; admin export danh sách ra Excel

### Phase 3 — Module 2a: Chuyến bay + Auto Allocation ✅ (2026-09-12)
- [x] Models: `flights`, `flight_assignments`, `allocation_runs` (`import_batches` đã có từ Phase 1).
      **`flight_assignments.flight_id` là nullable** — khác thiết kế ban đầu (xem bug bên dưới)
- [x] CRUD chuyến bay (`/api/events/{id}/flights`) + import Excel — import chạy **đồng bộ** (không qua
      queue) vì chỉ vài chục dòng, cùng lý do như export đăng ký ở Phase 2
- [x] `services/allocation/`: `AllocationStrategy` (Protocol) trong `base.py` cùng dataclass thuần
      (`Candidate/TeamGroup/FlightSlot/AllocationResult`) để sau này cắm CP-SAT mà không đụng caller;
      `GreedyFlightStrategy` trong `greedy.py` hiện thực đúng thuật toán mục 7.1: xếp nguyên Team trước,
      không vừa thì tách theo subgroup ca lớn nhất, còn dư thì flag `no_slot`/`shift_mismatch`
- [x] `POST /api/events/{id}/allocations/flight` → `202 {job_id, allocation_run_id}`; worker chạy
      `run_flight_allocation_task`; `GET /api/jobs/{id}` theo dõi; `GET /api/events/{id}/allocations`
      xem lịch sử các lần chạy
- [x] Màn hình kết quả: theo chuyến (đã xếp/capacity), tổng số Team bị tách, danh sách **flag** — tất cả
      trong `FlightAllocationPanel` (FE), không tách trang riêng
- [x] Manual adjustment: `POST /api/events/{id}/flight-assignments/adjust` — đổi 1 hoặc nhiều người
      cùng lúc, ghim `is_locked=true` (lần chạy auto sau sẽ trừ slot của họ ra rồi mới xếp phần còn lại,
      không bao giờ tự động di chuyển lại), vượt sức chứa → 409 kèm chi tiết trừ khi `force=true` (vẫn
      bắt buộc `reason`)
- [x] Audit log before/after cho mọi thao tác ghi (mục 5.6) — đã có từ pattern chung `record_audit()`
- **Bug phát hiện khi test với 21 đăng ký / 8 team / 2 chuyến (capacity 6+6):**
  - `flight_id` ban đầu NOT NULL nên người bị flag `no_slot` (không xếp được) **không có row nào cả** →
    biến mất khỏi danh sách admin thay vì hiện "cần xử lý" như BRD mục 5.3 yêu cầu. Sửa: cho phép
    `flight_id = NULL`, tạo row cho cả người chưa xếp được (để BTC nhìn thấy và xử lý thủ công)
  - Import chuyến bay dùng `await db.rollback()` trực tiếp thay vì SAVEPOINT (`db.begin_nested()`) khi
    1 dòng lỗi → làm sập session giữa vòng lặp trên SQLite NullPool, văng `MissingGreenlet` ở dòng tiếp
    theo. Cùng lớp bug đã sửa ở employee import (Phase 1) nhưng bị bỏ sót ở đây — đã đồng bộ lại
  - Xác nhận: sau khi 1 người được **ghim thủ công** (`is_locked`), chạy lại allocation **không** đụng
    tới họ, và slot của họ bị trừ khỏi capacity trước khi phần còn lại được xếp tự động — đúng thiết kế
- **Đã kiểm chứng qua curl:** tạo 2 chuyến (capacity 6 mỗi chuyến, 2 ca khác nhau) → 21 CBNV submit với
      ca xen kẽ → chạy phân bổ: 12 xếp được / 9 flag, 4 team bị tách → ghim thủ công 1 người vượt capacity
      (chặn 409, `force=true` mới cho qua) → chạy lại vẫn giữ nguyên người đã ghim; import Excel chuyến
      bay với 1 dòng cố tình sai `direction` → báo lỗi đúng dòng, 2 dòng đúng vẫn được tạo. `ruff check`
      sạch, FE `next build`/`next lint` sạch, route `/admin/events/[id]` trả 200
- **Xong khi:** chạy phân bổ cho 120 CBNV + ~6 chuyến, xem được báo cáo, chỉnh tay được và có cảnh báo đúng

### Phase 4 — Module 2b: Khách sạn & phòng ✅ (2026-09-12)
- [x] Models: `hotels`, `room_types`, `rooms`, `room_assignments` (`room_assignments` UNIQUE
      `(event_id, employee_id)` chứ không phải unique toàn cục trên `employee_id` — đúng tinh thần
      multi-event, sửa lại so với bản nháp đầu vì suýt chặn 1 người có phòng ở 2 event khác nhau)
- [x] CRUD khách sạn/loại phòng/phòng + import danh sách phòng và import kết quả phân phòng từ Excel —
      cả hai đều chạy đồng bộ (cùng lý do như import chuyến bay ở Phase 3)
- [x] Màn gán thủ công (`POST /room-assignments/assign`): danh sách CBNV chưa có phòng
      (`GET .../unassigned`, join Registration submitted+participating thiếu row room_assignment) ↔ chọn
      phòng; validate sức chứa **chặn cứng**, không có `force` như bên flight — đúng yêu cầu "không cho
      vượt sức chứa" của phase này, không phải trường hợp cần BTC ghi đè
- [x] Export danh sách phân phòng (`GET /room-assignments/export`, đồng bộ, .xlsx)
- **Bug bắt được trước khi commit:** dựng `RoomAssignment` bằng `add()+flush()+commit()+db.refresh()`
      rồi đọc `assignment.employee.team` ngay sau đó — `refresh()` trên AsyncSession không đảm bảo load
      lại quan hệ (`lazy="joined"` chỉ áp dụng khi SQLAlchemy tự phát SELECT, không phải khi refresh()
      column-only), rủi ro `MissingGreenlet`. Sửa bằng cách query lại tường minh với `selectinload` trước
      khi serialize, thay vì tin vào `refresh()`
- **Đã kiểm chứng qua curl:** tạo khách sạn + phòng capacity 2 → gán 2 người OK → người thứ 3 bị chặn
      409 `room_full` → import file phòng mẫu + import file phân phòng mẫu (1 dòng cố tình sai mã NV, báo
      lỗi đúng dòng) → export ra đúng danh sách. `ruff check`, `next lint`, `next build` sạch;
      `/admin/events/[id]` trả 200
- **Xong khi:** import được file phân phòng mẫu, gán tay được, không cho vượt sức chứa

### Phase 5 — Module 3: Xe & điều phối ✅ (2026-09-12)
- [x] Models: `buses`, `bus_assignments` — thêm `is_locked`/`is_flagged`/`flag_reason` dù bảng gốc ở
      mục 5.5 không liệt kê, rút kinh nghiệm trực tiếp từ Phase 3 (không muốn lặp lại đúng cái gap
      "người không xếp được biến mất khỏi tầm nhìn admin")
- [x] CRUD xe theo từng chặng (mã, sức chứa, giờ tập trung/khởi hành, điểm đón/đến); chỉ định Trưởng xe
      (họ tên + SĐT — mục 7.4)
- [x] `services/allocation/bus_greedy.py`: gom theo `(flight_id, team_id)`, nhóm lớn nhất trước, ưu
      tiên xe đã có người cùng chuyến bay, best-fit theo phần còn lại của nhóm — đúng thứ tự ưu tiên
      mục 7.3 (cùng chuyến bay → cùng Team → lấp đầy → không vượt sức chứa). Chỉ đối chiếu chuyến bay khi
      `transport_leg.direction` là `outbound`/`inbound` (khớp quy ước của `flight_assignments`); chặng
      nào đặt direction khác thì thuật toán tự rơi về chỉ xét Team + sức chứa
- [x] Manual adjust (`POST /bus-assignments/adjust`) + cảnh báo vượt sức chứa (409 trừ khi `force=true`,
      luôn bắt `reason`) + audit log; export danh sách xe theo chặng kèm Trưởng xe/SĐT (mục 7.5)
- **Đã kiểm chứng qua curl:** 2 xe (capacity 12) cho 1 chặng, 21 người có nhu cầu xe → phân xe tự động
      giữ nguyên từng Team trong cùng 1 xe, chỉ tách khi xe đầy 12 chỗ, 0 người bị flag; chuyển tay 1
      người + export ra đúng file kèm Trưởng xe. `ruff check`, `next lint`, `next build` sạch
- **Xong khi:** phân xe tự động cho cả 4 chặng dựa trên kết quả Phase 3, in được danh sách từng xe

### Phase 6 — Module 5: My Team Building Journey + Thông báo ✅ (2026-09-12)
- [x] Models: `schedule_items`, `announcements`
- [x] `GET /api/journey/me` — aggregate 1 lần gọi: cá nhân & Team, chuyến bay đi/về, xe từng chặng (kèm
      Trưởng xe), khách sạn/phòng, lịch trình đã publish, thông báo ghim/mới nhất. **Chỗ Gala để trống**
      (`null`/không có field) vì Module 4 (Phase 7) chưa xây — sẽ bổ sung khi có
- [x] Không cần `event_id` tường minh cho CBNV — tự tìm event mà nhân viên có đăng ký `submitted`+
      `is_participating` và `event.status` đã thuộc `information_published/event_started/event_completed`;
      admin xem preview qua `?event_id=&employee_id=` bỏ qua điều kiện trạng thái
- [x] Admin: soạn lịch trình (toggle publish), soạn thông báo. **Không có nút "Công bố thông tin" riêng**
      — tái dùng nút chuyển trạng thái event có sẵn từ Phase 1 (`POST /transition` sang
      `information_published`), gắn thêm side-effect enqueue `send_bulk_emails_task` ngay tại đó thay vì
      tạo luồng publish riêng
- [x] Trigger email khi đổi chuyến bay/xe (mục 11): gắn thẳng vào endpoint `adjust` đã có ở Phase 3/5,
      chỉ khi `event.status` đã publish; **không** làm trigger riêng cho đổi lịch trình (schedule_items) vì
      phase đã đủ lớn, để dành nếu cần sau. `send_bulk_emails_task` (publish) dedupe theo
      `template_code:event_id:employee_id` (chỉ gửi 1 lần/employee cho lần publish đó); các trigger
      "đổi sau publish" dedupe kèm timestamp nên luôn gửi mới mỗi lần đổi — hai kiểu dedupe khác nhau vì
      mục đích khác nhau (chặn gửi trùng do retry vs. luôn báo thay đổi mới)
- [x] FE: `/journey` dạng timeline (Card theo từng khối: thông báo, chuyến bay, xe, phòng, lịch trình),
      mobile-first; trang chủ giờ thử gọi `/api/journey/me` trước để quyết định điều hướng
      `/journey` hay `/register` cho CBNV
- **Đã kiểm chứng:** chạy hết chuỗi transition đến `information_published` → 21 email được enqueue và
      worker xử lý xong (thấy trong log + MailHog); `GET /journey/me` trả đúng đủ chuyến bay/xe (kèm
      Trưởng xe)/phòng/lịch trình/thông báo cho 1 nhân viên đã seed; nhân viên chưa có đăng ký được publish
      nhận đúng 404 `no_published_event`. `ruff check`, `next lint`, `next build` sạch
- **Xong khi:** publish event → toàn bộ CBNV nhận email, mở trang thấy đủ hành trình trên điện thoại

### Phase 7 — Module 4: Gala Dinner ✅ (2026-09-12)
- [x] Models: `gala_configs`, `gala_tables`, `gala_seats`, `gala_turns`
- [x] Admin: **không làm kéo thả canvas** — nhập toạ độ x/y bằng số cho từng bàn, sân khấu là 1 label cấu
      hình sẵn (`stage_label`). Vẫn ra đúng sơ đồ trực quan (bàn đặt đúng vị trí, ghế hiển thị theo bàn),
      chỉ khác cách nhập liệu — kéo-thả là nice-to-have của BRD, không đáng chi phí FE cho MVP. Số ghế/bàn
      cấu hình lúc tạo bàn (tự sinh đủ số ghế); "khoá ghế không khả dụng" chưa có UI riêng (ghế `blocked`
      set thẳng qua DB nếu cần, chưa có nút trên admin panel)
- [x] Bốc thăm: random seed lưu vào `gala_configs.draw_seed` (tái lập được thứ tự), thời gian mỗi lượt và
      thời gian giữ ghế cấu hình qua `gala_configs` (mục 8.3)
- [x] Quota ghế: `by_team_size` (đếm CBNV `submitted`+`is_participating` theo team) hoặc `fixed` — cấu hình
      theo `gala_configs.seat_quota_rule` (mục 8.4)
- [x] **Seat locking** (mục 8.5): `SET seat:{id} {team_id} NX EX {ttl}` là chốt chặn thật sự (chỉ 1 request
      thắng); confirm dùng thêm optimistic `version` để chặn ghế đổi trạng thái giữa lúc hold và confirm;
      release dùng Lua compare-and-delete (chỉ xoá lock nếu đúng team đang giữ, tránh release trễ xoá nhầm
      lock của người khác). Cron `expire_gala_holds_task` (ARQ, mỗi 5s) dọn hold quá hạn **và** tự động
      chuyển lượt nếu turn hết giờ mà Team chưa chọn đủ — không cần chờ admin can thiệp
- [x] `WS /events/{id}/gala/ws`: broadcast qua Redis pub/sub (channel `gala:{event_id}`), API subscribe lúc
      lifespan startup rồi forward cho các WebSocket đang mở — hoạt động đúng dù request tạo ra thay đổi
      xử lý ở worker (cron) hay ở API (hold/confirm/release). **WS endpoint không có auth** — nội dung
      broadcast (trạng thái ghế, team_id) không nhạy cảm nên chấp nhận bỏ qua xác thực cho WebSocket ở MVP
      này thay vì giải quyết cookie/header auth cho raw WS handshake
- [x] FE: `/gala/{eventId}` — bàn đặt theo x/y, ghế dạng lưới nút bấm theo bàn, 4 màu trạng thái (trống/
      đang chọn/đã xác nhận/không khả dụng), banner lượt hiện tại + đồng hồ đếm ngược, cập nhật realtime
      qua WebSocket patch thẳng vào TanStack Query cache (không polling)
- **Bug/pattern đáng nhớ khi lint:** 2 rule eslint mới (React Compiler-era) bắt được lỗi thật: ghi vào
      `ref.current` ngay trong thân hook (lúc render) bị cấm — sửa bằng `useEffect(() => { ref.current = x })`
      không dependency array; và gọi `setState` trực tiếp ở top-level effect bị cấm dù nhánh khác gọi qua
      1 hàm cục bộ (`tick()`) thì không bị bắt — nên quy tắc thực dụng là **luôn** gọi setState trong effect
      thông qua 1 hàm đặt tên, không gọi thẳng
- **Đã kiểm chứng:** 15 request hold đồng thời cùng 1 ghế (cùng team) → đúng 1 thành công (200), 14 nhận
      409; confirm đủ quota → turn tự chuyển ngay không cần chờ cron; để turn hết giờ (test chậm hơn
      turn_duration demo) → cron tự expire và chuyển turn đúng như thiết kế; WebSocket client thô nhận được
      broadcast `seat_update` trong vòng 1 giây sau khi request khác release ghế. `ruff check`, `next lint`,
      `next build` sạch
- **Xong khi:** 2 trình duyệt cùng chọn 1 ghế → chỉ 1 thành công, bên kia thấy ghế đổi trạng thái tức thì

### Phase 8 — Chat RAG (Qdrant) ✅ (2026-09-12)
- [x] `services/rag/providers/`: `LLMProvider`/`EmbeddingProvider` là Protocol (interface thật). **Chỉ hiện
      thực 1 provider cụ thể mỗi loại** (Anthropic cho LLM, local/fastembed cho embedding) thay vì cả
      Anthropic+OpenAI+local như bản nháp — hiện thực OpenAI khi chưa ai dùng chỉ là code chết đằng sau 1
      interface đã đủ dùng; thêm sau chỉ tốn 1 file + 1 nhánh trong factory
- [x] **Đổi model embedding:** kế hoạch gốc ghi "intfloat/multilingual-e5-small" nhưng fastembed không hỗ
      trợ biến thể `-small` (chỉ có `-large`, nặng hơn) → đổi sang
      `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384 chiều, ONNX qua fastembed, không
      cần torch, không cần tiền tố "query:"/"passage:" như họ E5)
- [x] Ingest (`services/rag/ingest.py`): 1 `rag_document` cho mỗi schedule_item đã publish, announcement đã
      publish, terms_text, mỗi khách sạn (đều `scope=public`) + 1 tài liệu "hành trình cá nhân" cho mỗi CBNV
      `submitted`+`is_participating` (`scope=employee`, `scope_ref_id=employee_id`) — tái dùng thẳng
      `journey_service.build_journey()` thay vì suy diễn lại dữ liệu chuyến bay/xe/phòng. Tài liệu cá nhân
      **chỉ tạo khi event đã ở trạng thái publish**, giống đúng quy tắc hiển thị của trang Journey
- [x] `reindex_rag_task` (ARQ, admin bấm `POST /events/{id}/rag/reindex`): diff theo checksum nội dung —
      tài liệu không đổi thì không re-embed lại (đã kiểm chứng: đổi giờ 1 xe → chỉ 12/24 tài liệu bị
      re-embed, đúng bằng số CBNV thực sự đi xe đó)
- [x] Retrieval lọc quyền (`services/rag/qdrant_store.py`): filter Qdrant dạng `Filter(should=[...])` lồng
      trong `must` — 1 Filter chỉ có `should` bắt buộc ít nhất 1 điều kiện khớp, nhờ vậy `scope=public OR
      (scope=employee AND scope_ref_id=me)` trở thành điều kiện bắt buộc chứ không chỉ để tính điểm
- [x] `POST /api/chat/sessions/{id}/messages` streaming SSE + citations. Việc gọi LLM chỉ thực sự chạy khi
      generator SSE bắt đầu iterate (không phải lúc gọi hàm) nên lỗi (thiếu API key, rate limit...) xảy ra
      **sau khi** header response đã gửi — generator bắt exception và trả 1 SSE event `{"error": ...}` thay
      vì để connection chết giữa chừng; ghi tin nhắn assistant dùng 1 `AsyncSessionLocal` mới mở ngay trong
      generator, không dùng `db` request-scoped (FastAPI có thể đã đóng dependency `yield` trước khi
      generator của StreamingResponse chạy xong)
- [x] FE: `/chat` — SSE tự parse bằng `fetch()` + `ReadableStream` (EventSource không gửi được POST body),
      hiển thị citation dạng badge, gợi ý câu hỏi mẫu khi chưa có tin nhắn nào
- **Bug bắt được khi rebuild:** `docker compose build api` **không** rebuild image `worker` dù cả hai cùng
      dùng chung Dockerfile/context ở `apps/api` — compose coi mỗi service là build target riêng trừ khi
      cùng khai báo `image:`. Từ giờ mọi thay đổi ở `apps/api` phải `docker compose build api worker` (hoặc
      build không tham số), không chỉ `build api`
- **Giới hạn đã biết:** cache model fastembed nằm trong filesystem tạm của container (không phải volume)
      nên container mới sẽ tải lại model lần đầu dùng (~150 giây) — chấp nhận được cho MVP, có thể mount
      volume riêng sau nếu cần
- **LLM provider thực tế dùng:** không phải Anthropic mà là **Alibaba Cloud DashScope (Qwen3-Max-Preview)**
      qua endpoint tương thích OpenAI — người dùng cung cấp API key riêng, đã cấu hình
      `LLM_PROVIDER=dashscope` trong `.env` local (xem thêm ghi chú provider trong commit riêng). Kiến trúc
      Protocol từ đầu Phase 8 chứng minh đúng giá trị: thêm provider mới chỉ cần 1 file implementation +
      1 nhánh trong factory, không đụng gì khác
- **Đã kiểm chứng — kể cả câu trả lời LLM thật:** reindex ra 24 tài liệu; retrieval với `employee_id=2`
      chỉ trả tài liệu hành trình của chính họ (không bao giờ thấy tài liệu của employee 3), và ngược lại;
      hỏi thật qua chat với 2 nhân viên khác nhau ("mấy giờ tôi tập trung ở sân bay và xe đó tên gì?" /
      "tôi tên gì và tôi ở phòng nào?") — mỗi người nhận đúng câu trả lời của riêng mình (giờ tập trung, mã
      xe, tên+SĐT trưởng xe, tên khách sạn/phòng), không ai thấy thông tin người kia, kèm citation đúng
      nguồn. `ruff check`, `next lint`, `next build` sạch
- **Xong khi:** hỏi "mấy giờ tôi tập trung ở sân bay?" trả đúng theo dữ liệu cá nhân, và không lộ dữ liệu
      người khác — **đã kiểm chứng đầy đủ với LLM thật (DashScope Qwen3-Max-Preview)**

### Phase 9 — Hoàn thiện ✅ (2026-09-12)
- [x] Admin Dashboard (mục 10): `GET /events/{id}/dashboard` + trang `/admin` — tổng CBNV, đã/chưa đăng ký,
      theo ca, nhu cầu xe từng chặng, tình trạng slot bay, tình trạng phân xe/phòng. Không thêm bảng mới,
      toàn bộ suy ra từ dữ liệu đã có
- [x] Màn hình xem Audit log + Jobs (`AuditJobsPanel` trong trang chi tiết event). **Bỏ qua "chuẩn hoá
      export Excel toàn hệ thống"** — các export hiện có (đăng ký, phân phòng, phân xe) đã đủ dùng và nhất
      quán về định dạng, chuẩn hoá thêm ở thời điểm này chưa có giá trị rõ ràng
- [x] Tests: pytest cho `GreedyFlightStrategy`/`allocate_buses` (xếp nguyên khối, tách khi không vừa, không
      vượt sức chứa, flag no_slot, ưu tiên đúng ca/chuyến bay) và `transition_event` (organizer forward-only,
      super_admin override, publish chỉ set `published_at` một lần) — 17/17 pass. **Bỏ qua Playwright** —
      không có công cụ browser automation trong phiên làm việc để thực sự chạy/xác nhận, viết test không
      chạy được thì thà không viết còn hơn
- [x] Trang lỗi: `not-found.tsx` + `error.tsx` chuẩn Next.js App Router. Responsive mobile đã theo dọc suốt
      từ Phase 2 (pattern `max-w-2xl` + `p-4 sm:p-6` + `flex-wrap` nhất quán mọi trang CBNV-facing), không
      rà lại riêng thành mục tách biệt
- [x] `README.md`: hướng dẫn chạy, tài khoản seed mẫu, biến môi trường quan trọng, lưu ý build lại cả
      `api`+`worker`, backup SQLite

**Ngoài kế hoạch — theo yêu cầu người dùng giữa phiên:** thêm `DashScopeLLMProvider` (Alibaba Cloud Qwen,
qua endpoint tương thích OpenAI) làm lựa chọn `LLM_PROVIDER` thứ hai bên cạnh Anthropic, tắt `enable_thinking`
theo yêu cầu. Đây chính là phép thử thực tế đầu tiên cho kiến trúc Protocol của Phase 8 — thêm 1 file
provider + 1 nhánh factory, không sửa gì khác — và nhờ đó **Phase 8 được xác nhận đầy đủ với LLM thật**
(xem ghi chú trong mục Phase 8).

- **Đã kiểm chứng:** dashboard trả đúng số liệu khớp với dữ liệu đã seed/phân bổ (120 CBNV, 21 đăng ký, 2
      ca, 2 chuyến bay đầy 6/6, 4 phòng, 21 người lên xe); audit-logs và jobs list trả đúng lịch sử các
      thao tác đã làm suốt phiên; `ruff check`, `next lint`, `next build` sạch; `/admin`, `/admin/events/1`,
      1 URL không tồn tại (404) đều trả đúng status trong container dev

### Phase 10 — Portal CBNV (productization FE) ✅ (2026-09-12)
- [x] Shell CBNV (`(employee)/layout` + `EmployeeShell`): header sticky, nav Đăng ký / Hành trình / Gala /
      Hỏi đáp / Team (chỉ `team_leader`), bottom nav mobile, Đổi mật khẩu + Đăng xuất. Visual itinerary
      (Be Vietnam Pro + Fraunces, palette forest) scoped trong `.employee-shell` — admin giữ zinc cũ
- [x] Gate `must_change_password` → ép `/account`. `POST /api/auth/change-password` đã có từ Phase 1,
      lần đầu có UI. Login redirect thẳng `/account` nếu flag bật
- [x] `GET /auth/me` trả thêm `employee_code`, `phone`, `team_name`, `site_name`. `GET/PATCH /employees/me`
      (chỉ SĐT) — CBNV không sửa họ tên/email/team (master data)
- [x] Form đăng ký hiện card hồ sơ auto-fill (BRD 4.2) + sửa SĐT; empty/cancelled states rõ hơn
- [x] Journey timeline 6 khối: cá nhân+Team, thông báo, bay, xe (điểm tập trung/giờ/trưởng xe), KS/phòng
      (địa chỉ + checkin/checkout), Gala bàn/ghế, lịch trình. `JourneyOut` bổ sung `gala`, pickup, hotel
      address, event dates/status
- [x] Team Leader `/team`: `GET /events/{id}/team/roster` — leader chỉ thấy Team mình, employee 403,
      admin bắt buộc `?team_id=`. FE bảng thành viên + CTA chọn ghế Gala
- [x] Gala: CBNV thường xem-only; chỉ `team_leader`/BTC hold/confirm (BE vốn đã chặn, FE ẩn thao tác)
- [x] Login có branding tiếng Việt, không forgot-password (để Phase 13)
- **Không làm trong phase này:** tách admin workspace (Phase 11), kéo-thả sơ đồ Gala (Phase 12)
- **Đã kiểm chứng:** `ruff check` sạch; pytest 22 pass (thêm 5 test `resolve_roster_team_id`); `next lint`
      + `tsc --noEmit` sạch. Curl: `/auth/me` đủ hồ sơ; PATCH phone; journey trả gala/hotel/bus; roster
      403 với employee, 403 khi leader xem team khác, 200 với team của mình. Các route FE `/login`
      `/register` `/journey` `/account` `/team` `/chat` `/gala/1` trả 200. **Chưa** click-through trình
      duyệt (không có browser automation trong phiên)

### Phase 11 — Admin workspace ✅ (2026-09-12)
- [x] Tách `/admin/events/[id]` thành sub-route: tổng quan, cấu hình, đăng ký, chuyến bay, xe, khách sạn,
      Gala, lịch & TB, audit. Tab ngang (scroll trên mobile). Sidebar admin có hamburger + highlight
      `pathname.startsWith`
- [x] Event settings: PATCH ngày/điểm đến/cửa sổ ĐK; `GET/PUT /events/{id}/settings` cho terms + trọng số
      phân bổ. Allocation runner đọc trọng số từ `event_settings` khi request không gửi weights
- [x] CBNV admin: thêm/sửa, filter team/site, pagination 50, export Excel, file mẫu import. POST CBNV
      tự tạo User (`must_change_password`, MK = employee_code)
- [x] Đăng ký admin: cột ca + nhu cầu xe; filter status/team/ca
- [x] Form chuyến bay đúng field (direction/ca/datetime, không gõ shift_id). Adjust **không** `force: true`
      mặc định — 409 `over_capacity` rồi dialog ghi đè + bắt `reason`. Cùng pattern cho xe
- [x] Super Admin `/admin/users`: list, đổi role, khoá/mở, reset MK về employee_code. BTC 403
- **Đã kiểm chứng:** ruff sạch; pytest 25 pass; `tsc` + `next lint` sạch. Curl: settings GET/PUT, PATCH
      event, employees `{total, items}`, users 403/200 theo role, registrations có `shift_name`/
      `transport_summary`, import-template 200 xlsx, adjust không force → 409. Các route FE admin
      sub-page trả 200. **Chưa** click-through trình duyệt

### Phase 12 — Gala sơ đồ rạp ✅ (2026-09-12)
- [x] Sơ đồ dùng chung `GalaSeatMap`: sân khấu trên, bàn tròn/chữ nhật, ghế xếp quanh bàn (không grid 4 cột),
      4 màu + legend + viền lantern cho ghế Team mình
- [x] Admin kéo bàn trên preview → `PATCH /tables/{id}` ghi x/y; bàn mới tự xếp lưới nếu không nhập toạ độ
- [x] Khoá/mở ghế: `POST /seats/{id}/block` `{blocked}`. Chỉ khoá ghế trống
- [x] Bốc thăm chỉ tạo thứ tự (`status=drawing`), không tự chạy lượt. `POST /turns/start` bắt đầu lượt
      chờ; `POST /turns/skip` bỏ qua lượt đang chạy (nhả ghế đang hold) rồi sang Team tiếp
- [x] CBNV thường xem-only; team_leader hold/confirm như cũ. Journey đã hiện bàn/ghế từ Phase 10
- **Đã kiểm chứng:** ruff sạch; pytest 26 pass; `tsc` + `next lint` sạch. Curl: block/unblock ghế,
      skip lượt 200, start 409 khi đang có lượt active (đúng). `/gala/1` và `/admin/events/1/gala` 200.
      **Chưa** click-through trình duyệt

### Phase 13 — Ops còn lại ✅ (2026-09-12)
- [x] Template `schedule_changed` + `send_bulk_emails_task` khi tạo/sửa `schedule_items` (chỉ khi event đã
      công bố; dedupe theo item+giờ để không spam)
- [x] BTC sửa mẫu email: `GET/PUT /events/{id}/email-templates` + tab **Email** trên workspace sự kiện.
      5 mẫu: đăng ký, công bố hành trình, đổi bay, đổi xe, đổi lịch
- [x] **Không** làm forgot-password OTP — Super Admin reset MK (Phase 11) đủ MVP
- [x] Export: phân bổ chuyến bay (xlsx), audit log (CSV). File mẫu import: chuyến bay, phòng, phân phòng
      (CBNV đã có từ Phase 11)
- [x] `EmptyState` dùng chung cho hành trình chưa công bố / chưa mở ĐK / Gala chưa cấu hình
- **Đã kiểm chứng:** ruff sạch; pytest 29 pass; `tsc` + `next lint` sạch. Curl: 5 templates, PUT custom,
      import-template/export 200, audit CSV có BOM utf-8, `/admin/events/1/emails` 200. **Chưa**
      click-through trình duyệt

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

`mailhog/mailhog` (8025 UI) **không** nằm trong `docker-compose.yml` — Docker Compose merge `profiles` theo
kiểu hợp union chứ không ghi đè, nên không thể "tắt" nó bằng override khi lên production. Thay vào đó
`mailhog` được định nghĩa toàn bộ trong `docker-compose.override.yml` (chỉ áp dụng khi dev).

**`docker-compose.override.yml`** (tự động áp dụng khi dev): bind mount `./apps/api:/app` và `./apps/web:/app`,
`uvicorn --reload`, `next dev` (Turbopack), `arq --watch`, service `mailhog` riêng.

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
