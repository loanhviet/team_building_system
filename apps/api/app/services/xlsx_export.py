import io

from fastapi.responses import StreamingResponse
from openpyxl import Workbook

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def xlsx_file(
    sheet_title: str, headers: list[str], rows: list[list], filename: str
) -> StreamingResponse:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]
    ws.append(headers)
    for row in rows:
        ws.append(list(row))
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type=XLSX_TYPE,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
