export type Role = "employee" | "team_leader" | "organizer" | "super_admin";

export type User = {
  id: number;
  email: string;
  role: Role;
  must_change_password: boolean;
  employee_id: number | null;
  full_name: string | null;
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

export type EventStatus =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "allocation_processing"
  | "information_published"
  | "event_started"
  | "event_completed";

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
  submitted_at: string | null;
  cancelled_at: string | null;
  transport_needs: TransportNeed[];
};

export type RegistrationAdmin = Registration & {
  employee_code: string | null;
  full_name: string;
  email: string;
  team_name: string | null;
};

export type EventTerms = {
  terms_text: string;
  terms_version: string;
};

export type Journey = {
  event_id: number;
  event_name: string;
  full_name: string;
  team_name: string | null;
  is_participating: boolean | null;
  flights: {
    direction: "outbound" | "inbound";
    flight_code: string;
    depart_at: string | null;
    arrive_at: string | null;
    origin: string | null;
    destination: string | null;
  }[];
  buses: {
    leg_name: string;
    bus_code: string;
    gather_at: string | null;
    depart_at: string | null;
    destination: string | null;
    leader_name: string | null;
    leader_phone: string | null;
  }[];
  room: { hotel_name: string; room_number: string } | null;
  schedule: {
    day_date: string | null;
    start_at: string | null;
    end_at: string | null;
    title: string;
    location: string | null;
  }[];
  announcements: {
    title: string;
    body_md: string;
    is_pinned: boolean;
    published_at: string | null;
  }[];
};

export type Hotel = {
  id: number;
  event_id: number;
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

export type RoomAssignment = {
  id: number;
  room_id: number;
  employee_id: number;
  source: "manual" | "import";
  employee_code: string | null;
  full_name: string;
  team_name: string | null;
  hotel_name: string;
  room_number: string;
  assigned_at: string | null;
};

export type UnassignedEmployee = {
  employee_id: number;
  employee_code: string | null;
  full_name: string;
};

export type ImportResult = {
  ok_rows: number;
  error_rows: number;
  errors: { row: number; error: string }[];
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
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  citations_json: Citation[] | null;
  created_at: string;
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
};

export type Flight = {
  id: number;
  event_id: number;
  flight_code: string;
  airline: string | null;
  direction: "outbound" | "inbound";
  shift_id: number | null;
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
