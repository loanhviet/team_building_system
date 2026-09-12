from functools import lru_cache

from app.core.config import get_settings
from app.services.rag.providers.anthropic_llm import AnthropicLLMProvider
from app.services.rag.providers.base import EmbeddingProvider, LLMProvider
from app.services.rag.providers.local_embedding import LocalEmbeddingProvider

# Only one concrete provider per interface is wired up for now (matches
# docs/PLAN.md's stated default: Anthropic for generation, local for
# embedding). The Protocol in base.py is what makes adding an OpenAI/other
# provider later a matter of implementing it and adding a branch here —
# building unused alternatives now would just be dead code.


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
    raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")
