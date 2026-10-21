# 1. Kiến trúc thông tin

## Đối tượng chính và quan hệ

```
Thương hiệu (4)  ──<  Dự án / chiến dịch  ──<  Công việc  ──<  Việc con, Checklist
      │                                         │
      └── Thành viên thương hiệu (nhân viên)    ├── Người được giao (nhiều) + Người phụ trách chính
                                                ├── Bình luận · Ghi chú tiến độ · Vướng mắc
                                                ├── Tệp đính kèm · Bằng chứng hoàn thành
                                                ├── Lịch sử nộp/duyệt (mỗi lần nộp 1 bản ghi)
                                                └── Nhật ký thay đổi (tự động, không sửa được)
```

Một nhân viên có thể thuộc nhiều thương hiệu. Một công việc luôn thuộc một thương hiệu, có thể thuộc hoặc không thuộc dự án.

## Điều hướng

**Máy tính:** thanh bên trái chia 3 nhóm — việc hằng ngày (Tổng quan, Công việc của tôi, Lịch công việc, Dự án, Thông báo), **Quản lý** (Lịch nội dung, Mục tiêu & KPI, Nhân viên, Báo cáo, Việc lặp lại) và **Thương hiệu**; Cài đặt và Đăng xuất ở chân thanh bên.

**Điện thoại / máy tính bảng (< 1024px):** thanh điều hướng dưới. Quản trị viên: Tổng quan · Việc của tôi · nút **+** tạo việc · Thông báo · Thêm. Nhân viên: Việc của tôi · Lịch · Thông báo · Thêm. "Thêm" mở bảng trượt chứa các trang còn lại, 4 thương hiệu, Cài đặt và Đăng xuất. Trang chi tiết công việc ẩn thanh dưới, thay bằng thanh hành động chính.

| Mục | Ai thấy | Nội dung | Trạng thái |
|---|---|---|---|
| Tổng quan | Quản trị viên | Thẻ tổng hợp, tiến độ 4 thương hiệu, biểu đồ hoàn thành theo ngày, bảng "cần chú ý" (quá hạn / vướng mắc / chờ duyệt), hiệu suất nhân viên. Bộ lọc: hôm nay, tuần, tháng, tùy chọn, thương hiệu, nhân viên | GĐ 1 ✅ |
| Công việc của tôi | Mọi người | Quá hạn · Việc hôm nay · Cần chỉnh sửa · Sắp đến hạn · Đang thực hiện · Chưa đến lượt · Chờ duyệt · Đã hoàn thành; thanh cập nhật nhanh; chỉ số cá nhân tháng này | GĐ 1 ✅ |
| Dự án | Mọi người (theo quyền) | Thẻ dự án theo thương hiệu, tiến độ có trọng số; chi tiết dự án với danh sách việc, lọc, thêm nhanh | GĐ 1 ✅; Kanban, Lịch, Timeline: GĐ 2 ✅ |
| Lịch công việc | Mọi người | Lịch theo hạn chót, Kanban kéo-thả, Gantt, lọc thương hiệu/người | GĐ 2 ✅ |
| Việc lặp lại | Quản trị viên | Quy tắc hằng ngày / theo thứ / hằng tháng, tạm dừng, tạo ngay | GĐ 2 ✅ |
| Hiệu suất nhân viên `/nhan-vien/:id` | Quản trị viên; nhân viên chỉ trang của mình | Chỉ số A–G, xu hướng 8 tuần, khối lượng theo thương hiệu | GĐ 2 ✅ |
| Lịch nội dung `/lich-noi-dung` | Mọi người (thấy thương hiệu mình phụ trách) | Lịch tháng / danh sách theo màu thương hiệu; kịch bản → quay → dựng → duyệt → đăng; lượt xem, tương tác, khách tiềm năng; tạo công việc từ nội dung | GĐ 3 ✅ |
| Mục tiêu & KPI `/muc-tieu` | Mọi người (thương hiệu mình phụ trách) | Mục tiêu tháng/quý: chỉ tiêu, thực tế, % đạt, so với thời gian đã qua; tách mục tiêu công việc và kết quả kinh doanh; lịch sử cập nhật | GĐ 3 ✅ |
| Nhân viên | Mọi người (quản trị viên sửa được) | Danh sách, vai trò, thương hiệu, khối lượng việc; mời, sửa, khóa tài khoản | GĐ 1 ✅; biểu đồ phân bổ khối lượng: GĐ 2 ✅ |
| Báo cáo `/bao-cao` | Quản trị viên | Báo cáo ngày/tuần/tháng/tùy chọn, xu hướng 8 tuần, theo thương hiệu / nhân viên / nội dung / mục tiêu; xuất Excel (6 trang tính), CSV, In / Lưu PDF | GĐ 3 ✅ |
| Tổng kết tháng `/bao-cao/nhan-vien/:id?thang=YYYY-MM` | Quản trị viên; nhân viên chỉ của mình | Bản in A4 tổng kết tháng từng nhân viên | GĐ 3 ✅ |
| Thông báo | Mọi người | Giao việc, nộp duyệt, yêu cầu sửa, đã duyệt, nhắc tên | GĐ 1 ✅; nhắc hạn: GĐ 2 ✅; email: GĐ 3 ✅ (cần cài dịch vụ gửi thư) |
| Cài đặt | Mọi người | Thông tin cá nhân, đổi mật khẩu; quản trị viên: xóa dữ liệu mẫu | GĐ 1 ✅ |
| Thương hiệu (4 mục) | Mọi người | Không gian riêng từng thương hiệu: chỉ số, dự án, công việc, đội ngũ | GĐ 1 ✅ |

Cả 3 giai đoạn đã làm xong; không còn mục gắn nhãn "sắp có".

## Đường dẫn (URL)

| URL | Trang |
|---|---|
| `/` | Tổng quan (nhân viên được chuyển sang `/cong-viec-cua-toi`) |
| `/cong-viec-cua-toi` | Công việc của tôi |
| `/cong-viec/:id` | Chi tiết công việc |
| `/du-an`, `/du-an/:id` | Danh sách / chi tiết dự án |
| `/thuong-hieu/:slug` | `th-ceramics`, `anam-tile`, `gom-vu-gia`, `klayy` |
| `/nhan-vien`, `/thong-bao`, `/cai-dat` | Nhân viên, Thông báo, Cài đặt |
| `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/dat-lai-mat-khau` | Xác thực |

## Quy trình công việc

```
Quản trị viên tạo việc → giao 1 hoặc nhiều người (+ người phụ trách chính)
  → Nhân viên: Chưa bắt đầu → Đang thực hiện ⇄ Chờ phản hồi  (cập nhật tiến độ, checklist, ghi chú, báo vướng mắc)
  → Nhân viên bấm "Nộp duyệt" (ghi thời điểm nộp + bằng chứng)        → Chờ duyệt
  → Quản trị viên: Duyệt (chấm 1–5 tùy chọn)                          → Hoàn thành
                   hoặc Yêu cầu chỉnh sửa (bắt buộc ghi lý do)        → Cần chỉnh sửa → nhân viên sửa và nộp lại
Việc đánh dấu "không cần duyệt": nộp là Hoàn thành ngay.
Quản trị viên có thể Tạm dừng, Hủy (loại khỏi thống kê) hoặc mở lại việc bất kỳ lúc nào.
```
