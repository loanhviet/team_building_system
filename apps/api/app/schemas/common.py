"""Shared normalization and validation for human-entered operational data."""

import re

import phonenumbers
from pydantic import BaseModel, field_validator

CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]*$")


def required_text(value: str, *, label: str, max_length: int) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{label} không được để trống")
    if len(normalized) > max_length:
        raise ValueError(f"{label} không được dài quá {max_length} ký tự")
    return normalized


def optional_text(value: str | None, *, label: str, max_length: int) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > max_length:
        raise ValueError(f"{label} không được dài quá {max_length} ký tự")
    return normalized


def code(value: str | None, *, label: str, max_length: int, required: bool = False) -> str | None:
    if value is None:
        if required:
            raise ValueError(f"{label} không được để trống")
        return None
    normalized = value.strip().upper()
    if not normalized:
        if required:
            raise ValueError(f"{label} không được để trống")
        return None
    if len(normalized) > max_length:
        raise ValueError(f"{label} không được dài quá {max_length} ký tự")
    if not CODE_PATTERN.fullmatch(normalized):
        raise ValueError(f"{label} chỉ gồm chữ cái, chữ số, dấu gạch ngang hoặc gạch dưới")
    return normalized


def phone(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    raw = value.strip()
    try:
        parsed = phonenumbers.parse(raw, "VN")
    except phonenumbers.NumberParseException as exc:
        raise ValueError("Số điện thoại không hợp lệ") from exc
    if not phonenumbers.is_valid_number(parsed):
        raise ValueError("Số điện thoại không hợp lệ")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


class TrimmedModel(BaseModel):
    """Common email normalization shared by account-owning schemas."""

    @field_validator("email", check_fields=False)
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        return value.strip().lower() if value is not None else None
