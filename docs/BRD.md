YÊU CẦU XÂY DỰNG HỆ THỐNG QUẢN LÝ TEAM BUILDING
Business / Product Requirement Document (BRD/PRD – Draft)
# 1. Mục tiêu
Xây dựng một hệ thống quản lý Team Building tập trung (One-stop Portal), giúp CBNV đăng ký và theo dõi toàn bộ thông tin chương trình trên một nền tảng duy nhất; đồng thời giúp BTC quản lý dữ liệu, phân bổ nguồn lực và điều phối chương trình.
CBNV đăng ký tham gia và cung cấp đầy đủ thông tin cần thiết.
BTC quản lý tập trung dữ liệu CBNV, Team, chuyến bay, khách sạn/phòng và xe.
Hệ thống hỗ trợ tự động phân bổ chuyến bay theo các quy tắc nghiệp vụ.
BTC có thể điều chỉnh thủ công các trường hợp ngoại lệ.
CBNV xem được toàn bộ hành trình của mình: đăng ký → chuyến bay → xe → khách sạn/phòng → Gala Dinner → lịch trình.
Dữ liệu được đồng bộ trên cùng một hệ thống (Single Source of Truth).
# 2. Đối tượng sử dụng & phân quyền

[TABLE]
| Nhóm người dùng | Quyền chính |
| CBNV | Đăng ký; xem và cập nhật thông tin cá nhân trong thời gian cho phép; xem lịch trình và các thông tin được phân bổ. |
| BTC/Admin | Quản lý dữ liệu; cấu hình nguồn lực; chạy phân bổ; điều chỉnh thủ công; công bố thông tin; gửi thông báo; xuất dữ liệu. |
| Team Leader/Đại diện Team (nếu áp dụng) | Xem danh sách Team; theo dõi trạng thái; thực hiện thao tác liên quan đến chọn chỗ Gala Dinner theo phân quyền. |
| Super Admin | Toàn quyền cấu hình và quản trị hệ thống. |
[/TABLE]

# 3. Tổng quan các chức năng
Hệ thống đề xuất gồm 05 module: (1) Đăng ký Team Building; (2) Quản lý và phân bổ chuyến bay/khách sạn; (3) Quản lý và điều phối xe; (4) Gala Dinner – bốc thăm/chọn chỗ ngồi; (5) My Team Building Journey – dashboard hành trình cá nhân.
# 4. Module 1 – Đăng ký Team Building
4.1. CBNV truy cập hệ thống bằng tài khoản công ty/SSO (đề xuất) để đảm bảo xác định đúng danh tính và hạn chế nhập sai thông tin.
4.2. Thông tin CBNV cần hiển thị/thu thập:

[TABLE]
| Thông tin | Yêu cầu |
| Họ và tên | Auto-fill từ hệ thống nhân sự/SSO nếu có; trường hợp không có cho phép hiển thị theo dữ liệu master. |
| Email | Auto-fill, dùng email công ty. |
| Bộ phận/Team | Chọn từ Master Data do BTC cấu hình; không cho nhập tự do để thống nhất tên Team. |
| Mã nhân viên | Nếu hệ thống hiện có dữ liệu. |
| Địa điểm làm việc | HN/HCM hoặc danh sách địa điểm do BTC cấu hình. |
| Số điện thoại | Tùy nhu cầu điều phối của BTC. |
[/TABLE]

4.3. Xác nhận tham gia: CBNV chọn Có/Không tham gia. Nếu chọn Có, bắt buộc xác nhận đã đọc và đồng ý với quy định chương trình, bao gồm chính sách/phí phạt trong trường hợp hủy đăng ký không đúng quy định. Chỉ được Submit khi hoàn tất các xác nhận bắt buộc.
4.4. Đăng ký ca đi: CBNV lựa chọn Ca 1 hoặc Ca 2. Ca 2 là ca bay sau giờ giao dịch, dự kiến sau 17h00. Hệ thống cần hiển thị rõ đây là 'nguyện vọng đăng ký'; BTC sẽ phân bổ theo nguồn lực và quy tắc chung, không cam kết chắc chắn đáp ứng 100%.
4.5. Đăng ký nhu cầu xe: CBNV lựa chọn Có/Không cho từng chặng: (i) HN/HCM → Sân bay; (ii) Sân bay → Khách sạn; (iii) Khách sạn → Sân bay; (iv) Sân bay → HN/HCM. Nếu có nhiều điểm tập trung, hệ thống cho phép chọn điểm đón/trả từ danh sách BTC cấu hình.
4.6. Mong muốn/đề xuất: Có trường nhập tự do 'Bạn có mong muốn hoặc đề xuất gì cho kỳ Team Building lần này?'. BTC có thể xem và xử lý thủ công; hệ thống không mặc định cam kết đáp ứng yêu cầu.
4.7. Sau khi Submit thành công: (i) hiển thị thông báo đăng ký thành công; (ii) gửi email xác nhận tự động tới CBNV, bao gồm các thông tin đã đăng ký như Team, trạng thái tham gia, ca bay đăng ký và nhu cầu xe.
# 5. Module 2 – Quản lý & phân bổ chuyến bay
5.1. BTC có màn hình quản lý chuyến bay và có thể nhập/import dữ liệu: mã chuyến bay, ngày bay, giờ bay, điểm đi/đến, số lượng slot/sức chứa và các thông tin cần thiết.
5.2. Hệ thống cần hỗ trợ AUTO FLIGHT ALLOCATION dựa trên dữ liệu đăng ký của CBNV và số lượng slot BTC cung cấp.
5.3. Nguyên tắc ưu tiên đề xuất:
Không vượt quá số slot/sức chứa của từng chuyến bay.
Ưu tiên các thành viên cùng Team được bay cùng nhau.
Tối đa hóa số lượng thành viên cùng Team đi chung một chuyến trong trường hợp Team không thể xếp hoàn toàn cùng nhau.
Cố gắng đáp ứng nguyện vọng Ca 1/Ca 2 của từng CBNV.
Các trường hợp không thể đáp ứng đồng thời các điều kiện cần được đánh dấu (flag) để BTC xử lý.
5.4. Logic phân bổ đề xuất: Hệ thống nhóm CBNV theo Team → xác định số lượng thành viên và nguyện vọng ca → đối chiếu số slot của từng chuyến → phân bổ phương án tối ưu → đánh dấu các ngoại lệ. Kết quả phân bổ cần hiển thị rõ số lượng đã xếp, số slot còn lại và mức độ Team bị tách.
5.5. Manual Adjustment: Sau khi hệ thống phân bổ tự động, BTC phải có thể điều chỉnh thủ công một cá nhân hoặc cả nhóm/Team sang chuyến khác. Sau mỗi lần điều chỉnh, hệ thống cần kiểm tra lại số slot và cảnh báo nếu vượt sức chứa hoặc phát sinh vi phạm quy tắc.
5.6. Change Log/Audit Log: Lưu lịch sử thay đổi tối thiểu gồm thời gian, người thay đổi, dữ liệu trước/sau và lý do thay đổi (nếu BTC yêu cầu).
# 6. Quản lý khách sạn/phòng
BTC cần có thể nhập/import danh sách khách sạn, loại phòng, số lượng phòng và sức chứa. Hệ thống nên hỗ trợ phân bổ hoặc import kết quả phân phòng tùy mức độ phức tạp của nghiệp vụ.
Đề xuất MVP: ưu tiên màn hình quản lý và import danh sách phân phòng; CBNV chỉ xem thông tin phòng đã được BTC công bố. Nếu cần auto allocation, các quy tắc như cùng Team, giới tính, sức chứa và yêu cầu đặc biệt phải được thống nhất riêng trước khi phát triển.
# 7. Module 3 – Quản lý & điều phối xe
7.1. Hệ thống quản lý tối thiểu 04 chặng: HN/HCM → Sân bay; Sân bay → Khách sạn; Khách sạn → Sân bay; Sân bay → HN/HCM.
7.2. BTC có thể cấu hình từng xe: mã/tên xe, sức chứa, chặng, thời gian tập trung/khởi hành, điểm tập trung/điểm đến và các thông tin khác.
7.3. Hệ thống hỗ trợ phân xe tự động dựa trên nhu cầu đã đăng ký và thông tin phân bổ chuyến bay. Nguyên tắc ưu tiên đề xuất: (1) người cùng chuyến bay; (2) người cùng Team; (3) tối ưu công suất xe; (4) không vượt sức chứa.
7.4. BTC có thể điều chỉnh danh sách xe thủ công và chỉ định Trưởng xe. Thông tin Trưởng xe gồm tối thiểu: họ tên và số điện thoại liên hệ.
7.5. CBNV phải xem được thông tin cụ thể cho từng chặng: tên/mã xe, giờ tập trung/khởi hành, địa điểm, danh sách hoặc thông tin Trưởng xe và các lưu ý cần thiết.
# 8. Module 4 – Gala Dinner: bốc thăm/chọn chỗ ngồi
8.1. Hệ thống cần có sơ đồ trực quan khu vực Gala Dinner tương tự trải nghiệm chọn ghế rạp phim: hiển thị sân khấu, bàn/ghế và trạng thái chỗ ngồi.
8.2. Các trạng thái tối thiểu: ghế trống; ghế đã được chọn; ghế của Team đang thao tác; ghế không khả dụng.
8.3. Cơ chế đề xuất: hệ thống random thứ tự các Team → Team được gọi theo lượt → đại diện Team vào hệ thống và chọn bàn/ghế tương ứng với số lượng thành viên Team. Cơ chế random và thời gian cho mỗi lượt cần BTC cấu hình.
8.4. Hệ thống phải kiểm soát số ghế tối đa Team được chọn theo số lượng thành viên hợp lệ.
8.5. Cần xử lý concurrent access: khi nhiều người thao tác đồng thời, không được xảy ra tình trạng hai Team xác nhận cùng một ghế. Đề xuất cơ chế Seat Locking tạm thời trong quá trình chọn, sau khi xác nhận chuyển sang trạng thái Confirmed.
# 9. Module 5 – My Team Building Journey
Đây là dashboard cá nhân của CBNV. Sau khi BTC công bố thông tin, mỗi CBNV đăng nhập và xem toàn bộ hành trình trên một màn hình/tập trung trong cùng hệ thống.
Thông tin cá nhân và Team.
Thông tin chuyến bay chiều đi/chiều về: mã chuyến, thời gian, điểm đi/đến.
Thông tin xe cho từng chặng: xe, thời gian, điểm tập trung, Trưởng xe.
Thông tin khách sạn và phòng.
Thông tin Gala Dinner: bàn/ghế.
Lịch trình tổng thể của chương trình.
Các thông báo hoặc thay đổi mới nhất từ BTC.
# 10. Admin Dashboard & quản lý dữ liệu
BTC cần một khu vực quản trị tập trung với các chức năng: quản lý CBNV; Master Data Team/Bộ phận; trạng thái đăng ký; danh sách chuyến bay và slot; khách sạn/phòng; xe và sức chứa; trưởng xe; Gala Dinner; lịch trình; thông báo.
Dashboard tổng quan nên hiển thị các chỉ số: tổng số CBNV; số đã/chưa đăng ký; số đăng ký theo Ca 1/Ca 2; nhu cầu xe theo từng chặng; tình trạng sử dụng slot chuyến bay; tình trạng phân bổ xe/phòng.
Tất cả danh sách cần có chức năng tìm kiếm, lọc, sắp xếp và export dữ liệu. Cần làm rõ định dạng import/export ưu tiên (Excel/CSV).
# 11. Notification & Email
Phase đầu yêu cầu tối thiểu gửi Email tự động. Các trigger gồm: đăng ký thành công; BTC công bố thông tin; thay đổi chuyến bay; thay đổi xe; thay đổi lịch trình hoặc các thay đổi quan trọng khác.
Email nên có link dẫn trực tiếp tới hệ thống để CBNV luôn xem phiên bản thông tin mới nhất. Có thể xem xét tích hợp Microsoft Teams/App Notification ở Phase sau.
# 12. Trạng thái chương trình

[TABLE]
| Trạng thái | Ý nghĩa |
| Registration Open | CBNV được đăng ký/chỉnh sửa theo quyền. |
| Registration Closed | Đóng đăng ký. |
| Allocation Processing | BTC đang phân bổ và dữ liệu chưa công bố chính thức. |
| Information Published | CBNV được xem thông tin đã phân bổ. |
| Event Started/Completed | Phục vụ quản lý vòng đời chương trình. |
[/TABLE]

# 13. Yêu cầu nghiệp vụ & kỹ thuật quan trọng
Single Source of Truth: mọi thông tin phải sử dụng chung nguồn dữ liệu. Khi BTC thay đổi chuyến bay của một CBNV, các thông tin liên quan phải được cập nhật nhất quán.
Auto Allocation + Manual Adjustment: không yêu cầu tự động hóa tuyệt đối; hệ thống cần tạo phương án phân bổ và cho phép BTC xử lý ngoại lệ.
Configurable: không hard-code số ca, chuyến bay, Team, xe, sức chứa, khách sạn hoặc lịch trình. BTC/Admin phải có khả năng cấu hình theo từng kỳ Team Building.
Audit Log: lưu các thay đổi quan trọng.
Data validation: cảnh báo trùng dữ liệu, vượt slot, vượt sức chứa xe/phòng và các dữ liệu thiếu.
Phân quyền: CBNV chỉ xem dữ liệu của mình; Admin/BTC xem và quản lý theo quyền.
Responsive UI: ưu tiên trải nghiệm web và mobile để CBNV dễ tra cứu.
Bảo mật dữ liệu: sử dụng xác thực tài khoản công ty/SSO nếu hạ tầng hiện tại cho phép.
# 14. User Flow tổng thể
CBNV đăng nhập → Đăng ký Team Building → Xác nhận quy định → Chọn ca → Đăng ký nhu cầu xe → Nhập mong muốn → Submit → Nhận email xác nhận. Sau khi đóng đăng ký: BTC cấu hình chuyến bay/slot → Hệ thống auto allocate → BTC điều chỉnh → Phân phòng → Phân xe và Trưởng xe → Thiết lập Gala Dinner → Công bố thông tin. CBNV đăng nhập My Team Building Journey để xem toàn bộ hành trình.
# 15. MVP đề xuất
Ưu tiên phát triển trong Phase/MVP đầu tiên:
Đăng nhập/xác thực CBNV.
Form đăng ký Team Building và xác nhận quy định.
Quản lý Master Data Team/Bộ phận.
Đăng ký Ca 1/Ca 2.
Đăng ký nhu cầu xe.
Email xác nhận đăng ký.
Admin Dashboard.
Quản lý chuyến bay và slot.
Auto Flight Allocation.
Manual Adjustment + validation.
Quản lý và phân xe.
Chỉ định Trưởng xe.
My Team Building Journey.
Import/Export Excel/CSV.
Notification/Email cơ bản.
Các tính năng có thể đưa vào Phase 2: Auto Room Allocation nâng cao; Gala Dinner Seat Selection/Bốc thăm; Microsoft Teams notification; báo cáo nâng cao; tối ưu thuật toán phân bổ phức tạp.
# 16. Các điểm BTC cần chốt trước khi IT estimate

[TABLE]
| # | Câu hỏi cần thống nhất |
| 1 | Thứ tự ưu tiên khi phân chuyến: Team đi cùng nhau hay đáp ứng đúng ca cá nhân? |
| 2 | Ca 1/Ca 2 chỉ là nguyện vọng hay có đối tượng được ưu tiên bắt buộc? |
| 3 | Một Team quá lớn hoặc không đủ slot thì quy tắc tách Team là gì? |
| 4 | Có cần phân chuyến bay theo Team hoàn toàn hay chỉ 'cố gắng tối đa'? |
| 5 | Phân phòng tự động hay BTC import/phân thủ công? |
| 6 | Các quy tắc phân phòng: giới tính, Team, cấp bậc, yêu cầu đặc biệt...? |
| 7 | Gala Dinner: bốc thăm thứ tự chọn, random bàn hay Team tự chọn ghế? |
| 8 | Ai đại diện Team để thực hiện thao tác Gala Dinner? |
| 9 | CBNV được phép sửa đăng ký đến thời điểm nào? |
| 10 | Nguồn dữ liệu CBNV/Team lấy từ hệ thống nào? Có SSO/API hay import Excel? |
[/TABLE]

# 17. Kết luận – Yêu cầu tổng thể gửi IT
Đề nghị team IT đánh giá giải pháp và effort để xây dựng một hệ thống quản lý Team Building tập trung. Hệ thống cần hỗ trợ xuyên suốt hành trình từ đăng ký đến điều phối và công bố thông tin. CBNV chỉ cần truy cập một hệ thống để biết mình đã đăng ký gì, bay chuyến nào, đi xe nào, ở đâu, ngồi Gala Dinner ở đâu và lịch trình như thế nào; trong khi BTC có công cụ quản lý, phân bổ tự động, điều chỉnh ngoại lệ và cập nhật thông tin tập trung.
Đề nghị IT phản hồi thêm: (1) kiến trúc/giải pháp đề xuất; (2) các hệ thống nội bộ cần tích hợp; (3) khả năng Auto Allocation và phương án thuật toán; (4) effort theo từng module/phase; (5) timeline dự kiến; (6) các rủi ro, dependency và thông tin cần Business làm rõ.