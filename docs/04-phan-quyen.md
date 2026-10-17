# 4. Phân quyền

Quyền được kiểm soát **tại cơ sở dữ liệu** bằng Row Level Security (RLS), trigger và hàm RPC — ẩn nút trên giao diện chỉ để gọn mắt, không phải lớp bảo vệ. Máy chủ chạy mọi truy vấn của người dùng dưới vai trò CSDL `authenticated` với danh tính của họ, nên ngay cả khi gọi thẳng API, nhân viên cũng không vượt được các giới hạn dưới đây (đã kiểm thử trong `server/tests/10_rls_workflow_test.sql`). Máy chủ chỉ cho phép một danh sách bảng và hàm cố định, và vai trò này không đọc được bảng tài khoản / phiên.

## Vai trò

| Vai trò | Cách có |
|---|---|
| Quản trị viên (chủ doanh nghiệp) | Tài khoản đầu tiên: chạy `select public.bootstrap_admin('email')` trong SQL Editor. Sau đó có thể mời thêm quản trị viên. |
| Nhân viên | Quản trị viên tạo lời mời → người được mời đăng ký đúng email ở `/dang-ky` |
| Tài khoản chưa kích hoạt | Ai tự đăng ký mà không được mời, hoặc bị khóa: **không đọc được bất kỳ dữ liệu nào** |

## Ma trận quyền

| Hành động | Quản trị viên | Nhân viên |
|---|---|---|
| Xem thương hiệu, danh bạ nhân viên | ✅ | ✅ |
| Xem dự án | Tất cả | Dự án của thương hiệu mình thuộc, hoặc mình phụ trách / tham gia / có việc |
| Xem công việc | Tất cả | Việc thuộc thương hiệu mình + việc được giao |
| Tạo / sửa / xóa thương hiệu, dự án, công việc, việc con | ✅ | ❌ |
| Giao việc, đổi người phụ trách | ✅ | ❌ |
| Đổi hạn chót, ưu tiên, trọng số, giờ ước tính, yêu cầu duyệt | ✅ (được ghi nhật ký kèm hạn gốc) | ❌ |
| Đổi trạng thái | Mọi trạng thái | Chỉ giữa Chưa bắt đầu / Đang thực hiện / Chờ phản hồi (và từ Cần chỉnh sửa); việc được giao |
| Cập nhật tiến độ, báo vướng mắc, ghi bằng chứng | ✅ | Việc được giao, khi chưa nộp |
| Nộp duyệt (`submit_task`) | ✅ | Việc được giao |
| Duyệt / yêu cầu sửa, chấm điểm chất lượng (`review_task`) | ✅ | ❌ |
| Tích checklist / việc con | ✅ | Việc được giao (chỉ cột hoàn thành) |
| Thêm checklist | ✅ | Việc được giao; xóa mục do mình tạo |
| Bình luận, nhắc tên | ✅ | Việc mình xem được |
| Tải tệp lên | ✅ | Việc được giao; xóa tệp của mình |
| Xem lịch sử duyệt | ✅ | Việc được giao |
| Xem nhật ký thay đổi | ✅ | Việc mình xem được |
| Ghi / sửa / xóa nhật ký, bản ghi duyệt | ❌ (chỉ hệ thống) | ❌ |
| Thông báo | Của mình (chỉ đổi "đã đọc") | Của mình (chỉ đổi "đã đọc") |
| Mời, sửa, khóa nhân viên; gán thương hiệu | ✅ (không tự khóa / tự gỡ quyền) | ❌ |
| Sửa hồ sơ bản thân | ✅ | Chỉ họ tên, số điện thoại |
| Xóa dữ liệu mẫu | ✅ (tài khoản thật) | ❌ |
| Mục tiêu: tạo / sửa / xóa, liên kết việc | ✅ | ❌ (chỉ xem mục tiêu thuộc thương hiệu mình) |
| Mục tiêu: cập nhật kết quả nhập tay (`record_goal_progress`) | ✅ | Mục tiêu mình phụ trách |
| Lịch nội dung: tạo / sửa mọi trường / xóa / duyệt | ✅ | ❌ (chỉ xem nội dung thuộc thương hiệu mình) |
| Lịch nội dung: cập nhật kịch bản/quay/dựng, đường dẫn, số liệu, ghi chú, đánh dấu đã đăng, gửi duyệt | ✅ | Nội dung mình phụ trách |
| Báo cáo, xuất Excel/CSV | ✅ | ❌ (chỉ bản tổng kết tháng của chính mình) |
| Hàng đợi email | ❌ (chỉ tiến trình nền của máy chủ) | ❌ |

## Những điều nhân viên **không thể** làm (đã kiểm thử)

- Tự đổi hạn chót, trọng số, điểm chất lượng, hoặc tự đánh dấu "Hoàn thành" / "Chờ duyệt" mà không qua nút Nộp duyệt.
- Tự ghi bản ghi duyệt, ghi hoặc xóa nhật ký.
- Sửa việc của người khác dù cùng thương hiệu.
- Tải tệp vào việc không được giao.
- Tự nâng quyền, tự kích hoạt tài khoản, tự đổi chức danh.
- Tự duyệt nội dung, đổi chủ đề/ngày đăng/người phụ trách nội dung, sửa nội dung của người khác.
- Tạo mục tiêu, cập nhật mục tiêu không phụ trách, nhập tay mục tiêu tự tính, ghi thẳng lịch sử mục tiêu.
- Tự tạo thông báo cho người khác, đọc hàng đợi email.

## Khóa bí mật

- Frontend chỉ dùng **anon / publishable key** (an toàn khi lộ vì đã có RLS).
- Mật khẩu băm bằng scrypt; phiên là mã ngẫu nhiên chỉ lưu dạng băm SHA-256, hiệu lực 30 ngày, bị hủy khi đổi/đặt lại mật khẩu. Đăng nhập, đăng ký, quên mật khẩu có giới hạn tần suất.
- Lời mời mang mã bí mật: đăng ký bằng email đã được mời phải đi qua liên kết mời; tài khoản đã tồn tại chỉ được kích hoạt khi chủ tài khoản đăng nhập và gửi đúng mã (`accept_invitation`), không bao giờ tự kích hoạt khi quản trị viên tạo lời mời.
- Tệp đính kèm: mỗi đường dẫn chỉ có một bản ghi, tải lên trùng đường dẫn bị từ chối (không ghi đè tệp của người khác).
- Giới hạn tần suất dựa trên IP do proxy tin cậy cung cấp (`TRUST_PROXY`), không tin phần `X-Forwarded-For` người dùng tự gửi.
- `ADMIN_PASSWORD`, `SMTP_PASS` chỉ đặt trong biến môi trường của Coolify, không nằm trong mã nguồn.
