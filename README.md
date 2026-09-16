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
docker compose up -d --build   # clone về là chạy: migrate + seed dữ liệu mẫu tự động, không cần .env
```

Lần đầu mất vài phút (build image + seed 120 CBNV, 2 event + FAQ pack). Tuỳ chọn:

- `cp .env.example .env` rồi chỉnh khi cần: `JWT_SECRET`, `DASHSCOPE_API_KEY` (hỏi đáp), SMTP thật.
- `SEED_DEMO=0` trong `.env` cho môi trường thật — tài khoản mẫu có mật khẩu công khai ở bảng dưới.
- `docker compose up` thường tự nạp `docker-compose.override.yml` (hot-reload dev). Chạy bản build
  production-style: `docker compose -f docker-compose.yml up -d --build`.

- Web: http://localhost:3000 — CBNV vào `/register`, `/journey`, `/gala/{id}`, `/chat`, `/team` (trưởng nhóm), `/account`
- API docs (Swagger): http://localhost:8000/docs
- MailHog (bắt mọi email gửi đi): http://localhost:8025
- Qdrant (hybrid vector cho FAQ; FTS5 vẫn chạy không cần): `docker compose --profile rag up -d qdrant`
- ChatRAG: BTC soạn FAQ tại `/admin/events/{id}/knowledge`. Corpus demo trong `apps/api/app/db/knowledge_pack.py` chỉ là seed, không phải nguồn lúc hỏi.

CBNV import từ Excel lần đầu có `must_change_password` — hệ thống ép vào `/account` trước khi dùng portal.

Tài khoản mẫu (seed tự chạy khi api khởi động; CBNV đổi mật khẩu lần đầu đăng nhập):

| Vai trò | Email | Mật khẩu |
|---|---|---|
| super_admin | admin@teambuilding.vn | admin123 |
| organizer (BTC) | btc@teambuilding.vn | btc123 |
| team_leader | nv001@teambuilding.vn | NV001 |
| employee | nv009@teambuilding.vn | NV009 |

**Kiểm tra môi trường đã lên đúng chưa:** đăng nhập `btc@teambuilding.vn` / `btc123` ở `/login`, vào được
trang quản lý sự kiện là ổn — báo lỗi từ bước này thường là do môi trường, không phải bug thật.

**Học/debug các thuật toán phân bổ (chuyến bay, xe, Gala):** dữ liệu seed mặc định 97 người tham gia,
không tính tay lại được khi nghi ngờ một kết quả. Dùng sự kiện demo nhỏ **TBLAB** — 16 người, mỗi nhánh
thuật toán chỉ kích hoạt đúng một lần, kết quả tính tay được:

```bash
docker compose exec api python -m app.db.seed_lab          # tạo (hoặc --reset để làm lại từ đầu)
```

## Lệnh thường dùng

```bash
make logs s=worker          # theo dõi log 1 service (api|worker|web|redis|qdrant)
make migrate                # alembic upgrade head
make migration m="mô tả"    # tạo migration mới sau khi sửa model
make test                    # pytest (api) + npm test (web, nếu có)
make lint                    # ruff check (api) + next lint (web)
make sh-api / make sh-web    # mở shell trong container
```

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

## Trạng thái triển khai

Toàn bộ 9 phase đã hoàn thành: Auth/RBAC, Đăng ký + Email, Chuyến bay + Auto Allocation, Khách sạn/Phòng,
Xe + Auto Allocation, My Journey + Thông báo, Gala Dinner realtime, Chat RAG, Dashboard/Audit/Tests.
