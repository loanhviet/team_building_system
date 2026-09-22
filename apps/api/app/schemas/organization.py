from pydantic import BaseModel, EmailStr, field_validator, model_validator

from app.models.enums import Gender
from app.schemas.common import TrimmedModel, code, optional_text, phone, required_text


class TeamCreate(BaseModel):
    code: str
    name: str
    parent_id: int | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return code(value, label="Mã team", max_length=50, required=True) or ""

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return required_text(value, label="Tên team", max_length=200)


class TeamUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    parent_id: int | None = None
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return code(value, label="Mã team", max_length=50)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return optional_text(value, label="Tên team", max_length=200)

    @model_validator(mode="after")
    def require_submitted_name(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Tên team không được để trống")
        return self


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

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return code(value, label="Mã địa điểm", max_length=50, required=True) or ""

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return required_text(value, label="Tên địa điểm", max_length=200)


class SiteUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return code(value, label="Mã địa điểm", max_length=50)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return optional_text(value, label="Tên địa điểm", max_length=200)

    @model_validator(mode="after")
    def require_submitted_name(self):
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Tên địa điểm không được để trống")
        return self


class SiteOut(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


class EmployeeCreate(TrimmedModel):
    employee_code: str | None = None
    full_name: str
    email: EmailStr
    team_id: int | None = None
    site_id: int | None = None
    phone: str | None = None
    gender: Gender | None = None
    position: str | None = None
    send_welcome: bool = False

    @field_validator("employee_code")
    @classmethod
    def normalize_employee_code(cls, value: str | None) -> str | None:
        return code(value, label="Mã nhân viên", max_length=50)

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        return required_text(value, label="Họ và tên", max_length=200)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        return phone(value)

    @field_validator("position")
    @classmethod
    def normalize_position(cls, value: str | None) -> str | None:
        return optional_text(value, label="Chức vụ", max_length=100)


class EmployeeUpdate(TrimmedModel):
    employee_code: str | None = None
    full_name: str | None = None
    email: EmailStr | None = None
    team_id: int | None = None
    site_id: int | None = None
    phone: str | None = None
    gender: Gender | None = None
    position: str | None = None
    is_active: bool | None = None

    @field_validator("employee_code")
    @classmethod
    def normalize_employee_code(cls, value: str | None) -> str | None:
        return code(value, label="Mã nhân viên", max_length=50)

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str | None) -> str | None:
        return optional_text(value, label="Họ và tên", max_length=200)

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        return phone(value)

    @field_validator("position")
    @classmethod
    def normalize_position(cls, value: str | None) -> str | None:
        return optional_text(value, label="Chức vụ", max_length=100)

    @model_validator(mode="after")
    def require_submitted_name(self):
        if "full_name" in self.model_fields_set and self.full_name is None:
            raise ValueError("Họ và tên không được để trống")
        return self


class EmployeePhoneUpdate(BaseModel):
    phone: str | None = None

    @field_validator("phone")
    @classmethod
    def normalize_phone(cls, value: str | None) -> str | None:
        return phone(value)


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
    account_id: int | None = None
    account_role: str | None = None
    account_is_active: bool | None = None
    must_change_password: bool | None = None

    model_config = {"from_attributes": True}


class EmployeeListOut(BaseModel):
    items: list[EmployeeOut]
    total: int
    limit: int
    offset: int


class EmployeeStatsBySite(BaseModel):
    site_id: int
    site_name: str
    count: int


class EmployeeStatsOut(BaseModel):
    total: int
    active: int
    inactive: int
    accounts: int = 0
    by_site: list[EmployeeStatsBySite]


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
