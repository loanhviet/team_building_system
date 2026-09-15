import io
from pathlib import Path
from zipfile import BadZipFile

from fastapi import UploadFile, status
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from openpyxl.workbook.workbook import Workbook

from app.core.errors import AppError

MAX_XLSX_BYTES = 10 * 1024 * 1024


def require_xlsx(file: UploadFile) -> None:
    if Path(file.filename or "").suffix.lower() != ".xlsx":
        raise AppError(
            "invalid_file_type",
            "Chỉ hỗ trợ file Excel định dạng .xlsx",
            status.HTTP_400_BAD_REQUEST,
        )


async def read_xlsx(file: UploadFile) -> bytes:
    require_xlsx(file)
    content = await file.read(MAX_XLSX_BYTES + 1)
    if len(content) > MAX_XLSX_BYTES:
        raise AppError(
            "file_too_large",
            "File Excel vượt quá giới hạn 10 MB",
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )
    if not content.startswith(b"PK"):
        raise AppError(
            "invalid_xlsx",
            "File .xlsx không hợp lệ hoặc đã bị hỏng",
            status.HTTP_400_BAD_REQUEST,
        )
    return content


def load_xlsx(content: bytes) -> Workbook:
    try:
        return load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except (BadZipFile, InvalidFileException, KeyError, OSError, ValueError) as exc:
        raise AppError(
            "invalid_xlsx",
            "File .xlsx không hợp lệ hoặc đã bị hỏng",
            status.HTTP_400_BAD_REQUEST,
        ) from exc
