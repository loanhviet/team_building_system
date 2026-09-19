# Hệ thống Quản lý Team Building

One-stop portal cho một kỳ Team Building: CBNV đăng ký và xem toàn bộ hành trình (chuyến bay, xe, khách
sạn, Gala Dinner, lịch trình) trên một hệ thống; BTC quản lý dữ liệu, chạy phân bổ tự động và điều chỉnh
ngoại lệ.

## Stack

FastAPI (async, Python 3.12) + SQLAlchemy 2/aiosqlite + Alembic · Next.js 16 (App Router, TypeScript,
Tailwind, TanStack Query) · SQLite (WAL) · Redis + ARQ (queue nền + khoá ghế Gala) · Qdrant (RAG chat).

## Chạy dự án

Yêu cầu: Docker + Docker Compose.

```bash
docker compose up -d --build   # clone về là chạy: migrate + seed tài khoản tự động, không cần .env
```

Lần đầu mất vài phút để build image. Seed mặc định chỉ tạo tài khoản đăng nhập cho từng vai trò — không
dựng sẵn sự kiện, chuyến bay, xe, khách sạn hay Gala; tự tạo sự kiện và cấu hình qua giao diện admin.

Tuỳ chọn:

- `cp .env.example .env` rồi chỉnh khi cần: `JWT_SECRET`, `DASHSCOPE_API_KEY` (hỏi đáp), SMTP thật.
- `SEED_DEMO=0` trong `.env` cho môi trường thật — tài khoản mẫu có mật khẩu công khai ở bảng dưới.
- Muốn xem một sự kiện đã vận hành đầy đủ (chuyến bay/xe/khách sạn/Gala đã chạy phân bổ thật, ~100
  người tham gia) thay vì tự dựng: `make seed-full`. Nếu `docker compose up` đã tự seed minimal trước
  đó rồi (tài khoản mẫu đã tồn tại), thêm `--reset`: `docker compose exec api python -m app.db.seed --full --reset`
  — **xoá sạch dữ liệu hiện có** trước khi seed lại, chỉ dùng khi chưa có gì cần giữ.
- `docker compose up` mặc định nạp `docker-compose.override.yml` (chế độ dev, hot-reload). Chạy bản build
  production-style: `docker compose -f docker-compose.yml up -d --build`.

Truy cập:

- Web: http://localhost:3000 — CBNV vào `/register`, `/journey`, `/gala/{id}`, `/chat`, `/team` (trưởng nhóm), `/account`
- API docs (Swagger): http://localhost:8000/docs
- MailHog (bắt mọi email gửi đi): http://localhost:8025
- Qdrant (hybrid vector cho FAQ; FTS5 vẫn chạy không cần): `docker compose --profile rag up -d qdrant`

CBNV import từ Excel lần đầu có `must_change_password` — hệ thống ép vào `/account` trước khi dùng portal.

### Tài khoản

Seed tự chạy khi API khởi động; CBNV đổi mật khẩu lần đầu đăng nhập.

| Vai trò | Email | Mật khẩu |
|---|---|---|
| super_admin | admin@teambuilding.vn | admin123 |
| organizer (BTC) | btc@teambuilding.vn | btc123 |
| team_leader | nv001@teambuilding.vn, nv002@teambuilding.vn | NV001, NV002 |
| employee | nv003@teambuilding.vn, nv004@teambuilding.vn | NV003, NV004 |

Cần thêm CBNV để test: import qua `/admin/employees` (có sẵn file mẫu Excel trong màn hình).

**Kiểm tra môi trường đã lên đúng chưa:** đăng nhập `btc@teambuilding.vn` / `btc123` ở `/login`, vào được
trang quản lý sự kiện là ổn — báo lỗi từ bước này thường là do môi trường, không phải bug thật.

## Lệnh thường dùng

```bash
make logs s=worker          # theo dõi log 1 service (api|worker|web|redis|qdrant)
make migrate                # alembic upgrade head
make migration m="mô tả"    # tạo migration mới sau khi sửa model
make test                    # pytest (api) + npm test (web, nếu có)
make lint                    # ruff check (api) + next lint (web)
make sh-api / make sh-web    # mở shell trong container
```

Trên Windows PowerShell không cần cài `make`; dùng trực tiếp Docker Compose:

```powershell
docker compose up -d --build
docker compose exec api alembic upgrade head
docker compose exec api python -m app.db.seed
docker compose exec api pytest
docker compose exec web npm test --if-present
docker compose exec api ruff check .
docker compose exec web npm run lint
docker compose logs -f worker
```

Sau khi nâng cấp một cơ sở dữ liệu cũ có FAQ đã công bố nhưng chưa có chỉ mục ChatRAG,
worker sẽ tự xếp tác vụ lập chỉ mục khi khởi động. BTC cũng có thể bấm **Lập chỉ mục lại**
trong mục **Hỏi đáp** của sự kiện. Nếu không chạy Qdrant, tìm kiếm FTS5 vẫn hoạt động.

Trong Gala Dinner, trưởng nhóm gán từng ghế đã xác nhận cho nhân viên đăng ký tham gia.
Ghế cá nhân xuất hiện trong My Journey; BTC xuất danh sách thẻ tên/điểm danh ở màn Gala.

**Sau khi sửa code trong `apps/api`, luôn rebuild cả hai image:**
`docker compose build api worker` — `api` và `worker` build từ cùng Dockerfile nhưng Compose coi là hai
image riêng, `build api` một mình sẽ không cập nhật `worker`.

## Biến môi trường quan trọng

Xem đầy đủ trong [`.env.example`](.env.example). Đáng chú ý:

- `DATABASE_URL` — mặc định SQLite trên bind mount `./data`, backup bằng cách copy file `.db` khi không có
  tiến trình nào đang ghi.
- `JWT_SECRET` — **phải đổi** trước khi dùng ngoài môi trường dev.
- `LLM_PROVIDER` — chỉ có `dashscope` (Alibaba Cloud/Qwen, endpoint tương thích OpenAI): cấu hình
  `DASHSCOPE_API_KEY`/`DASHSCOPE_BASE_URL`/`DASHSCOPE_MODEL`. `EMBEDDING_PROVIDER` hiện chỉ có `local`
  (fastembed, chạy CPU, tự tải model lần đầu dùng).

## Backup SQLite

File DB nằm ở `./data/teambuilding.db` (WAL mode, kèm `-wal`/`-shm`). Dừng service `api`/`worker` (hoặc
đợi lúc không có traffic ghi) trước khi `cp` để tránh sao chép giữa chừng một transaction.
