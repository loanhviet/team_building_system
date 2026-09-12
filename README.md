# Hệ thống Quản lý Team Building

One-stop portal cho một kỳ Team Building: CBNV đăng ký và xem toàn bộ hành trình (chuyến bay, xe, khách
sạn, Gala Dinner, lịch trình) trên một hệ thống; BTC quản lý dữ liệu, chạy phân bổ tự động và điều chỉnh
ngoại lệ. Xem đầy đủ yêu cầu gốc ở [`docs/BRD.md`](docs/BRD.md) và kiến trúc/lộ trình triển khai ở
[`docs/PLAN.md`](docs/PLAN.md) — đó là tài liệu tham chiếu chính, file này chỉ là hướng dẫn chạy nhanh.

## Stack

FastAPI (async, Python 3.12) + SQLAlchemy 2/aiosqlite + Alembic · Next.js 16 (App Router, TypeScript,
Tailwind, TanStack Query) · SQLite (WAL) · Redis + ARQ (queue nền + khoá ghế Gala) · Qdrant (RAG chat).

## Chạy dự án

Yêu cầu: Docker + Docker Compose.

```bash
cp .env.example .env        # chỉnh JWT_SECRET; DASHSCOPE_API_KEY nếu dùng hỏi đáp
make up                      # dựng toàn bộ stack, hot-reload cho dev
make seed                     # tạo dữ liệu mẫu: 1 super_admin, 1 organizer, 120 CBNV, 2 event + FAQ pack
```

- Web: http://localhost:3000 — CBNV vào `/register`, `/journey`, `/gala/{id}`, `/chat`, `/team` (trưởng nhóm), `/account`
- API docs (Swagger): http://localhost:8000/docs
- MailHog (bắt email dev): http://localhost:8025
- Qdrant (hybrid vector cho FAQ; FTS5 vẫn chạy không cần): `docker compose --profile rag up -d qdrant`
- ChatRAG: thiết kế + cách chạy [`docs/CHAT-RAG.md`](docs/CHAT-RAG.md). BTC soạn FAQ tại `/admin/events/{id}/knowledge`. Corpus demo trong `apps/api/app/db/knowledge_pack.py` chỉ là seed, không phải nguồn lúc hỏi.

CBNV import từ Excel lần đầu có `must_change_password` — hệ thống ép vào `/account` trước khi dùng portal.

Tài khoản đăng nhập sau khi `make seed` (in ra ở cuối log seed):

| Vai trò | Email | Mật khẩu |
|---|---|---|
| super_admin | admin@teambuilding.vn | admin123 |
| organizer (BTC) | btc@teambuilding.vn | btc123 |
| team_leader | nv001@teambuilding.vn | NV001 |
| employee | nv009@teambuilding.vn | NV009 |

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
- `LLM_PROVIDER` — `anthropic` (mặc định) hoặc `dashscope` (Alibaba Cloud/Qwen, dùng endpoint tương thích
  OpenAI). Cấu hình `ANTHROPIC_API_KEY` hoặc `DASHSCOPE_API_KEY`/`DASHSCOPE_BASE_URL`/`DASHSCOPE_MODEL`
  tương ứng. `EMBEDDING_PROVIDER` hiện chỉ có `local` (fastembed, chạy CPU, tự tải model lần đầu dùng).

## Backup SQLite

File DB nằm ở `./data/teambuilding.db` (WAL mode, kèm `-wal`/`-shm`). Dừng service `api`/`worker` (hoặc
đợi lúc không có traffic ghi) trước khi `cp` để tránh sao chép giữa chừng một transaction.

## Trạng thái triển khai

Toàn bộ 9 phase trong [`docs/PLAN.md`](docs/PLAN.md#9-lộ-trình-triển-khai-theo-phase) đã hoàn thành (Auth/
RBAC, Đăng ký + Email, Chuyến bay + Auto Allocation, Khách sạn/Phòng, Xe + Auto Allocation, My Journey +
Thông báo, Gala Dinner realtime, Chat RAG, Dashboard/Audit/Tests). Chi tiết từng phase, các lệch so với kế
hoạch gốc và giới hạn đã biết được ghi lại ngay trong `docs/PLAN.md` theo từng mục — đọc ở đó trước khi
tiếp tục phát triển.
