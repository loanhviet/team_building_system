from app.services.rag.chunking import chunk_text


def test_short_text_is_one_chunk():
    assert chunk_text("Quy định ngắn.") == ["Quy định ngắn."]


def test_empty_is_no_chunks():
    assert chunk_text("  ") == []


def test_long_text_splits_on_paragraphs():
    para = "x" * 400
    text = f"{para}\n\n{para}\n\n{para}\n\n{para}"
    chunks = chunk_text(text, max_chars=500, overlap=20)
    assert len(chunks) >= 3
    assert all(len(c) <= 520 for c in chunks)
