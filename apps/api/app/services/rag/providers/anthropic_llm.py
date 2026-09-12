from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from app.services.rag.providers.base import LLMResponse

DEFAULT_MODEL = "claude-sonnet-5"


class AnthropicLLMProvider:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL) -> None:
        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def generate(self, system: str, messages: list[dict]) -> str:
        response = await self._client.messages.create(
            model=self._model, max_tokens=1024, system=system, messages=messages,
        )
        return "".join(block.text for block in response.content if block.type == "text")

    async def stream(self, system: str, messages: list[dict]) -> AsyncIterator[str]:
        async with self._client.messages.stream(
            model=self._model, max_tokens=1024, system=system, messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def complete(
        self, system: str, messages: list[dict], tools: list[dict] | None = None
    ) -> LLMResponse:
        # Tool-calling is implemented on the OpenAI-compatible DashScope path
        # (the provider actually used in this project). Anthropic stays a
        # generate-only fallback so the Protocol stays complete.
        text = await self.generate(system, messages)
        return LLMResponse(content=text, tool_calls=[])

