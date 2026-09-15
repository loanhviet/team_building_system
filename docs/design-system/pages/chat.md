# Chat — override

Đây là **trợ lý hành trình**, không khung chat generic.

- Thanh ngữ cảnh: team / chuyến / phòng / xe (từ `GET /api/journey/me`, im lặng nếu 404).
- Empty: phạm vi (SQL của bạn + FAQ đã đăng) + gợi ý theo `event.status` (nút, `aria-pressed` không cần — đây là action chips).
- Tool hint: `aria-live="polite"` khi `get_my_journey` / `search_event_knowledge`…
- Citation `text-xs`, deep-link `href` nếu có.
- Composer sticky: `bottom-[var(--bottom-nav-h)]` trên 375, `min-h-11`.
- “Hội thoại mới” = `POST /api/chat/sessions` (API đã có). Không đổi SSE/tools.
