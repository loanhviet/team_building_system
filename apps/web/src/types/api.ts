export type Role = "employee" | "team_leader" | "organizer" | "super_admin";

export type User = {
  id: number;
  email: string;
  role: Role;
  must_change_password: boolean;
  employee_id: number | null;
  full_name: string | null;
  employee_code: string | null;
  phone: string | null;
  team_name: string | null;
  site_name: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type Team = {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  is_active: boolean;
};

export type Site = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
};

export type Employee = {
  id: number;
  employee_code: string | null;
  full_name: string;
  email: string;
  team_id: number | null;
  site_id: number | null;
  phone: string | null;
  gender: string | null;
  position: string | null;
  is_active: boolean;
  team_name: string | null;
  site_name: string | null;
};

export type EmployeeList = {
  items: Employee[];
  total: number;
  limit: number;
  offset: number;
};

export type EmployeeStats = {
  total: number;
  active: number;
  inactive: number;
  accounts?: number;
  by_site: { site_id: number; site_name: string; count: number }[];
};

export type EventSettings = {
  terms_text: string;
  terms_version: string;
  flight_allocation_weights: {
    same_shift: number;
    team_together: number;
    fill_rate: number;
    split_penalty: number;
  } & Record<string, number>;
  bus_allocation_weights: {
    same_flight: number;
    team_together: number;
    fill_rate: number;
  } & Record<string, number>;
};

export type AllocationPreset = "balanced" | "shift_first" | "team_first";

export type AllocationPreflight = {
  ready: boolean;
  blockers: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
  eligible: number;
  capacity: number;
  resources: number;
};

export type EmailTemplate = {
  code: string;
  subject: string;
  body_html: string;
  description: string | null;
  is_custom: boolean;
};

export type EmailOutboxEntry = {
  id: number;
  to_email: string;
  template_code: string;
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type UserAdmin = {
  id: number;
  email: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  employee_id: number | null;
  full_name: string | null;
  employee_code: string | null;
  last_login_at: string | null;
};

export type EventStatus =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "allocation_processing"
  | "information_published"
  | "event_started"
  | "event_completed";

export type ReadinessIssue = {
  code: string;
  message: string;
};

export type PublishReadiness = {
  ready: boolean;
  requires_confirmation: boolean;
  blockers: ReadinessIssue[];
  warnings: ReadinessIssue[];
};

export type Event = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  destination: string | null;
  status: EventStatus;
  registration_open_at: string | null;
  registration_close_at: string | null;
  published_at: string | null;
};

export type EmployeeEvent = Event & {
  can_register: boolean;
  has_journey: boolean;
  registration_status: string | null;
};

export type Shift = {
  id: number;
  event_id: number;
  code: string;
  name: string;
  description: string | null;
  depart_after_time: string | null;
  sort_order: number;
  is_active: boolean;
};

export type TransportLeg = {
  id: number;
  event_id: number;
  code: string;
  name: string;
  direction: string;
  sort_order: number;
  is_active: boolean;
  flight_timing: "before_flight" | "after_flight" | null;
};

export type PickupPoint = {
  id: number;
  event_id: number;
  site_id: number | null;
  name: string;
  address: string | null;
  is_active: boolean;
};

export type TransportNeed = {
  leg_id: number;
  is_needed: boolean;
  pickup_point_id: number | null;
};

export type RegistrationStatus = "draft" | "submitted" | "cancelled";

export type Registration = {
  id: number;
  event_id: number;
  employee_id: number;
  status: RegistrationStatus;
  is_participating: boolean | null;
  shift_id: number | null;
  wish_note: string | null;
  terms_version: string | null;
  submitted_at: string | null;
  cancelled_at: string | null;
  transport_needs: TransportNeed[];
};

export type RegistrationAdmin = Registration & {
  employee_code: string | null;
  full_name: string;
  email: string;
  team_id: number | null;
  team_name: string | null;
  team_code: string | null;
  position: string | null;
  shift_name: string | null;
  transport_summary: string | null;
};

export type EventTerms = {
  terms_text: string;
  terms_version: string;
};

export type Journey = {
  event_id: number;
  event_name: string;
  event_status: EventStatus;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  full_name: string;
  employee_code: string | null;
  team_name: string | null;
  site_name: string | null;
  phone: string | null;
  is_participating: boolean | null;
  flights: {
    direction: "outbound" | "inbound";
    flight_code: string;
    airline: string | null;
    depart_at: string | null;
    arrive_at: string | null;
    origin: string | null;
    destination: string | null;
  }[];
  buses: {
    leg_name: string;
    bus_code: string;
    bus_name: string | null;
    gather_at: string | null;
    depart_at: string | null;
    destination: string | null;
    pickup_name: string | null;
    pickup_address: string | null;
    leader_name: string | null;
    leader_phone: string | null;
    note: string | null;
  }[];
  room: {
    hotel_name: string;
    hotel_address: string | null;
    room_number: string;
    checkin_date: string | null;
    checkout_date: string | null;
  } | null;
  gala: {
    status: "setup" | "drawing" | "in_progress" | "finished";
    name: string;
    tables: { table_code: string; table_name: string | null; seats: { seat_number: number; label: string | null }[] }[];
  } | null;
  schedule: {
    day_date: string | null;
    start_at: string | null;
    end_at: string | null;
    title: string;
    location: string | null;
  }[];
  announcements: {
    id: number;
    title: string;
    body_md: string;
    is_pinned: boolean;
    published_at: string | null;
  }[];
};

export type TeamRoster = {
  event_id: number;
  team_id: number;
  team_name: string;
  members: {
    employee_id: number;
    employee_code: string | null;
    full_name: string;
    email: string;
    phone: string | null;
    registration_status: RegistrationStatus | null;
    is_participating: boolean | null;
    shift_name: string | null;
  }[];
};

export type Hotel = {
  id: number;
  event_id: number;
  code: string;
  name: string;
  address: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  note: string | null;
};

export type Room = {
  id: number;
  hotel_id: number;
  room_number: string;
  room_type_id: number | null;
  capacity: number;
  note: string | null;
  occupied: number;
};

export type RoomType = {
  id: number;
  hotel_id: number;
  name: string;
  capacity: number;
  quantity: number;
};

export type RoomAssignment = {
  id: number;
  room_id: number;
  employee_id: number;
  source: "manual" | "import";
  employee_code: string | null;
  full_name: string;
  team_name: string | null;
  hotel_code: string;
  hotel_name: string;
  room_number: string;
  assigned_at: string | null;
};

export type UnassignedEmployee = {
  employee_id: number;
  employee_code: string | null;
  full_name: string;
  team_name: string | null;
  site_name: string | null;
};

export type ImportResult = {
  ok_rows: number;
  error_rows: number;
  errors: { row: number; error: string }[];
};

export type Dashboard = {
  total_employees: number;
  registered_count: number;
  not_registered_count: number;
  remindable_count: number;
  participating_count: number;
  not_participating_count: number;
  by_shift: { shift_name: string; count: number }[];
  transport_need_by_leg: { leg_name: string; count: number }[];
  flight_slots: { flight_code: string; direction: string; capacity: number; assigned: number }[];
  flights_flagged_count: number;
  rooms_assigned: number;
  rooms_total_capacity: number;
  buses_by_leg: { leg_name: string; needed: number; assigned: number }[];
  buses_flagged_count: number;
  buses_without_leader_count: number;
  gala_unseated_count: number;
};

export type AuditLogEntry = {
  id: number;
  actor_user_id: number | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
};

export type ChatSession = {
  id: number;
  event_id: number;
  title: string | null;
  created_at: string;
};

export type Citation = {
  title: string;
  source_type: string;
  href?: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations_json: Citation[] | null;
  tool_trace_json?: { name: string; arguments?: unknown; ok?: boolean }[] | null;
  created_at: string;
};

export type KnowledgeDocument = {
  id: number;
  event_id: number;
  title: string;
  body_md: string;
  is_published: boolean;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
};

export type KnowledgeCopyResult = {
  copied: number;
  skipped: number;
};

export type GalaConfig = {
  id: number;
  event_id: number;
  name: string;
  stage_label: string;
  turn_duration_seconds: number;
  hold_ttl_seconds: number;
  seat_quota_rule: "by_team_size" | "fixed";
  fixed_quota: number | null;
  status: "setup" | "drawing" | "in_progress" | "finished";
  draw_seed: number | null;
};

export type GalaTable = {
  id: number;
  event_id: number;
  code: string;
  name: string | null;
  x: number;
  y: number;
  shape: "round" | "rect";
  seat_count: number;
  is_active: boolean;
};

export type GalaSeatStatus = "available" | "held" | "confirmed" | "blocked";

export type GalaSeat = {
  id: number;
  table_id: number;
  seat_number: number;
  label: string | null;
  status: GalaSeatStatus;
  held_by_team_id: number | null;
  hold_expires_at: string | null;
  team_id: number | null;
  version: number;
};

export type GalaTurn = {
  id: number;
  team_id: number;
  team_name: string | null;
  order_no: number;
  seat_quota: number;
  status: "waiting" | "active" | "done" | "skipped" | "expired";
  started_at: string | null;
  expires_at: string | null;
  is_makeup: boolean;
  has_representative: boolean;
};

export type GalaState = {
  config: GalaConfig | null;
  tables: GalaTable[];
  seats: GalaSeat[];
  turns: GalaTurn[];
  my_team_id: number | null;
};

export type Bus = {
  id: number;
  event_id: number;
  leg_id: number;
  code: string;
  name: string | null;
  capacity: number;
  gather_at: string | null;
  depart_at: string | null;
  pickup_point_id: number | null;
  destination: string | null;
  leader_employee_id: number | null;
  leader_name: string | null;
  leader_phone: string | null;
  note: string | null;
};

export type BusAssignment = {
  id: number;
  bus_id: number | null;
  employee_id: number;
  leg_id: number;
  source: "auto" | "manual" | "import";
  is_locked: boolean;
  is_flagged: boolean;
  flag_reason: string | null;
  employee_code: string | null;
  full_name: string;
  team_name: string | null;
  requested_pickup_point_name: string | null;
  flight_code: string | null;
};

export type Flight = {
  id: number;
  event_id: number;
  flight_code: string;
  airline: string | null;
  direction: "outbound" | "inbound";
  shift_id: number | null;
  site_id: number | null;
  depart_at: string | null;
  arrive_at: string | null;
  origin: string | null;
  destination: string | null;
  capacity: number;
  note: string | null;
};

export type FlightAssignment = {
  id: number;
  flight_id: number | null;
  employee_id: number;
  direction: "outbound" | "inbound";
  source: "auto" | "manual" | "import";
  is_locked: boolean;
  is_flagged: boolean;
  flag_reason: string | null;
  employee_code: string | null;
  full_name: string;
  team_name: string | null;
  employee_site_id: number | null;
  requested_shift_name: string | null;
};

export type AllocationRun = {
  id: number;
  event_id: number;
  job_id: number | null;
  type: string;
  status: string;
  params_json: Record<string, unknown> | null;
  summary_json: {
    total_submitted: number;
    total_assigned: number;
    total_flagged: number;
    split_team_ids: number[];
    flights: { flight_id: number; capacity: number; assigned: number; remaining: number }[];
  } | null;
  created_at: string;
};

export type AllocationEnqueued = {
  job_id: number;
  allocation_run_id: number;
};

export type Job = {
  id: number;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  total: number | null;
  result_json: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  event_id: number | null;
};

export type ImportBatch = {
  id: number;
  type: string;
  filename: string;
  status: "queued" | "running" | "succeeded" | "failed";
  total_rows: number;
  ok_rows: number;
  error_rows: number;
  errors_json: { row: number; error: string }[] | null;
  created_at: string;
};

export type ImportEnqueued = {
  job_id: number;
  batch_id: number;
};

export type ScheduleItem = {
  id: number;
  event_id: number;
  day_date: string | null;
  start_at: string | null;
  end_at: string | null;
  title: string;
  description: string | null;
  location: string | null;
  audience: "all" | "shift" | "team";
  audience_ref_id: number | null;
  sort_order: number;
  is_published: boolean;
};

export type Announcement = {
  id: number;
  event_id: number;
  title: string;
  body_md: string;
  is_pinned: boolean;
  published_at: string | null;
};
