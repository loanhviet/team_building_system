"""Split long published text into retrieval-sized chunks.

Corpus here is markdown terms / announcements / FAQ — not scanned PDFs — so
we pack on blank lines and keep a small overlap. One short document stays
one chunk.
"""

MAX_CHARS = 1200
OVERLAP = 120


def chunk_text(text: str, max_chars: int = MAX_CHARS, overlap: int = OVERLAP) -> list[str]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_chars:
        return [cleaned]

    paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        candidate = f"{buf}\n\n{para}".strip() if buf else para
        if len(candidate) <= max_chars:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
            tail = buf[-overlap:] if overlap and len(buf) > overlap else ""
            buf = f"{tail}\n\n{para}".strip() if tail else para
        else:
            # A single paragraph longer than the window — hard-split.
            start = 0
            while start < len(para):
                end = min(start + max_chars, len(para))
                chunks.append(para[start:end])
                start = end - overlap if end < len(para) else end
            buf = ""
        if len(buf) > max_chars:
            chunks.append(buf[:max_chars])
            buf = buf[max_chars - overlap :]
    if buf:
        chunks.append(buf)
    return chunks
