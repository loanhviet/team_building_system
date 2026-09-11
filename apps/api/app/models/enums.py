import enum


class UserRole(str, enum.Enum):
    employee = "employee"
    team_leader = "team_leader"
    organizer = "organizer"
    super_admin = "super_admin"


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class EventStatus(str, enum.Enum):
    draft = "draft"
    registration_open = "registration_open"
    registration_closed = "registration_closed"
    allocation_processing = "allocation_processing"
    information_published = "information_published"
    event_started = "event_started"
    event_completed = "event_completed"


class JobStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class ImportBatchStatus(str, enum.Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
