# Tối giản giao diện, ưu tiên điện thoại

**Trạng thái:** đã xong (chờ người dùng thử trên thiết bị thật) · **Nhánh:** main

## Mục tiêu

Người dùng phàn nàn: app phức tạp, luồng không rõ, khó dùng trên điện thoại. Cần giao diện tối giản và theo chuẩn mobile.

## Quyết định đã chốt với người dùng

- Gộp điều hướng: thanh dưới 4–5 mục; các trang ít dùng vào "Thêm". **Không xóa tính năng.**
- Làm cả luồng nhân viên và quản trị viên.
- Biến app thành PWA (manifest, standalone, safe-area), không làm offline.
- Lập kế hoạch rồi làm luôn.

## Ngoài phạm vi

Không đổi CSDL, API, phân quyền hay công thức KPI. Không thêm service worker/offline.

## Giai đoạn

1. **Nền tảng mobile**: ô nhập 16px (tránh iOS phóng to), vùng chạm ≥ 44px, safe-area, hộp thoại dùng `dvh`, manifest + icon PWA, thẻ meta iOS.
2. **Khung điều hướng** (`AppLayout`): thanh điều hướng dưới (Tổng quan/Việc của tôi · Tạo · Thông báo · Thêm); "Thêm" là bottom sheet chứa các trang còn lại + thương hiệu + đăng xuất; sidebar desktop chia nhóm; ẩn thanh dưới ở trang chi tiết việc để nhường chỗ cho nút hành động chính.
3. **Luồng nhân viên**: "Công việc của tôi" thành 3 tab (Cần làm / Chờ duyệt / Đã xong), chỉ số tháng gom thành 1 dòng, mỗi việc chỉ còn 1 nút chính (Bắt đầu / Nộp duyệt) + nút "⋯" mở sheet cập nhật nhanh. Trang chi tiết: tiến độ & hạn chót lên đầu, thông tin phụ thu gọn, nút chính cố định đáy màn hình, các thao tác phụ vào menu "⋯".
4. **Luồng quản trị**: Tổng quan đưa "Cần chú ý" (duyệt/quá hạn/vướng mắc) lên trước, thẻ chỉ số gọn hơn; form tạo việc chỉ hiện trường thiết yếu, phần còn lại trong "Thêm chi tiết"; bộ lọc danh sách việc thu gọn trên điện thoại.
5. **Kiểm chứng & tài liệu**: typecheck, lint, test, build, e2e (cập nhật bước bị đổi giao diện), chụp ảnh mobile; cập nhật `docs/01`, `docs/02`.

## Tiêu chí nghiệm thu

- Ở 390px: màn hình đầu "Công việc của tôi" thấy được việc cần làm (không bị thẻ chỉ số chiếm hết).
- Mọi trang chính đến được trong ≤ 2 chạm từ thanh dưới.
- Không ô nhập nào < 16px trên mobile; nút chính ≥ 44px.
- Cài được lên màn hình chính (manifest hợp lệ, `display: standalone`).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` đều qua; e2e qua sau khi cập nhật bộ chọn.

## Rủi ro

e2e dựa vào nhãn/nút; giữ nguyên tên nút quan trọng ("Nộp duyệt", "Duyệt / Yêu cầu sửa", "Tạo công việc", nhãn "Tiến độ") và chỉ sửa e2e ở chỗ form tạo việc có phần thu gọn.

## Bổ sung: "không đăng nhập được trên mobile"

- Thử đăng nhập trên WebKit (iPhone 13, iPhone SE) và Chromium (Pixel 7), kể cả email viết hoa chữ đầu, thừa dấu cách, tải lại trang: đều đạt. Chưa tái hiện được lỗi.
- Đã sửa: giới hạn tần suất chỉ đếm lần đăng nhập **sai** (trước đây mọi lần đăng nhập, kể cả đúng, đều tính vào hạn mức 60 lần/giờ/IP dùng chung với quên mật khẩu — người chung Wi-Fi văn phòng hoặc mạng di động có thể chặn nhau).
- Xác nhận 21/10: người dùng báo buổi sáng đăng nhập bằng điện thoại bị "Bạn thao tác quá nhanh" (mã 429). Nguyên nhân khớp với bản đang chạy: cả lần đăng nhập đúng cũng bị đếm vào hạn mức 60 lần/giờ/IP, nên khi nhiều người đăng nhập đầu giờ qua cùng một IP thì cả nhóm bị chặn tới một giờ.
- Đã sửa: ô email tắt tự viết hoa / tự sửa; ô mật khẩu có nút hiện ký tự.
- Giới hạn còn lại: trình duyệt cần iOS 15.4+ / Chrome 99+.
