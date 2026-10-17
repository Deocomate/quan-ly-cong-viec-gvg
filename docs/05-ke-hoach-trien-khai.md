# 5. Kế hoạch triển khai chức năng

Trạng thái tính đến 15/10/2026. ✅ = đã làm và đã kiểm thử; 🔜 = chưa làm (được gắn nhãn trong ứng dụng).

## Giai đoạn 1 — Hệ điều hành cốt lõi ✅

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| Đăng nhập, đăng ký theo lời mời, quên / đặt lại / đổi mật khẩu | ✅ | E2E: đăng nhập, đăng ký được mời, người lạ bị chặn |
| 4 không gian thương hiệu + điều hướng | ✅ | E2E |
| Quản lý nhân viên: mời, sửa chức danh/trách nhiệm/vai trò, gán thương hiệu, khóa | ✅ | E2E + SQL |
| Dự án: tạo / sửa / xóa, mục tiêu, ghi chú, liên kết, tiến độ có trọng số | ✅ | E2E |
| Công việc: tạo đầy đủ / thêm nhanh, giao nhiều người, ưu tiên, hạn, trọng số, giờ, checklist, việc con, liên kết | ✅ | E2E |
| Cập nhật trạng thái / tiến độ / ghi chú / vướng mắc; tệp đính kèm; bình luận + nhắc tên | ✅ | E2E + SQL |
| Quy trình duyệt: nộp → duyệt (điểm 1–5) / yêu cầu sửa → nộp lại; việc không cần duyệt | ✅ | E2E + SQL |
| Nhật ký thay đổi, lịch sử duyệt, phân biệt quản lý dời hạn | ✅ | SQL |
| Tổng quan quản trị với bộ lọc thời gian / thương hiệu / nhân viên | ✅ | Unit test công thức |
| Công việc của tôi (di động) | ✅ | E2E |
| Thông báo trong ứng dụng (giao việc, nộp, sửa, duyệt, nhắc tên) | ✅ | E2E + SQL |
| Dữ liệu mẫu có nhãn + xóa an toàn | ✅ | E2E + SQL |

## Giai đoạn 2 — Năng suất ✅

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| **Việc lặp lại**: quy tắc hằng ngày (có thể bỏ bớt thứ), theo thứ trong tuần (VD 3 video/tuần), hằng tháng (ngày 31 → ngày cuối tháng); tạm dừng / sửa / xóa (giữ việc đã tạo) | ✅ | SQL (idempotent, 8 lần/8 ngày) + E2E |
| Tự sinh việc cho 7 ngày tới: tiến trình nền của máy chủ mỗi giờ **và** mỗi lần có người mở ứng dụng (dự phòng). Ràng buộc unique chống tạo trùng | ✅ | SQL + E2E (bấm "Tạo ngay" lần 2 không tạo thêm) |
| **Kanban kéo-thả** (`@dnd-kit`): quản trị chuyển mọi cột; nhân viên chỉ được chuyển cột hợp lệ, kéo vào "Chờ duyệt" mở hộp nộp kết quả. Quyền vẫn do trigger CSDL quyết định | ✅ | E2E |
| **Lịch tháng** (kéo việc sang ngày khác để dời hạn — chỉ quản trị, được ghi nhật ký), **Timeline/Gantt**; có ở trang Lịch công việc (lọc thương hiệu / người) và trong từng dự án | ✅ | E2E |
| **Trang hiệu suất từng nhân viên** `/nhan-vien/:id`: chỉ số A–G theo kỳ, xu hướng 8 tuần, khối lượng theo thương hiệu, việc quá hạn. Nhân viên chỉ xem được trang của mình | ✅ | Unit + E2E |
| **Trọng số KPI** chỉnh được trong Cài đặt; điểm tổng hợp **mặc định tắt**, chỉ là tham khảo | ✅ | Unit + E2E |
| **Nhắc sắp đến hạn** (số ngày chỉnh trong Cài đặt) và **cảnh báo quá hạn** (người làm + quản trị) trong ứng dụng, mỗi việc chỉ báo 1 lần cho mỗi hạn | ✅ | SQL |
| **Biểu đồ phân bổ khối lượng** (giờ ước tính việc đang mở theo thương hiệu, đánh dấu quá tải / còn trống) | ✅ | E2E |

## Giai đoạn 3 — Quản trị nâng cao ✅

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| **Mục tiêu & KPI** tháng/quý theo thương hiệu: chỉ tiêu, thực tế, % đạt, so với % thời gian đã qua (Đã đạt / Đúng tiến độ / Chậm / Không đạt) | ✅ | Unit + E2E |
| Tách **mục tiêu công việc** (tự tính số việc / trọng số việc liên kết đã duyệt, hoặc nhập tay) và **kết quả kinh doanh** (nhập tay, có lịch sử + biểu đồ) | ✅ | SQL + E2E |
| Nhân viên phụ trách tự cập nhật kết quả; quản trị viên nhận thông báo | ✅ | SQL + E2E |
| **Lịch nội dung**: lịch tháng / danh sách theo màu thương hiệu, lọc thương hiệu/kênh/người; kịch bản → quay → dựng → duyệt → đăng; số liệu xem/tương tác/khách; trễ lịch đăng | ✅ | Unit + SQL + E2E |
| Gửi duyệt / duyệt / yêu cầu sửa nội dung có thông báo; tạo công việc từ nội dung | ✅ | SQL + E2E |
| **Báo cáo** ngày/tuần/tháng/tùy chọn: xu hướng 8 tuần, theo thương hiệu, nhân viên, nội dung, mục tiêu | ✅ | E2E |
| **Xuất Excel** (6 trang tính), **CSV** (UTF-8 có BOM, mở đúng tiếng Việt trong Excel), **In / Lưu PDF** qua hộp thoại in của trình duyệt | ✅ | Unit + E2E (kiểm tra file tải về, tạo PDF thật) |
| **Bản in tổng kết tháng** từng nhân viên (A4) | ✅ | E2E |
| **Email thông báo**: tiến trình nền của máy chủ ứng dụng (SMTP), gộp 1 email/người/lần chạy, người dùng tự bật/tắt, Cài đặt hiển thị trạng thái thật | ⚠️ Mã đã viết và kiểm thử logic; **chưa gửi thật** vì cần tài khoản SMTP + tên miền gửi thư | Unit (gộp, thoát HTML, đánh dấu chỉ khi gửi được) + SQL (quyền hàng đợi) |

## Cách làm mỗi giai đoạn

Mỗi giai đoạn: thêm migration mới (không sửa migration cũ đã chạy), cập nhật kiểm thử SQL + E2E, chạy `npm run db:test`, `npm test`, `npm run build`, `npm run e2e` trước khi bàn giao.
