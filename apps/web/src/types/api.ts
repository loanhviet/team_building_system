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
