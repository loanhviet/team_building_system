from collections.abc import AsyncIterator
from typing import Protocol


class EmbeddingProvider(Protocol):
    dimension: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class LLMProvider(Protocol):
    async def generate(self, system: str, messages: list[dict]) -> str: ...

    def stream(self, system: str, messages: list[dict]) -> AsyncIterator[str]: ...
