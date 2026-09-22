import logging

from fastapi import Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app")


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        self.code = code
        self.message = message
        self.status_code = status_code


def _error_body(code: str, message: str, details: object = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(exc.code, exc.message),
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body("http_error", str(exc.detail)),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # jsonable_encoder, not the raw exc.errors(): for a custom field/model
    # validator Pydantic v2 puts the live exception object in each error's
    # `ctx["error"]`, which json.dumps can't serialize — so the response itself
    # raised TypeError and the client got a 500 with no body instead of a 422.
    # That silently made `model_validator` unusable anywhere in the app.
    details = jsonable_encoder(exc.errors())
    first_message = next(
        (detail.get("msg") for detail in details if isinstance(detail, dict) and detail.get("msg")),
        None,
    )
    # Validators in this application deliberately return Vietnamese messages.
    # Preserve them at the top level so every existing form gets an actionable
    # toast even before it has field-by-field rendering.
    message = first_message or "Dữ liệu gửi lên không hợp lệ"
    if message.startswith("Value error, "):
        message = message.removeprefix("Value error, ")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_body(
            "validation_error", message, details
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_body("internal_error", "Internal server error"),
    )
