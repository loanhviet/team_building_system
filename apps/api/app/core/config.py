from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "dev"
    app_base_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    database_url: str = "sqlite+aiosqlite:////data/teambuilding.db"

    jwt_secret: str = "change-me-in-prod"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    redis_url: str = "redis://localhost:6379/0"

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "Team Building <no-reply@teambuilding.local>"
    smtp_use_tls: bool = False

    qdrant_url: str = "http://localhost:6333"
    llm_provider: str = "anthropic"
    embedding_provider: str = "local"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    dashscope_api_key: str = ""
    dashscope_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    dashscope_model: str = "qwen3-max-preview"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
