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

Một dòng chỉ số tháng này (bấm để xem trang hiệu suất) → lọc thương hiệu dạng chip → 3 tab **Cần làm / Chờ duyệt / Đã xong**. Tab Cần làm chia nhóm theo mức gấp: Quá hạn, Cần chỉnh sửa, Hạn hôm nay, Sắp đến hạn, Đang thực hiện, Chưa đến lượt (thu gọn). Mỗi việc chỉ có **một nút chính** (Bắt đầu hoặc Nộp duyệt) và nút **⋯** mở bảng cập nhật nhanh: chọn % tiến độ, đổi trạng thái, ghi chú tiến độ, báo vướng mắc — không cần mở trang chi tiết. Ảnh: `docs/screenshots/06-cong-viec-cua-toi-mobile.png`.

## Chi tiết công việc

Cột trái: hướng dẫn, liên kết, checklist, việc con, bằng chứng hoàn thành, tệp đính kèm, tab Trao đổi / Lịch sử duyệt / Nhật ký thay đổi.
Trên điện thoại tiến độ, hạn chót, người được giao hiện đầu trang; các thông tin còn lại gói trong "Thông tin thêm". Nút chính (Nộp duyệt / Duyệt / Bắt đầu) cố định ở đáy màn hình; Đổi trạng thái, Báo vướng mắc, Sửa, Xóa nằm trong menu ⋯.
Cột phải (máy tính): tiến độ, người phụ trách, người được giao, hạn chót (hiện hạn gốc nếu quản lý đã dời), độ ưu tiên, độ phức tạp, giờ ước tính, các mốc nộp / duyệt / hoàn thành (tính KPI) và điểm chất lượng.
Ảnh: `docs/screenshots/09-cong-viec-da-duyet.png`.

## Trên điện thoại / máy tính bảng

Thanh điều hướng dưới (xem [01](01-kien-truc-thong-tin.md#điều-hướng)); hộp thoại trượt từ dưới lên, nút bấm và ô nhập cao ≥ 44px, chữ trong ô nhập 16px để iOS không tự phóng to; chừa vùng an toàn tai thỏ / thanh home. Tổng quan quản trị đưa "Cần chú ý" lên trước biểu đồ; form tạo việc chỉ hiện trường thiết yếu, phần còn lại trong "Thêm chi tiết"; bộ lọc danh sách việc thu vào nút lọc.

**Cài như ứng dụng (PWA):** có `public/manifest.webmanifest` và icon trong `public/`; trên điện thoại chọn "Thêm vào màn hình chính" để mở toàn màn hình. Không có chế độ ngoại tuyến.

**Trình duyệt hỗ trợ:** Safari / iOS 15.4+ và Chrome / Android Chrome 99+ (bản dựng dùng CSS `@layer` và `Object.hasOwn`); hiển thị đầy đủ màu từ Safari 16.2+.

## Trạng thái giao diện

Mỗi trang có trạng thái đang tải, lỗi (kèm "Thử lại"), trống (kèm hướng dẫn), và hỏi xác nhận trước khi xóa / hủy / khóa tài khoản. Ngày giờ hiển thị kiểu Việt Nam (`dd/mm/yyyy`, `HH:mm`) theo múi giờ Asia/Ho_Chi_Minh.
