import json
from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.services.rag.providers.base import LLMResponse, ToolCall

DEFAULT_MODEL = "qwen3-max-preview"


class DashScopeLLMProvider:
    """Alibaba Cloud DashScope via its OpenAI-compatible endpoint. qwen3-max /
    qwen3-max-preview have thinking disabled by default, but `enable_thinking`
    is passed explicitly (via extra_body — it's not a standard OpenAI param)
    since open-source Qwen3 variants default the other way."""

    def __init__(self, api_key: str, base_url: str, model: str = DEFAULT_MODEL) -> None:
        self._client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self._model = model

    def _messages(self, system: str, messages: list[dict]) -> list[dict]:
        return [{"role": "system", "content": system}, *messages]

    async def generate(self, system: str, messages: list[dict]) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=self._messages(system, messages),
            extra_body={"enable_thinking": False},
        )
        return response.choices[0].message.content or ""

    async def stream(self, system: str, messages: list[dict]) -> AsyncIterator[str]:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=self._messages(system, messages),
            extra_body={"enable_thinking": False},
            stream=True,
        )
        async for chunk in response:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    async def complete(
        self, system: str, messages: list[dict], tools: list[dict] | None = None
    ) -> LLMResponse:
        kwargs: dict = {
            "model": self._model,
            "messages": self._messages(system, messages),
            "extra_body": {"enable_thinking": False},
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        response = await self._client.chat.completions.create(**kwargs)
        msg = response.choices[0].message
        tool_calls: list[ToolCall] = []
        for tc in msg.tool_calls or []:
            raw = {
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments or "{}",
                },
            }
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            if not isinstance(args, dict):
                args = {}
            tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args, raw=raw))
        return LLMResponse(content=msg.content or "", tool_calls=tool_calls)
