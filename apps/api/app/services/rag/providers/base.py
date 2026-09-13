from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)


class EmbeddingProvider(Protocol):
    dimension: int

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class LLMProvider(Protocol):
    async def generate(self, system: str, messages: list[dict]) -> str: ...

    def stream(self, system: str, messages: list[dict]) -> AsyncIterator[str]: ...

    async def complete(
        self, system: str, messages: list[dict], tools: list[dict] | None = None
    ) -> LLMResponse: ...
