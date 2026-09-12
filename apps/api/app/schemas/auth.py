from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserOut(BaseModel):
    id: int
    email: str
    role: str
    must_change_password: bool
    employee_id: int | None = None
    full_name: str | None = None
    employee_code: str | None = None
    phone: str | None = None
    team_name: str | None = None
    site_name: str | None = None

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserAdminOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    must_change_password: bool
    employee_id: int | None
    full_name: str | None
    employee_code: str | None
    last_login_at: datetime | None = None


class UserAdminUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None


class ResetPasswordOut(BaseModel):
    temporary_password: str
