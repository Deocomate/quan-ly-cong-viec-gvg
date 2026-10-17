# 2. Bố cục trang chính

Phong cách: tối giản, nền trung tính ấm (`#FAF8F5`), chữ Be Vietnam Pro, thẻ bo góc, màu chỉ dùng để mang ý nghĩa (trạng thái, ưu tiên, thương hiệu).

| Thương hiệu | Màu |
|---|---|
| TH Ceramics | Đất nung `#B0532C` |
| Anam Tile | Xanh ngọc `#1C7F79` |
| Gốm Vũ Gia | Xanh lam đậm `#24427F` |
| Klayy | Hồng phấn / be ấm `#B5707A` |

## Tổng quan (quản trị viên)

```
┌──────────────┬───────────────────────────────────────────────────────────────┐
│ Thanh bên    │ Tổng quan · Thứ Năm, 15 tháng 10, 2026                        │
│ + Tạo việc   │ [Hôm nay|Tuần này|Tháng này|Tùy chọn]   [Thương hiệu▾][NV▾]   │
│ Tổng quan    ├───────────────────────────────────────────────────────────────┤
│ Công việc…   │ [Việc mở][Hoàn thành][Đang làm][Quá hạn][Chờ duyệt][Đúng hạn%]│
│ Dự án        ├───────────────────────────────────────────────────────────────┤
│ …            │ [TH Ceramics 74%][Anam Tile 55%][Gốm Vũ Gia 57%][Klayy 64%]   │
│ Thương hiệu  │  thanh tiến độ · tổng / xong / quá hạn · "Đúng kế hoạch"      │
│ ● TH …       ├──────────────────────────────────┬────────────────────────────┤
│ ● Anam …     │ Biểu đồ việc hoàn thành theo ngày│ Cần chú ý:                 │
│              │                                  │ [Quá hạn|Vướng mắc|Chờ duyệt]│
│              │                                  │  danh sách + nút Duyệt     │
│ Người dùng ⇥ ├──────────────────────────────────┴────────────────────────────┤
│              │ Hiệu suất nhân viên: thẻ từng người với các thanh chỉ số riêng│
└──────────────┴───────────────────────────────────────────────────────────────┘
```

Ảnh chụp thật từ bản chạy thử: `docs/screenshots/01-tong-quan-admin.png`.

## Công việc của tôi (ưu tiên điện thoại)

Thẻ chỉ số cá nhân tháng này → các nhóm có thể thu gọn. Mỗi việc có **thanh cập nhật nhanh**: đổi trạng thái, chọn % tiến độ, "Ghi chú / vướng mắc", "Nộp duyệt" — không cần mở trang chi tiết. Ảnh: `docs/screenshots/06-cong-viec-cua-toi-mobile.png`.

## Chi tiết công việc

Cột trái: hướng dẫn, liên kết, checklist, việc con, bằng chứng hoàn thành, tệp đính kèm, tab Trao đổi / Lịch sử duyệt / Nhật ký thay đổi.
Cột phải: tiến độ, người phụ trách, người được giao, hạn chót (hiện hạn gốc nếu quản lý đã dời), độ ưu tiên, độ phức tạp, giờ ước tính, các mốc nộp / duyệt / hoàn thành (tính KPI) và điểm chất lượng.
Ảnh: `docs/screenshots/09-cong-viec-da-duyet.png`.

## Trên điện thoại / máy tính bảng

Thanh bên thu vào nút ☰, có biểu tượng chuông thông báo; lưới thẻ tự xuống dòng; hộp thoại trượt từ dưới lên.

## Trạng thái giao diện

Mỗi trang có trạng thái đang tải, lỗi (kèm "Thử lại"), trống (kèm hướng dẫn), và hỏi xác nhận trước khi xóa / hủy / khóa tài khoản. Ngày giờ hiển thị kiểu Việt Nam (`dd/mm/yyyy`, `HH:mm`) theo múi giờ Asia/Ho_Chi_Minh.
