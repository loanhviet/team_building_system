# Journey — override

BRD §9: toàn bộ hành trình trên **một màn**. Không phải 7 thẻ ngang hàng.

Thứ tự:

1. Identity compact (tên, team, mã NV) trong `PageHeader` — không thẻ “Cá nhân”.
2. **Việc tiếp theo** (next timed item hoặc lỗ phân bổ / Gala tới lượt).
3. Thông báo BTC: ghim + mới nhất; còn lại trong `<details>`. Không render khối rỗng.
4. Jump chips: Chiều đi · Lưu trú · Gala · Chiều về · Chương trình (chỉ chip có dữ liệu).
5. **Trục thời gian** gộp chuyến bay, xe, check-in, Gala, lịch — theo giờ, nhóm theo ngày.

Empty từng module → mục trong “Cần lưu ý”, deep-link `/chat` hoặc `/gala/:id`. Không thẻ “Chưa có thông tin xe”.
