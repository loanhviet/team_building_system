FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

# Keep third-party dependencies in a layer keyed only by pyproject.toml. The
# previous order copied all source first, so editing a Python file redownloaded
# heavy RAG dependencies such as onnxruntime, fastembed and numpy.
COPY pyproject.toml ./
RUN mkdir -p app && touch app/__init__.py
RUN uv pip install --system --no-cache -e ".[dev]"

COPY . .
# Reinstall the editable project after source is present, without resolving
# dependencies a second time.
RUN uv pip install --system --no-cache --no-deps -e .

EXPOSE 8000

CMD ["sh", "./entrypoint.sh"]
