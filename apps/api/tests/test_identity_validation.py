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
