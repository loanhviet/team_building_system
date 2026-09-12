import asyncio

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


class LocalEmbeddingProvider:
    """fastembed (ONNX runtime, no torch) — good multilingual coverage including
    Vietnamese, small enough to run in the API/worker containers without a GPU.
    Inference is CPU-bound sync code, so it's always run via asyncio.to_thread.
    Unlike E5-family models, this one needs no "query:"/"passage:" prefixing."""

    dimension = 384

    def __init__(self) -> None:
        self._model = None

    def _get_model(self):
        if self._model is None:
            from fastembed import TextEmbedding

            self._model = TextEmbedding(model_name=MODEL_NAME)
        return self._model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        def _run() -> list[list[float]]:
            model = self._get_model()
            return [vec.tolist() for vec in model.embed(texts)]

        return await asyncio.to_thread(_run)
