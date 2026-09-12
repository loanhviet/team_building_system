from pydantic import BaseModel, EmailStr


class TeamCreate(BaseModel):
    code: str
    name: str
    parent_id: int | None = None


class TeamUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    parent_id: int | None = None
    is_active: bool | None = None


class TeamOut(BaseModel):
    id: int
    code: str
    name: str
    parent_id: int | None
    is_active: bool

    model_config = {"from_attributes": True}


class SiteCreate(BaseModel):
    code: str
    name: str


class SiteUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    is_active: bool | None = None


class SiteOut(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


class EmployeeCreate(BaseModel):
    employee_code: str | None = None
    full_name: str
    email: EmailStr
    team_id: int | None = None
    site_id: int | None = None
    phone: str | None = None
    gender: str | None = None
    position: str | None = None


class EmployeeUpdate(BaseModel):
    employee_code: str | None = None
    full_name: str | None = None
    email: EmailStr | None = None
    team_id: int | None = None
    site_id: int | None = None
    phone: str | None = None
    gender: str | None = None
    position: str | None = None
    is_active: bool | None = None


class EmployeePhoneUpdate(BaseModel):
    phone: str | None = None


class EmployeeOut(BaseModel):
    id: int
    employee_code: str | None
    full_name: str
    email: str
    team_id: int | None
    site_id: int | None
    phone: str | None
    gender: str | None
    position: str | None
    is_active: bool
    team_name: str | None = None
    site_name: str | None = None

    model_config = {"from_attributes": True}


class EmployeeListOut(BaseModel):
    items: list[EmployeeOut]
    total: int
    limit: int
    offset: int


class TeamRosterMember(BaseModel):
    employee_id: int
    employee_code: str | None
    full_name: str
    email: str
    phone: str | None
    registration_status: str | None
    is_participating: bool | None
    shift_name: str | None


class TeamRosterOut(BaseModel):
    event_id: int
    team_id: int
    team_name: str
    members: list[TeamRosterMember]
