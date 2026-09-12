# Thiết kế lại ChatRAG — Trợ lý hành trình (không phải RAG tài liệu generic)

> **Nguồn sự thật cho module hỏi đáp.** Đã triển khai trên branch `feat/chatrag-concierge` (1 commit `feat: ChatRAG concierge for trip Q&A`, tách từ `rebuild/r6-browser-acceptance` @ `c92dcc8`). Quay về trước ChatRAG: `git checkout rebuild/r6-browser-acceptance`.
>
> Phạm vi: hỏi đáp thông tin chuyến đi trên portal Team Building.  
> Đối chiếu lúc thiết kế: pipeline Phase 8 cũ + repo học `/home/viet/apal_tech/tu_hoc/rag_flow` (RAGFlow v0.26.4).  
> Quyết định cốt lõi: **không nhúng RAGFlow như sản phẩm thứ hai**. Port hybrid / rewrite / empty_response / retrieval-as-tool / citation — viết lại cho FastAPI + SQLite + Qdrant + ARQ.

## Trạng thái triển khai (đọc cái này trước khi sửa chat)

**Đã ship.** Không còn "embed hành trình cá nhân → cosine top-5". Concierge đang chạy.

| Lớp | Cách chạy |
|---|---|
| Sự thật vận hành (bay/xe/phòng/Gala/form **của người đang login**) | SQL tools, `employee_id` từ JWT — `services/rag/tools.py` |
| Quy định / FAQ / thông báo / lịch mô tả | Hybrid FTS5 + Qdrant trên văn bản **đã publish** |
| Corpus demo | `apps/api/app/db/knowledge_pack.py` → `seed_knowledge()` ghi vào DB. Chat **không** đọc file Python lúc hỏi |
| UI CBNV | `/chat` — gợi ý theo `event.status` |
| UI BTC | `/admin/events/{id}/knowledge` — CRUD markdown, confirm khi đăng, nút reindex |

Sau `make seed`, terms v2 + 17 FAQ nằm trong SQLite. Sửa kỳ thật trên admin, rồi reindex. Gọi `seed_knowledge` lần nữa sẽ **đè** FAQ trùng tiêu đề và unpublish FAQ extra.

Qdrant: `docker compose --profile rag up -d qdrant`. Không có Qdrant thì tool SQL vẫn trả lời được; FAQ dựa FTS5. Reindex khi Qdrant down rồi bật sau: phải force re-embed (checksum skip).

Test: `docker compose exec api pytest tests/test_rag_*.py tests/test_knowledge_pack.py`. Live: `nv010@teambuilding.vn` / `NV010` (phòng 102), `nv011` / `NV011` (phòng 103), `btc@teambuilding.vn` / `btc123`.

---

Phần dưới là thiết kế gốc (audit Phase 8, vì sao không RAG thường, lấy gì từ RAGFlow). Code đã theo kiến trúc đó — đừng implement lại pipeline cũ.

---

## 0. Kết luận ngắn

Chat hiện tại là “embed mọi thứ → cosine top-5 → LLM”. Cách đó **đúng với kho PDF doanh nghiệp**, **sai với bài toán này**.

Hệ thống đã là Single Source of Truth (BRD §13): chuyến bay, xe, phòng, Gala, đăng ký, lịch trình đều nằm trong SQLite, đã có API, đã có màn hình. Câu hỏi CBNV thật sự rơi vào 3 nhóm:

1. **Sự thật vận hành của chính họ** — “xe tôi mấy giờ?”, “phòng nào?”, “ghế Gala team tôi chưa?”. Đây là **lookup theo `employee_id`**, không phải tìm văn bản.
2. **Kiến thức sự kiện / quy định / thông báo** — “hủy có phạt không?”, “dress code?”, “lịch ngày 2”. Đây mới là RAG.
3. **Việc cần làm tiếp theo** — “tôi sửa đăng ký được không?”, “bao giờ được chọn ghế?”. Đây là **ý thức vòng đời sự kiện** + deep-link vào portal.

Mục đích phù hợp nhất của module: **giảm tải BTC (Zalo/email lặp lại) và giúp CBNV tra cứu đúng lúc, đúng người, không thay thế My Journey**. Chat là lớp ngôn ngữ tự nhiên trên dữ liệu đã có — không phải kho kiến thức thứ hai.

---

## 1. Audit luồng hiện tại

### 1.1 Pipeline đang chạy

```
CBNV gõ câu hỏi
  → POST /api/chat/sessions/{id}/messages
  → embed câu hỏi (MiniLM 384d, fastembed)
  → Qdrant cosine top-5, filter event_id + (scope=public OR employee=me)
  → nhét chunk vào system prompt
  → LLM stream SSE (DashScope Qwen)
  → citation = title + source_type
```

Ingest (`ingest.py`): mỗi schedule đã publish, announcement đã publish, `terms_text`, **mọi khách sạn**, và **một document “hành trình cá nhân” cho mỗi CBNV** khi event đã `information_published`. Reindex **chỉ khi admin gọi** `POST /events/{id}/rag/reindex` — **không có nút UI nào**.

### 1.2 Chỗ đúng (giữ)

- Phân quyền retrieval: `public OR (employee AND scope_ref_id=me)` lồng trong `must` — ý tưởng ACL đúng.
- Checksum skip re-embed — đúng hướng incremental ingest.
- SSE + session riêng khi ghi assistant message — đúng với FastAPI StreamingResponse.
- Provider derrière Protocol (`LLMProvider` / `EmbeddingProvider`) — thêm xAI/DashScope không đụng orchestrator.
- Tái dùng `build_journey()` thay vì suy diễn lại bay/xe/phòng.

### 1.3 Chỗ sai bài toán (phải đổi)

| Vấn đề | Hệ quả |
|---|---|
| Hành trình cá nhân bị **vector hóa thành 1 blob / người** | 120 embedding gần giống nhau; “phòng nào?” phụ thuộc cosine thay vì `WHERE employee_id=?`. Stale ngay khi BTC đổi xe mà quên reindex. |
| Retrieval **chỉ vector**, không keyword | Mã `VN001`, `XE01`, giờ `05:30` dễ trượt. RAGFlow gọi đây là lý do bắt buộc phải hybrid. |
| Query = đúng câu user cuối, **không rewrite** đa lượt | “còn chiều về thì sao?” sau câu hỏi bay → query rỗng nghĩa. RAGFlow có `refine_multiturn` / `full_question`. |
| Không tool, không router | LLM không gọi `get_my_journey`; không biết event chưa publish; không phân “của tôi” vs “quy định chung”. |
| Không index Gala, đăng ký, hạn, điểm đón, hướng dẫn dùng portal | Đúng những câu CBNV hay hỏi ngoài 7 khối Journey. |
| Hotel index **không theo trạng thái công bố** | Lộ khách sạn khi event còn `allocation_processing`. |
| `RagDocument.content` `String(5000)` | Cắt quy định dài. |
| Chat UI chết nếu chưa có journey | `useEmployeeEvent` + empty state “chưa có sự kiện” — trong khi lúc `registration_open` vẫn cần hỏi quy định / hạn nộp. |
| Gợi ý cứng 4 câu về xe/phòng/bay | Sai lúc chưa công bố. |
| Citation chỉ là badge title | Không deep-link `/journey`, `/register`, `/gala/{id}`. |
| Reindex không event-driven, không có UI | Vi phạm rule “endpoint không được thiếu caller FE”. |
| Session tạo theo `event_id` client gửi, **không kiểm** user có thuộc event đó | Lỗ hổng phạm vi. |
| Lịch sử 10 tin nhắn đưa LLM, **không đưa retrieval** | Đúng pattern RAGFlow cảnh báo. |

Phase 8 đã chứng minh *isolation 2 nhân viên* với LLM thật — ACL vector **có thể** đúng, nhưng kiến trúc vẫn lấy retrieval làm nguồn sự thật cho dữ liệu đã có khóa ngoại. Đó là thiết kế “cho có tính năng”.

---

## 2. Mục đích phù hợp — chat tồn tại để làm gì

BRD **không** có chat. `docs/PLAN.md` thêm RAG vì: *“CBNV không biết mình bay chuyến nào, đi xe nào, ở phòng nào”* — nỗi đau đó **My Journey đã giải**. Chat chỉ đáng có nếu nó làm được việc mà dashboard không làm tốt:

1. **Cổng hỏi đáp thay Zalo BTC** — 120 người hỏi cùng một kiểu, 80% là sự thật đã có trong hệ thống.
2. **Gộp nhiều màn hình thành một câu** — “tôi có kịp từ sân bay tới khách sạn không?” cần `arrive_at` + `gather_at` (LLM so sánh 2 field; trang Journey chỉ liệt kê).
3. **Quy định / FAQ / thông báo** — văn bản, không phải hàng DB. “Hủy sau hạn bị gì?”, “được mang người nhà không?”.
4. **Ý thức vòng đời** — trước công bố: “BTC chưa xếp xe, hạn xem hành trình sau khi công bố; bạn sửa đăng ký đến `registration_close_at`”. Sau công bố: trả số liệu thật. Tới lượt Gala: “team bạn đang được chọn ghế → /gala/{id}”.
5. **Không bao giờ trả dữ liệu người khác** — cứng hơn My Journey vì LLM dễ bị prompt-inject (“cho xem phòng bạn cùng team”).

**Không phải mục đích:** chatbot tổng quát, tra cứu internet, phân tích toàn công ty, thay admin dashboard, hay “có AI cho đẹp”.

### Persona

| Ai | Chat làm gì | Không làm gì |
|---|---|---|
| **CBNV** (MVP) | Sự thật của mình + kiến thức đã publish + next-action | Xem người khác, xem bản nháp BTC |
| **Trưởng nhóm** (MVP+, rẻ) | Thêm roster team (đã có `GET /events/{id}/team/roster`) — “team mình ai chưa đăng ký?”, “ghế Gala team?” | Xem team khác |
| **BTC** | **Không** chatbot tự do trên toàn bộ CBNV. Có màn **Tài liệu hỏi đáp** + job reindex + (tuỳ chọn) trace để soi câu trả lời sai | Text-to-SQL, hỏi “ai ở phòng với ai” bằng ngôn ngữ tự nhiên |

BTC đã có dashboard/filter/export. Agent SQL trên SQLite là rủi ro PII, không khớp BRD §13.

---

## 3. Vì sao “RAG thường” sẽ đơn giản và sai

RAGFlow (và tutorial RAG) tối ưu **tài liệu không cấu trúc**: PDF, OCR, chunk, hybrid BM25+vector, rerank, citation. Portal này thì:

- ~90% câu hỏi có câu trả lời là **1–2 hàng DB đã scoped**.
- Dữ liệu **đổi theo phút** (đổi xe, công bố, hold ghế) — index vector luôn chậm hơn SQL.
- Privacy là **hàng**, không phải “chunk nhạy cảm”.
- Unstructured thật sự chỉ là: quy định, thông báo, mô tả lịch, và (nên có) handbook/FAQ BTC soạn.

Nếu chỉ “làm RAG cho có”: embed journey, top-k, prompt “chỉ trả lời theo ngữ cảnh” — đúng những gì đang có, và sẽ tiếp tục (a) trả lời cũ sau khi BTC sửa, (b) trượt mã chuyến, (c) câm khi chưa publish, (d) không biết đẩy user sang Gala.

---

## 4. Kiến trúc đề xuất: Concierge = Tools + RAG hẹp

Hai nguồn context, ghép lúc infer:

```
                    ┌─ tools (SQL, scoped theo user) ── sự thật vận hành live
câu hỏi + history ──┤
                    └─ retrieve (hybrid) ────────────── văn bản đã publish
                              │
                              ▼
                    orchestrator (1 LLM + tool-calling)
                              │
                              ▼
                    câu trả lời + citation + deep-link
```

**Nguồn sự thật vận hành = DB qua tool.** Vector store **không** chứa hành trình cá nhân.

### 4.1 Tools (backend, không phải canvas RAGFlow)

Mỗi tool nhận `event_id` + `employee_id` từ session đã auth — **LLM không được truyền id người khác**.

| Tool | Trả về | Khi nào |
|---|---|---|
| `get_event_context` | status, hạn đăng ký, đã publish chưa, gala status | luôn |
| `get_my_registration` | tham gia?, ca nguyện vọng, nhu cầu 4 chặng, điểm đón, đã submit? | từ `registration_open` |
| `get_my_journey` | bay/xe/phòng/gala/lịch — **reuse `build_journey()`**; nếu chưa publish: `{published: false, reason}` | không bịa số liệu |
| `get_gala_my_team` | lượt team, quota, ghế đã chọn, deep-link | sau khi có Gala config |
| `search_event_knowledge` | hybrid retrieve văn bản public | quy định, FAQ, thông báo, lịch mô tả |
| `get_my_team_roster` | roster (chỉ `team_leader`+) | “team mình…” |

LLM được phép gọi nhiều tool trong 1 lượt (tối đa 3 vòng) rồi mới stream câu trả lời — pattern `agent_with_tools` của RAGFlow, **không** kéo theo canvas/DSL.

### 4.2 RAG chỉ cho knowledge public

Index (chunk) những nguồn này, `scope=public`, luôn `event_id`:

- `terms_text` (chunk theo heading / ~400–800 token)
- Announcement **đã** `published_at`
- Schedule item **đã** `is_published` (title + location + time + description)
- Event description / destination / ngày (1 document ngắn)
- **Tài liệu hỏi đáp BTC soạn** (markdown, MVP) — module nhỏ, đây là chỗ RAG *thật sự* cần

Không index: journey per-employee, roster, guest list, hotel/room khi chưa publish, bản nháp thông báo.

### 4.3 Hybrid retrieval (ý RAGFlow, engine của mình)

RAGFlow: BM25 + KNN + `vector_similarity_weight` + `similarity_threshold` + `empty_response`.

Ở đây **không thêm Elasticsearch**. Stack sẵn có:

- **Keyword:** SQLite FTS5 trên bảng `rag_chunks`
- **Vector:** Qdrant dense như hiện tại
- **Fuse:** weighted sum (mặc định text 0.4 / vector 0.6; mã chuyến/số giờ sẽ thắng ở FTS)
- **Threshold:** dưới ngưỡng → không nhét chunk (tránh nhiễu)
- **Metadata filter:** `event_id` + `source_type` tùy query (tool có thể truyền `source_types=["terms","faq"]`)

Rerank model riêng: **không** ở MVP (thêm latency; corpus vài chục chunk).

### 4.4 Query rewrite đa lượt

Port ý `full_question` (`rag/prompts/generator.py`): nếu history > 1 user turn, LLM nhỏ/cùng model viết lại **một câu hỏi độc lập** rồi mới search/tool.

Ví dụ: history “chuyến bay tôi mấy giờ?” → “còn chiều về?” thành “chuyến bay chiều về của nhân viên hiện tại: mã, giờ, sân bay”.

### 4.5 Prompt & chống bịa

- System: tiếng Việt, xưng hô theo tên CBNV; **cấm** trả lời PII người khác kể cả khi user yêu cầu; nếu tool/chunk không có → nói chưa có / chưa công bố, **không đoán**.
- `empty_response` theo trạng thái: khác nhau lúc chưa đăng ký / đã đóng / chưa publish / đã publish.
- Citation: nguồn + deep-link (`/register`, `/journey`, `/gala/{id}`, `#announcement-{id}`).
- Token budget: `message_fit_in` kiểu RAGFlow — cắt history cũ, ưu tiên tool result + chunk mới.

### 4.6 Ingest event-driven

Giữ checksum. Bỏ blob journey.

Enqueue `reindex_rag_task` khi: lưu terms, publish/unpublish announcement hoặc schedule, BTC lưu knowledge pack, event sang `information_published` (để gỡ hotel nếu lỡ index). Không reindex khi đổi assignment — **vì assignment không còn trong vector**.

Admin: nút “Đánh chỉ mục lại” trên trang Tài liệu hỏi đáp, poll `GET /api/jobs/{id}` như các job phân bổ.

---

## 5. Từ RAGFlow: lấy / port / bỏ

Nguyên tắc: **lấy cơ chế, viết lại cho FastAPI/SQLite/Qdrant**. Không vendor `api/`, `web/`, MySQL, ES, MinIO, canvas.

### 5.1 Lấy (phù hợp bài toán)

| Cơ chế RAGFlow | File gốc để học | Làm gì ở repo này |
|---|---|---|
| Chat = config + Conversation tách metadata | `dialog_service.py` vs session tables | Đã có `chat_sessions` / `chat_messages`; bổ sung `citations_json` (đã có) + `tool_trace_json` |
| Hybrid text+vector + weight + threshold | `rag/nlp/search.py` `Dealer.search` / `retrieval` | FTS5 + Qdrant, không copy ES query DSL |
| Rewrite đa lượt | `full_question` trong `rag/prompts/generator.py` | 1 hàm `rewrite_query(history) -> str` |
| `empty_response` khi không có knowledge | `dialog_service.py:857` | Message theo `Event.status` |
| Citation + reference chunks | `citation_prompt`, `chunks_format` | Badge + deep-link; marker `##n$$` **không** bắt buộc MVP |
| Retrieval như **một tool** trong agent | `agent/tools/retrieval.py` | `search_event_knowledge` |
| Agent + tools, max rounds | `agent/component/agent_with_tools.py` | Loop tool-calling OpenAI-compatible (DashScope đã tương thích) |
| Metadata filter bắt buộc | `get_filters` / Qdrant payload | `event_id` + publish-status; **không** employee vector |
| Incremental ingest theo checksum | task_executor (ý) | Giữ `reindex.py` checksum |
| SSE delta → final reference → done | chat API | Giữ, thêm event `tools` / `citations` |
| Prompt: instruction + knowledge + history + question | `kb_prompt` | System template tiếng Việt domain |

### 5.2 Không lấy (nặng, lệch domain)

| Thành phần | Lý do bỏ |
|---|---|
| DeepDoc / OCR / parser PDF-scan | BTC soạn markdown/thông báo; không phải kho hợp đồng scan |
| GraphRAG, RAPTOR, TreeRAG, mind map, TOC enhance | Corpus nhỏ, cấu trúc đã có schema |
| Canvas / DSL / categorize-switch visual | 5 tool cố định, không phải nền tảng agent |
| Text-to-SQL (`use_sql` / `exesql`) | PII, SQLite, BTC đã có dashboard |
| Web search, Tavily, crawler, Wikipedia, … | Câu hỏi nội bộ sự kiện |
| Deep Research / reasoning đệ quy | Latency; câu hỏi nông |
| Memory layer riêng (episodic) | Session ngắn; history 10 tin là đủ |
| Multi-tenant KB, embedding per-KB | Một event = một namespace |
| Elasticsearch / Infinity / MinIO / MySQL RAGFlow | Trùng stack |
| Sandbox code exec, MCP generic | Không có use-case |
| UI RAGFlow (dataset, chunk viewer đầy đủ) | Lạc design system portal |
| Langfuse | Optional sau; log tool_trace vào DB là đủ |

### 5.3 Không chạy RAGFlow sidecar

RAGFlow là **sản phẩm RAG đầy đủ** (tenant, dataset, parser, worker riêng). Personal journey **không map** sang “upload file vào KB”. Sidecar = hai nguồn sự thật, hai auth, hai UI — trái BRD. `CLAUDE.md` đã nói: redesign *against* ragflow, không extend sản phẩm đó.

“Lấy lại code” = **đọc và port algorithm/prompt**, không git-subtree cả repo.

---

## 6. Vận hành khi triển khai (kịch bản chạy thật)

Phần này mô tả **hệ thống chạy ngày thường ra sao**, không phải kiến trúc. Giả sử 5 PR đã merge, stack `make up` (+ profile `rag` khi cần Qdrant).

### 6.1 Process nào đang sống

| Process | Việc của nó với chat |
|---|---|
| `web` (Next) | Trang `/chat`, SSE, chip gợi ý, citation click |
| `api` (FastAPI) | Session, orchestrator, gọi tool SQL, gọi LLM stream |
| `worker` (ARQ) | Chỉ **index knowledge** (chunk + embed). Không trả lời chat |
| `redis` | Queue reindex; không lock ghế ở đây |
| `qdrant` (profile `rag`) | Vector của **văn bản public** (terms, thông báo, FAQ, lịch) |
| SQLite | Sự thật vận hành + FTS5 keyword + chat history |
| MailHog | Không liên quan chat |

Câu hỏi CBNV **không** đi worker. Worker chỉ chạy khi BTC publish FAQ / terms / thông báo / bấm reindex.

### 6.2 CBNV mở `/chat` thì thấy gì

1. Login JWT như các trang khác.
2. API tự chọn event: nếu đã có journey đã công bố → event đó; không thì `GET /events/current`. **Không** tin `event_id` từ localStorage.
3. Lấy hoặc tạo 1 session chat của user × event.
4. Màn hình:
   - Chip gợi ý **đổi theo status** (xem bảng dưới).
   - 1 ô nhập. Không có sidebar 20 cuộc chat (MVP: 1 thread / event).
   - Dòng chú thích: “Trợ lý chỉ biết thông tin **của bạn** và tài liệu BTC đã đăng. Không đoán khi chưa công bố.”

| Event status | Chip gợi ý | Tool nào sẽ chạy nếu bấm |
|---|---|---|
| `registration_open` | Hạn nộp? Ca là nguyện vọng? Quy định hủy? Cần xe chặng nào? | `get_event_context` + `get_my_registration` + `search_event_knowledge` |
| `registration_closed` / `allocation_processing` | Khi nào xem hành trình? Tôi đã đăng ký gì? | `get_event_context` + `get_my_registration` — **không** trả mã xe/phòng |
| `information_published`+ | Xe tập trung? Phòng? Bay chiều về? Lịch ngày 2? | `get_my_journey` (+ knowledge nếu hỏi lịch/quy định) |
| Đến lượt Gala của team | Team mình chọn ghế chưa? Quota? | `get_gala_my_team` → deep-link `/gala/{id}` |

### 6.3 Một câu hỏi chạy trong ~2–4 giây (trace)

Ví dụ: `nv002` (đã công bố hành trình) hỏi **“Xe của tôi tập trung lúc mấy giờ, trưởng xe là ai?”**

```
[0ms]  POST /api/chat/sessions/17/messages  {content: "..."}
       API đọc JWT → user_id=5, employee_id=2, session.event_id=1
       Lưu chat_messages role=user
[20ms] Load 10 tin gần nhất. Chỉ 1 lượt user → bỏ rewrite
[30ms] LLM round 1 (tool-calling, chưa stream ra UI)
       system: "bạn là trợ lý của Nguyễn Văn B, event TB 2026, status=information_published"
       tools: get_event_context, get_my_registration, get_my_journey,
              get_gala_my_team, search_event_knowledge
[400ms] LLM chọn get_my_journey {section: "buses"}
       ⚠️ employee_id KHÔNG nằm trong argument — server gắn employee_id=2
[420ms] SQL: BusAssignment ⋈ Bus ⋈ TransportLeg ⋈ PickupPoint
        WHERE event_id=1 AND employee_id=2
        → 4 chặng, chặng "HN → Sân bay": XE01, gather_at=05:30, leader=Anh Tuấn, SĐT=09…
[430ms] SSE event {tool: "get_my_journey", ok: true}
        UI hiện “Đang tra cứu hành trình…”
[450ms] LLM round 2: đã có JSON xe → không gọi thêm tool
[500ms] Stream delta ra UI:
        "Chặng HN → Sân bay: xe XE01, tập trung 05:30 tại [điểm đón],
         trưởng xe Anh Tuấn (tel:09…)."
        Citations: [{title: "Hành trình của bạn", href: "/journey"}]
[2s]   Done. Lưu assistant + citations + tool_trace
```

Điểm then chốt so với code hiện tại: **không embed, không Qdrant** cho câu này. Đổi giờ xe ở Admin xong, hỏi lại ngay ra giờ mới — worker không chạy.

### 6.4 Câu hỏi “mềm” thì mới đụng RAG

Ví dụ: **“Hủy đăng ký sau hạn bị phạt thế nào?”**

```
LLM chọn search_event_knowledge {query: "phạt hủy đăng ký sau hạn"}
  → rewrite không cần (câu đã đủ)
  → FTS5 MATCH "hủy OR phạt OR hạn" trên rag_chunks WHERE event_id=1
  → Qdrant cosine cùng filter
  → fuse, giữ chunk trên threshold
  → trúng chunk từ terms_text và/hoặc FAQ "Chính sách hủy"
LLM trả lời theo chunk, citation click → không có trang CBNV riêng
  (FAQ không public page) nên badge "Quy định chương trình" / "FAQ: Chính sách hủy"
Nếu BTC chưa viết gì và terms không nói phạt:
  score < threshold → empty_response:
  "Tài liệu sự kiện chưa ghi chính sách phạt. Liên hệ BTC."
  Không bịa.
```

### 6.5 Hội thoại nhiều lượt (lý do phải rewrite)

```
User: Chuyến bay của tôi mấy giờ?
  → get_my_journey(section=flights) → "Chiều đi VN223, 08:15 HAN→…"

User: Còn chiều về thì sao?
  → rewrite_query(history) =
    "Chuyến bay chiều về của nhân viên hiện tại: mã, giờ, sân bay đi/đến"
  → get_my_journey(section=flights) lần nữa
  → trả chiều về, không search chữ "còn chiều về" trên Qdrant
```

Hôm nay code hiện tại sẽ embed đúng cụm “còn chiều về thì sao?” — thường trượt hoặc nhặt announcement lung tung.

### 6.6 Vòng đời một kỳ TB — chat đổi hành vi, không đổi code

Lấy `nv002` đi suốt 1 event:

**A. `registration_open`** — chưa submit

- Mở `/chat` được (không còn dead-end “chưa có sự kiện”).
- “Tôi bay chuyến nào?” → `get_my_journey` trả `{published: false}` → “BTC chưa công bố hành trình. Bây giờ hãy đăng ký tại /register, hạn 20/09 17:00.”
- “Quy định chương trình?” → RAG terms.
- “Ca 2 có chắc được bay tối?” → `get_event_context` + knowledge: “Ca là nguyện vọng, không cam kết.”

**B. Đã submit, event sang `allocation_processing`**

- “Xe tôi?” → vẫn chưa công bố, không lộ bản nháp phân xe.
- “Tôi đăng ký ca nào, có cần xe sân bay không?” → `get_my_registration` đọc form đã lưu.

**C. BTC bấm công bố `information_published`**

- Không cần reindex 120 journey. Lần hỏi sau, `get_my_journey` thấy status ∈ PUBLISHED_STATUSES → trả bay/xe/phòng.
- Email công bố (module sẵn có) + chat cùng một nguồn SQL.

**D. BTC sửa tay: đổi `nv002` từ XE01 sang XE03, giờ 05:00**

- Admin PATCH bus assignment (luồng hiện có).
- `nv002` hỏi lại trong chat **không chờ job** → XE03 / 05:00.
- Vector store không chứa journey nên **không stale**.

**E. Gala: team nv002 tới lượt**

- Chip đổi: “Team mình đến lượt chọn ghế?”
- `get_gala_my_team` → status turn, quota, ghế đã hold/confirm, href `/gala/{id}`.
- Chat **không** hold/confirm ghế giúp — chỉ chỉ đường. Ghế vẫn qua màn Gala (Redis lock).

**F. `event_started` / `event_completed`**

- Vẫn hỏi được hành trình (đã đi vẫn tra cứu).
- Đăng ký không sửa được — `get_my_registration` nói hạn đã đóng.

### 6.7 BTC vận hành phía sau (không chat với bot)

BTC **không** có ô chat admin. Họ làm 3 việc, hệ thống tự nuôi knowledge:

1. **Soạn / publish thông báo, lịch, quy định** (màn hình đã có)  
   → `after_commit` enqueue `reindex_rag_task(event_id)`.  
   Worker: checksum → chỉ embed chunk đổi → FTS5 + Qdrant.  
   Job hiện trên trang Tài liệu hỏi đáp / Jobs như job phân bổ.

2. **Trang “Tài liệu hỏi đáp” mới**  
   Ví dụ tạo “FAQ: mang theo gì / dress code / liên hệ khẩn”. Confirm publish → reindex. Unpublish → xóa chunk. CBNV không thấy menu này; chỉ chat retrieve được bản published.

3. **Nút “Đánh chỉ mục lại”** khi nghi index lệch. Poll `GET /api/jobs/{id}`.

BTC **đổi xe/phòng/bay** thì không đụng index. Đó là tool SQL.

Nếu câu chat trả lời sai: admin mở record `chat_messages.tool_trace_json` (UI tối thiểu: xem JSON theo session, không playground). Trace ghi: query đã rewrite, tool nào gọi, chunk id + score. Không log full journey ở stdout.

### 6.8 Trưởng nhóm

`team_leader` đăng nhập, `/chat` giống CBNV **cộng** chip “Team mình ai chưa đăng ký?”.

- Gọi `get_my_team_roster` — server lấy `user.employee.team_id`, **cấm** truyền team khác.
- Trả: đã submit / chưa, ca nguyện vọng (roster API hiện có). Không trả phòng người khác team.
- CBNV thường: LLM có thể *muốn* gọi tool này → backend 403 → orchestrator nói “Bạn không xem được danh sách cả team.”

### 6.9 Hai người hỏi cùng lúc (isolation)

`nv002` và `nv003` hai tab:

- Cùng câu “tôi ở phòng nào?”
- Hai request, hai JWT, hai `employee_id`.
- `get_my_journey` không bao giờ `WHERE` id người kia.
- Qdrant lúc này **không có** document “Hành trình của Nguyễn Văn C” nên không còn phụ thuộc filter vector cho PII.

Cùng lúc BTC reindex FAQ: worker ghi Qdrant; chat đang stream không đợi worker.

### 6.10 Sự cố / thiếu dữ liệu — user thấy gì

| Tình huống | Hành vi |
|---|---|
| Qdrant down | Câu vận hành (xe/phòng) **vẫn chạy** (SQL). Câu FAQ: empty_response “không tra được tài liệu, thử lại / hỏi BTC” |
| Thiếu `DASHSCOPE_API_KEY` | SSE `{error}` + toast, không 500 câm |
| Event draft, user không thuộc event | `/chat` empty: chưa có sự kiện |
| Hỏi “phòng bạn cùng team A?” | Không có tool; prompt cấm; trả “mình chỉ xem được thông tin của bạn” |
| Hỏi thời tiết Đà Nẵng | Không web search; “ngoài phạm vi sự kiện” |
| Rate > 20/phút | 429 tiếng Việt |
| Knowledge chưa index xong | Job running; retrieve có thể miss → empty, không bịa |

### 6.11 Sơ đồ vận hành một lượt (gọn)

```
CBNV (trình duyệt /chat)
    │  JWT + câu hỏi
    ▼
API orchestrator
    ├─ rewrite nếu đa lượt
    ├─ LLM chọn tool
    ├─ SQL tools ──► SQLite (journey / registration / gala / roster)
    ├─ search tool ─┬─► FTS5 (mã, giờ, từ khóa)
    │               └─► Qdrant (nghĩa)     [chỉ văn bản đã publish]
    └─ stream SSE ──► UI (delta + citation + link)
Worker chỉ chạy khi BTC đổi tài liệu, không nằm trên đường trả lời.
```

Chitchat “xin chào” → không tool, không retrieve, trả 1 câu + chip gợi ý đúng status.

---

## 7. Module “Tài liệu hỏi đáp” (phần liên quan đáng thêm)

Đây là module *liên quan* duy nhất nên thêm — vì RAG không có gì mà “hỏi quy định” ngoài `terms_text` + announcement.

Corpus demo (quy định + FAQ đúng topic concierge) nằm ở `apps/api/app/db/knowledge_pack.py`, seed qua `seed_knowledge()` (upsert theo tiêu đề). Không nhét sự thật cá nhân (phòng/xe/bay của từng người) vào đây.

- Bảng `knowledge_documents`: `event_id`, `title`, `body_md`, `is_published`, `checksum`, `updated_by`, `updated_at`
- Admin: list + editor markdown (reuse pattern announcement), confirm trước publish
- CBNV không thấy trang riêng; chat retrieve khi published
- MVP: markdown, không PDF. PDF = phase sau (khi đó mới xét parser, vẫn không cần DeepDoc đầy đủ)

Không thêm: upload ảnh sơ đồ để VLM, chatbot BTC, knowledge graph.

---

## 8. Bảo mật (cứng hơn Phase 8)

- Mọi tool bind `employee_id` từ JWT, không từ argument LLM.
- `get_my_team_roster` 403 nếu không phải leader/admin.
- Knowledge retrieve chỉ `is_published` / schedule published / terms.
- Từ chối câu hỏi về người khác ngay trong system prompt **và** không có tool nào trả PII người khác cho CBNV.
- Không log nội dung journey vào log level info (PII).
- Rate limit chat (ví dụ 20 req/phút/user) — LLM tốn tiền.
- `GET /chat/sessions` đã filter `user_id`; giữ nguyên, thêm verify `event_id` thuộc user.

---

## 9. Frontend

- `/chat` sống từ lúc có `events/current`, không phụ thuộc journey.
- Streaming như hiện tại (`fetch` + SSE).
- Citation click → router.push deep-link.
- Hiện “đang tra cứu hành trình / tài liệu…” khi tool chạy (event SSE `tool`).
- Empty state giải thích **làm được / không làm được** (không đổi giúp người khác, không đoán khi BTC chưa công bố).
- Admin: trang Knowledge + nút reindex + trạng thái job. Không làm playground chat kiểu RAGFlow.

Nhãn qua `labels.ts`. Confirm dialog khi publish knowledge (có thể kích hoạt reindex + ảnh hưởng câu trả lời toàn công ty).

---

## 10. LLM / embedding

- Giữ Protocol hiện tại. Default runtime vẫn DashScope (đã verify).
- Embedding local MiniLM giữ — corpus tiếng Việt ngắn, không đổi E5 trừ khi hybrid FTS vẫn trượt semantic.
- Có thể thêm provider xAI (`XAI_API_KEY`, `https://api.x.ai/v1`) như một nhánh factory, **không bắt buộc đổi** model đang chạy.
- Gọi LLM = ARQ? Không: 1 lượt chat < vài giây, stream tại request (đã làm). Reindex/embed vẫn ARQ.

---

## 11. Việc không làm trong đợt này

- Responsive 390px (đã chốt bỏ cho giai đoạn này).
- Đầu tư UI chat “đẹp như ChatGPT”.
- Đánh thức RAG chat trong R6 — R6 vẫn nghiệm thu đăng ký/phân bổ/Gala; ChatRAG là phase **sau R6**.
- Copy `rag_flow/` vào monorepo.

---

## 12. Lộ trình PR (sau R6)

Mỗi PR độc lập, có browser verify (rule rebuild).

1. **Tools live, bỏ journey-vector**  
   `get_event_context` / `get_my_registration` / `get_my_journey` / `get_gala_my_team`. Ingest ngừng upsert `source_type=journey`. Chat vẫn retrieve public docs cũ. Test isolation 2 user bằng tool chứ không bằng Qdrant employee payload.

2. **Orchestrator tool-calling + query rewrite + empty_response**  
   `chat_service.py` viết lại. SSE thêm `tool` events. Prompt tiếng Việt domain.

3. **Hybrid FTS5 + Qdrant + chunking**  
   Bảng `rag_chunks`, chunk terms/announcements/schedule. Threshold. Admin reindex UI.

4. **Knowledge pack admin**  
   CRUD markdown + publish confirm + ingest. Gợi ý chat theo `event.status`. Citation deep-link.

5. **Team leader tool + hardening**  
   `get_my_team_roster`, rate limit, event_id server-side, browser: 2 tài khoản + trưởng nhóm + trạng thái chưa publish.

Nghiệm thu bắt buộc (browser, không chỉ curl):

- 2 CBNV hỏi “phòng tôi?” → mỗi người đúng phòng mình, không lộ người kia.
- Trước `information_published`: hỏi xe → “chưa công bố”, vẫn hỏi được quy định.
- BTC đổi giờ xe, **không** reindex, hỏi lại → giờ mới (vì tool SQL).
- “còn chiều về?” sau câu bay → rewrite ra chiều về.
- Hỏi mã chuyến đúng chữ → FTS trúng.
- Leader hỏi “ai chưa đăng ký?” → roster team mình; CBNV thường gọi tool đó → 403/im lặng nghiệp vụ.
- Publish FAQ → chat trả lời có citation; unpublish → hết.

---

## 13. Key decisions

1. Chat = **concierge có tool**, RAG chỉ cho văn bản public — vì sự thật vận hành đã nằm trong DB.  
2. **Xóa personal journey khỏi Qdrant** — privacy + freshness.  
3. **Port cơ chế RAGFlow, không port sản phẩm** — hybrid, rewrite, empty_response, retrieval-as-tool, citation.  
4. Hybrid = **FTS5 + Qdrant**, không ES.  
5. Thêm **Tài liệu hỏi đáp** (markdown) — nguồn unstructured duy nhất còn thiếu.  
6. BTC không có chatbot SQL.  
7. Chat mở từ `registration_open`, không chờ Journey.  
8. Làm sau R6; R6 không đụng chat ngoài màu/nhãn nếu còn.

---

## 14. Câu hỏi mở (mặc định nếu không chốt)

1. Knowledge pack markdown trong MVP — **mặc định: có**. PDF parser — không.  
2. Tool trưởng nhóm trong PR 5 — **mặc định: có**.  
3. Provider LLM — **giữ DashScope**; xAI chỉ là nhánh optional.  
4. Có cần BTC xem `tool_trace` trên admin không — **mặc định: log DB, UI tối thiểu (json trong job/audit), không full playground**.
