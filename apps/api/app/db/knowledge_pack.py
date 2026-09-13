"""DEMO corpus for ChatRAG, generated for testing — NOT real company policy.

Used only by `db/seed.py::seed_knowledge` to give a fresh/demo event some
terms + FAQ to test the concierge against. A real event's content is typed by
BTC on the Hỏi đáp admin tab (or copied from a prior event via "Sao chép từ
sự kiện khác") — no runtime code path reads this module directly.

Personal facts (my flight, my bus, my room) are NOT here — those come from
SQL tools. These documents answer policy / how-to questions CBNV would
otherwise dump on BTC via Zalo.
"""

TERMS_VERSION = "v2"

TERMS_TEXT = """\
# Quy định chương trình Team Building

Khi bấm Đồng ý trên form Đăng ký, tôi xác nhận đã đọc và chấp nhận toàn bộ quy định dưới đây, \
bao gồm chính sách phí phạt khi huỷ đăng ký không đúng quy định.

## 1. Đối tượng và đăng ký
- Chỉ CBNV có tài khoản công ty được đăng ký. Không mang người nhà, bạn bè hoặc khách mời \
trừ khi BTC có thông báo riêng bằng văn bản trên hệ thống.
- Đăng ký và chỉnh sửa chỉ được thực hiện khi sự kiện đang **mở đăng ký**, trước hạn đóng \
hiển thị trên form. Sau hạn, mọi thay đổi phải qua BTC.
- Xác nhận Có/Không tham gia là bắt buộc. Chọn Có thì phải tick đồng ý quy định trước khi nộp.

## 2. Ca bay là nguyện vọng
- Ca 1 / Ca 2 trên form là **nguyện vọng**, không phải chỗ đã giữ.
- Ca 2 là ca sau giờ giao dịch, dự kiến khởi hành sau 17:00.
- BTC phân bổ theo slot thực tế, ưu tiên cùng Team, cố gắng đáp ứng ca. Hệ thống **không cam kết** \
100% đúng nguyện vọng. Kết quả chính thức chỉ có sau khi BTC **công bố hành trình**.

## 3. Xe 4 chặng
CBNV chọn Có/Không cho từng chặng BTC cấu hình, thường gồm:
1. Nhà/văn phòng → Sân bay
2. Sân bay → Khách sạn
3. Khách sạn → Sân bay
4. Sân bay → Nhà/văn phòng
Điểm đón/trả chỉ được chọn từ danh sách BTC. Tick “cần xe” mà không chọn điểm đón là đăng ký chưa đủ.

## 4. Mong muốn / đề xuất
Ô ghi chú tự do để BTC nắm (ăn chay, dị ứng, sức khỏe, v.v.). Hệ thống **không cam kết** đáp ứng. \
BTC xử lý thủ công.

## 5. Huỷ đăng ký và phí phạt
- Huỷ **trước** hạn đóng đăng ký, trên hệ thống: không phạt.
- Huỷ **sau** hạn, hoặc không đến / bỏ chuyến không báo: BTC có thể tính phí phạt theo thông báo \
tài chính nội bộ (vé máy bay, phòng, xe đã đặt). Mức phí do BTC chốt từng kỳ, không do trợ lý chat \
tự đặt ra.
- Báo việc đột xuất cho BTC qua kênh nội bộ; không tự huỷ vé với hãng.

## 6. Công bố hành trình
Chuyến bay, xe, phòng, ghế Gala chỉ xem được sau khi sự kiện chuyển sang **Đã công bố**. \
Trước đó, CBNV chỉ xem được nội dung đã đăng ký và tài liệu/thông báo BTC đã đăng.

## 7. Thay đổi vận hành
Mọi đổi chuyến bay, xe, phòng do BTC thực hiện trên hệ thống. CBNV không tự liên hệ hãng bay / nhà xe \
/ khách sạn để đổi. Thông tin trên trang Hành trình là bản mới nhất.

## 8. Gala Dinner
Thứ tự Team do hệ thống bốc thăm. Đại diện Team chọn ghế khi tới lượt, đúng quota. \
Không chọn hộ qua chat. Trang phục: xem FAQ “Trang phục và lịch trình Gala”.

## 9. An toàn và liên hệ
Tuân thủ hướng dẫn trưởng xe, BTC và địa điểm. Trường hợp khẩn: gọi trưởng xe (SĐT trên Hành trình) \
hoặc BTC tại điểm tập trung. Số liệu cá nhân của CBNV khác không được chia sẻ.
"""

KNOWLEDGE_FAQS: list[tuple[str, str]] = [
    (
        "Trợ lý hỏi đáp trả lời được gì",
        """\
Trợ lý chỉ trả lời **thông tin của bạn** và **tài liệu BTC đã đăng** cho sự kiện hiện tại.

## Trả lời được
- Hạn đăng ký, sửa form, ca là nguyện vọng hay chỗ đã giữ
- Quy định huỷ / phí phạt, người nhà, mang theo gì, trang phục
- Đăng ký xe 4 chặng, ý nghĩa điểm đón
- Hành trình **của bạn** sau khi BTC công bố: bay, xe, phòng, lịch, Gala team bạn
- Bước tiếp theo: đang mở đăng ký / đang phân bổ / đã công bố / tới lượt chọn ghế
- Trưởng nhóm: danh sách team mình đã/chưa đăng ký (không xem team khác)

## Không trả lời được
- Phòng, xe, chuyến bay của người khác (kể cả cùng team, trừ roster trưởng nhóm)
- Bản nháp BTC chưa công bố
- Đặt/huỷ ghế Gala hộ — phải vào trang Gala
- Thời tiết, đặt nhà hàng bên ngoài, chính sách không có trong tài liệu

Không có trong tài liệu thì trợ lý phải nói **chưa có thông tin**, không được đoán. \
Chi tiết số liệu luôn lấy từ trang Đăng ký / Hành trình / Gala.
""",
    ),
    (
        "Cách đăng ký và hạn chỉnh sửa",
        """\
## Đăng ký
1. Vào trang **Đăng ký**.
2. Kiểm tra họ tên, email, Team, địa điểm làm việc (đổi Team nếu master data sai — báo BTC, không gõ tự do).
3. Chọn Có/Không tham gia. Nếu Có: đọc quy định, tick đồng ý, chọn ca, chọn nhu cầu xe từng chặng, \
điểm đón nếu cần xe, ghi mong muốn (không bắt buộc).
4. Nộp form. Hệ thống gửi email xác nhận.

## Hạn
- Chỉ đăng ký/sửa khi sự kiện **Đang mở đăng ký** và còn trước hạn đóng trên form.
- Hết hạn hoặc BTC đã đóng: form chuyển sang xem lại, không sửa được. Muốn đổi phải nhờ BTC.
- Nộp rồi vẫn sửa được **trong hạn**.

Hỏi “hạn đến khi nào?”: xem giờ `registration_close_at` trên sự kiện, không nhớ mốc cứng.
""",
    ),
    (
        "Ca bay là nguyện vọng, không phải chỗ đã giữ",
        """\
Ca 1 và Ca 2 trên form là **nguyện vọng đăng ký**.

- Ca 2: ca sau giờ giao dịch, dự kiến sau 17:00.
- BTC xếp chuyến theo số slot thật, ưu tiên cùng Team, cố gắng khớp ca. **Không cam kết 100%**.
- Kết quả chính thức (mã chuyến, giờ bay) chỉ có trên trang **Hành trình** sau khi BTC công bố.
- Câu “Ca 2 chắc được bay tối chứ?” → chưa chắc, chờ công bố. Trợ lý không hứa chỗ.
""",
    ),
    (
        "Đăng ký xe 4 chặng và điểm đón",
        """\
Mỗi CBNV tự chọn Có/Không **từng chặng**, không mặc định đi đủ 4 chặng.

Các chặng BTC thường cấu hình:
1. Nhà/văn phòng → Sân bay (chiều đi)
2. Sân bay → Khách sạn (chiều đi)
3. Khách sạn → Sân bay (chiều về)
4. Sân bay → Nhà/văn phòng (chiều về)

Nếu Có: phải chọn **điểm đón/trả** trong danh sách theo địa điểm làm việc (HN/HCM). \
Không được tự nhập địa chỉ.

Phân xe thật (mã xe, giờ tập trung, trưởng xe) chỉ có sau khi công bố, trên Hành trình. \
Form chỉ ghi **nhu cầu**.
""",
    ),
    (
        "Mong muốn, dị ứng, ăn chay",
        """\
Ô “Bạn có mong muốn hoặc đề xuất gì” để ghi ăn chay, dị ứng, hạn chế sức khỏe, yêu cầu đặc biệt.

BTC đọc và xử lý **thủ công**. Hệ thống không tự cam kết phòng riêng, thực đơn hay chỗ ngồi. \
Việc đã ghi trên form **không** có nghĩa là đã được duyệt — chờ thông báo BTC hoặc ghi chú trên Hành trình.
""",
    ),
    (
        "Chính sách huỷ đăng ký và phí phạt",
        """\
## Huỷ đúng hạn
Huỷ trên hệ thống **trước** hạn đóng đăng ký: không phạt.

## Huỷ sau hạn / không đến
BTC có thể tính phí phạt vì vé, phòng, xe đã đặt. Mức phí theo thông báo tài chính nội bộ từng kỳ. \
Trợ lý **không bịa số tiền** nếu tài liệu không ghi số.

## Cách huỷ
Trong hạn: huỷ trên trang Đăng ký. Sau hạn hoặc ngày diễn ra: báo BTC qua email/kênh nội bộ, \
nêu lý do. Không tự huỷ vé với hãng bay hay nhà xe.

Việc đột xuất (ốm, tang): vẫn báo BTC ngay để giảm thiệt hại đặt chỗ.
""",
    ),
    (
        "Khi nào xem được hành trình",
        """\
Trang **Hành trình** chỉ mở số liệu bay/xe/phòng/Gala khi sự kiện ở trạng thái **Đã công bố** \
(hoặc đang diễn ra / đã kết thúc).

Trước đó (đóng đăng ký, BTC đang phân bổ):
- Vẫn xem lại form đã nộp
- Vẫn hỏi quy định, thông báo đã đăng
- **Không** có mã chuyến, giờ xe, số phòng — kể cả khi BTC đã chạy phân bổ nội bộ

BTC đổi chỗ sau công bố: Hành trình và trợ lý đọc dữ liệu mới ngay, không cần chờ email \
(email chỉ là nhắc).
""",
    ),
    (
        "Quy tắc phân bổ chuyến bay",
        """\
BTC nhập/import slot từng chuyến rồi chạy phân bổ tự động, sau đó có thể chỉnh tay.

Nguyên tắc:
- Không vượt slot chuyến
- Ưu tiên cùng Team đi cùng nhau; Team quá lớn có thể bị tách và gắn cờ
- Cố gắng khớp nguyện vọng Ca 1/Ca 2; không khớp 100% thì vẫn có thể xếp và gắn cờ ca không đáp ứng
- Mọi chỉnh tay được ghi audit

CBNV không tự chọn chuyến. Muốn đổi sau công bố: nhờ BTC, không gọi hãng.
Xem chuyến **của bạn** trên Hành trình (chiều đi và chiều về).
""",
    ),
    (
        "Xe đưa đón, giờ tập trung, trưởng xe",
        """\
Xe được xếp theo nhu cầu đã đăng ký và chuyến bay, ưu tiên: cùng chuyến bay → cùng Team → lấp đầy, \
không vượt sức chứa. BTC chỉ định trưởng xe (tên + SĐT).

Sau công bố, từng chặng trên Hành trình có: mã/tên xe, giờ tập trung, giờ khởi hành, điểm tập trung, \
điểm đến, trưởng xe, ghi chú.

Đi tập trung **đúng giờ ghi trên Hành trình** (thường sớm hơn giờ khởi hành). Trễ xe tự túc, \
báo trưởng xe/BTC.

Không đổi xe với nhà xe. Chat trả giờ/mã **của bạn**, không đưa danh sách cả xe.
""",
    ),
    (
        "Khách sạn và phòng ở",
        """\
BTC nhập khách sạn/loại phòng/sức chứa rồi gán phòng (import hoặc xếp tay). Ưu tiên cùng Team, \
giới tính, sức chứa — CBNV không tự chọn phòng.

Sau công bố, Hành trình có: tên khách sạn, địa chỉ, số phòng, ngày nhận/trả phòng (nếu BTC nhập).

Chưa có số phòng sau công bố = chưa gán, không phải hệ thống giấu. Liên hệ BTC.
Không đổi phòng trực tiếp với lễ tân ngoài quy định BTC. Không hỏi phòng người khác qua chat.
""",
    ),
    (
        "Gala Dinner: bốc thăm, lượt chọn ghế, quota",
        """\
Gala giống chọn ghế rạp: sơ đồ bàn, sân khấu, trạng thái trống / đang giữ / đã xác nhận / không khả dụng.

## Thứ tự
BTC bốc thăm ngẫu nhiên thứ tự Team. Mỗi lượt có đồng hồ. Đại diện Team (trưởng nhóm hoặc người được phân quyền) \
chọn đúng số ghế **quota** (thường = sĩ số Team đã nộp và có tham gia).

## Cách chọn
Vào trang **Gala** khi tới lượt. Hệ thống khoá ghế tạm khi đang chọn để tránh hai team trùng ghế. \
Hết giờ mà chưa đủ ghế thì lượt có thể bị chuyển.

## Chat không đặt ghế
Trợ lý chỉ nói đã tới lượt chưa, quota, ghế team đã chọn, và đưa link trang Gala. \
Không giữ/xác nhận ghế hộ.
""",
    ),
    (
        "Trang phục và lịch trình Gala",
        """\
Dress code Gala Dinner: **smart casual**. Mặc gì tới Gala: lịch sự, gọn, không đồ thể thao. \
Không bắt buộc veston hay áo dài.

## Trang phục Gala Dinner
**Smart casual.** Nam: áo sơ mi / polo gọn, quần âu hoặc khaki, giày da hoặc sneaker sạch. \
Nữ: đầm/áo quần lịch sự tương đương.

**Không:** đồ thể thao, áo thun in hình, dép lê, mũ lưỡi trai trên sảnh tiệc.

Không bắt buộc veston hay áo dài trừ khi BTC đăng thông báo khác cho kỳ này.

## Lịch
Giờ và địa điểm Gala lấy từ **lịch trình đã đăng** trên Hành trình. \
Đến sớm 10–15 phút trước giờ bắt đầu trên lịch.
""",
    ),
    (
        "Mang theo gì",
        """\
## Giấy tờ (bắt buộc)
CCCD hoặc hộ chiếu **còn hiệu lực** khi làm thủ tục bay. Ảnh chụp giấy tờ trong điện thoại chỉ là dự phòng, \
không thay bản gốc.

## Nên mang
- Đồ bơi, kem chống nắng, mũ, áo khoác mỏng (máy bay / điều hoà)
- Thuốc cá nhân, phụ kiện sạc
- Trang phục Gala smart casual (xem FAQ trang phục)
- Tiền/thẻ cho chi tiêu tự túc ngoài chương trình

## Không cần
In boarding pass nếu hãng hỗ trợ điện tử — vẫn mang CCCD. \
Vali quá cước: tự chịu theo quy định hãng; BTC không thanh toán phát sinh này.
""",
    ),
    (
        "Người nhà và khách mời",
        """\
Chương trình chỉ dành cho CBNV đã đăng ký tham gia trên hệ thống.

Không mang người nhà, bạn bè, đối tác trừ khi BTC **đăng thông báo** và cấp chỗ riêng. \
Tự ý đưa thêm người: không có vé/xe/phòng/ghế Gala, BTC có quyền từ chối tại điểm tập trung.

Đăng ký hộ người khác bằng tài khoản mình là vi phạm. Mỗi tài khoản chỉ đăng ký cho đúng CBNV đó.
""",
    ),
    (
        "Đổi chuyến bay, xe hoặc phòng sau khi công bố",
        """\
Sau công bố, CBNV **không** tự đổi với hãng bay, nhà xe hay lễ tân.

Quy trình: nhắn BTC (kênh nội bộ), nêu lý do. BTC chỉnh trên hệ thống nếu còn slot. \
Mọi chỉnh tay có audit. Hành trình và trợ lý sẽ ra số liệu mới sau khi BTC lưu.

Trợ lý không gửi yêu cầu đổi hộ và không hứa còn chỗ.
""",
    ),
    (
        "Liên hệ khẩn và kênh BTC",
        """\
## Trong ngày di chuyển
1. Trưởng xe — tên và SĐT trên Hành trình, từng chặng
2. BTC tại điểm tập trung
3. Email/kênh nội bộ BTC đã ghi trong thông báo đã ghim

## Không làm
- Gọi tổng đài hãng bay đòi đổi vé tập thể
- Nhắn trợ lý chat như kênh cứu hộ (trợ lý không gọi được người thật)
- Chia sẻ SĐT CBNV khác

Tai nạn / y tế: gọi cấp cứu địa phương trước, rồi báo trưởng xe/BTC.
""",
    ),
    (
        "Việc trưởng nhóm làm trên hệ thống",
        """\
Trưởng nhóm (team_leader) ngoài quyền CBNV còn:
- Xem danh sách Team: ai đã/chưa nộp, có tham gia không, ca nguyện vọng — trang Team
- Đại diện chọn ghế Gala khi tới lượt, đúng quota

Không xem Team khác, không sửa đăng ký hộ (trừ khi BTC phân quyền riêng), \
không thấy phòng/chuyến chi tiết từng người trên chat trừ roster đã cho phép.

Hỏi “team mình ai chưa đăng ký?” chỉ trưởng nhóm được trả lời.
""",
    ),
]
