from functools import lru_cache

from app.core.config import get_settings
from app.services.rag.providers.anthropic_llm import AnthropicLLMProvider
from app.services.rag.providers.base import EmbeddingProvider, LLMProvider
from app.services.rag.providers.base import LLMResponse as LLMResponse
from app.services.rag.providers.base import ToolCall as ToolCall
from app.services.rag.providers.dashscope_llm import DashScopeLLMProvider
from app.services.rag.providers.local_embedding import LocalEmbeddingProvider

# Only concrete providers actually in use are wired up here (matches
# docs/PLAN.md's provider-agnostic requirement without building unused
# alternatives). The Protocol in base.py is what makes adding another one
# later a matter of implementing it and adding a branch below.


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    settings = get_settings()
    if settings.embedding_provider == "local":
        return LocalEmbeddingProvider()
    raise ValueError(f"Unsupported embedding provider: {settings.embedding_provider}")


@lru_cache
def get_llm_provider() -> LLMProvider:
    settings = get_settings()
    if settings.llm_provider == "anthropic":
        return AnthropicLLMProvider(api_key=settings.anthropic_api_key)
    if settings.llm_provider == "dashscope":
        return DashScopeLLMProvider(
            api_key=settings.dashscope_api_key,
            base_url=settings.dashscope_base_url,
            model=settings.dashscope_model,
        )
    raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")
