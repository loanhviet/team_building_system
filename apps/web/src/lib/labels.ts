/**
 * Vietnamese labels for the enum-ish strings that come straight from the API
 * (direction, source, flag_reason, job type/status, audit action/entity_type,
 * Gala status). Before this existed, these leaked into the UI verbatim —
 * `outbound`, `auto`, `shift_mismatch`, `manual_reassign` — English/internal
 * strings inside an otherwise-Vietnamese admin. Route every enum-ish value
 * through `label()` instead of rendering it directly.
 */

function makeLookup(map: Record<string, string>) {
  return (key: string | null | undefined): string => {
    if (!key) return "—";
    return map[key] ?? key;
  };
}

export const genderLabel = makeLookup({
  male: "Nam",
  female: "Nữ",
  other: "Khác",
});

export const directionLabel = makeLookup({
  outbound: "Chiều đi",
  inbound: "Chiều về",
});

export const assignmentSourceLabel = makeLookup({
  auto: "Tự động",
  manual: "Thủ công",
  import: "Import",
});

export const flagReasonLabel = makeLookup({
  no_slot: "Hết chỗ",
  shift_mismatch: "Không đúng ca",
  no_compatible_bus: "Không có xe khớp điểm đón/giờ bay",
});

export const jobStatusLabel = makeLookup({
  queued: "Đang chờ",
  running: "Đang chạy",
  succeeded: "Thành công",
  failed: "Thất bại",
});

export const emailOutboxStatusLabel = makeLookup({
  queued: "Đang chờ gửi",
  sending: "Đang gửi",
  sent: "Đã gửi",
  failed: "Gửi thất bại",
});

export const jobTypeLabel = makeLookup({
  flight_allocation: "Phân bổ chuyến bay",
  bus_allocation: "Phân bổ xe",
  import_employees: "Import CBNV",
  rag_reindex: "Đánh chỉ mục hỏi đáp",
});

export const auditActionLabel = makeLookup({
  create: "Tạo mới",
  update: "Cập nhật",
  deactivate: "Vô hiệu hoá",
  import: "Import",
  assign: "Gán",
  manual_reassign: "Điều chỉnh thủ công",
  transition: "Chuyển trạng thái",
  update_phone: "Sửa SĐT",
  draw: "Bốc thăm",
  turn_start: "Bắt đầu lượt",
  turn_skip: "Bỏ qua lượt",
  block: "Khoá ghế",
  unblock: "Mở khoá ghế",
  confirm: "Xác nhận ghế",
  submit: "Nộp đăng ký",
  remind: "Nhắc đăng ký",
  test_send: "Gửi email thử",
  cancel: "Huỷ đăng ký",
  reset_password: "Reset mật khẩu",
});

export const auditEntityTypeLabel = makeLookup({
  announcement: "Thông báo",
  bus: "Xe",
  bus_assignment: "Phân xe",
  email_template: "Mẫu email",
  employee: "CBNV",
  event: "Sự kiện",
  event_settings: "Cấu hình sự kiện",
  flight: "Chuyến bay",
  flight_assignment: "Phân chuyến bay",
  gala_seat: "Ghế Gala",
  gala_turn: "Lượt Gala",
  hotel: "Khách sạn",
  knowledge_document: "Tài liệu hỏi đáp",
  pickup_point: "Điểm đón",
  registration: "Đăng ký",
  room: "Phòng",
  room_assignment: "Phân phòng",
  room_type: "Loại phòng",
  schedule_item: "Lịch trình",
  shift: "Ca",
  site: "Địa điểm",
  team: "Team",
  transport_leg: "Chặng xe",
  user: "Tài khoản",
});

export const galaConfigStatusLabel = makeLookup({
  setup: "Đang thiết lập",
  drawing: "Đang bốc thăm",
  in_progress: "Đang chọn ghế",
  finished: "Đã kết thúc",
});

export const galaTurnStatusLabel = makeLookup({
  waiting: "Đang chờ",
  active: "Đang chọn",
  done: "Đã xong",
  skipped: "Đã bỏ qua",
  expired: "Hết giờ",
});

export const galaSeatStatusLabel = makeLookup({
  available: "Trống",
  held: "Đang giữ",
  confirmed: "Đã xác nhận",
  blocked: "Đã khoá",
});
