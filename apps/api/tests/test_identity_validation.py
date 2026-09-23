import pytest
from pydantic import ValidationError

from app.schemas.organization import EmployeeCreate, EmployeeUpdate, TeamCreate


def test_employee_identity_is_normalized() -> None:
    employee = EmployeeCreate(
        employee_code="  nv_0001 ",
        full_name="  Nguyễn Văn A ",
        email="  NGUYEN.A@COMPANY.VN ",
        phone="0901 234 567",
    )

    assert employee.employee_code == "NV_0001"
    assert employee.full_name == "Nguyễn Văn A"
    assert str(employee.email) == "nguyen.a@company.vn"
    assert employee.phone == "+84901234567"


@pytest.mark.parametrize(
    "factory, payload",
    [
        (EmployeeUpdate, {"full_name": "  "}),
        (TeamCreate, {"code": "team one", "name": "Team One"}),
    ],
)
def test_identity_validation_rejects_blank_names_and_invalid_codes(factory, payload) -> None:
    with pytest.raises(ValidationError):
        factory(**payload)


def test_phone_rejects_letters() -> None:
    with pytest.raises(ValidationError):
        EmployeeCreate(
            full_name="Nguyễn Văn A",
            email="a@company.vn",
            phone="0901234567a",
        )


def test_shift_time_must_be_hhmm() -> None:
    from app.schemas.event import ShiftCreate

    assert ShiftCreate(code="ca1", name="Ca 1", depart_after_time="17:00").depart_after_time == "17:00"
    with pytest.raises(ValidationError):
        ShiftCreate(code="ca1", name="Ca 1", depart_after_time="abc")
