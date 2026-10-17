# 6. Công thức và quy tắc tính chỉ số

Mã nguồn: `src/lib/metrics.ts` (có kiểm thử `src/lib/metrics.test.ts`). Mọi số liệu tính từ bản ghi thật trong CSDL, không có số cố định.

## Quy tắc chung

- **Việc đã hủy** bị loại khỏi mọi chỉ số.
- **Người liên quan** đến một việc = những người được giao + người phụ trách chính. Việc giao cho nhiều người được tính cho **mỗi** người.
- **Thời gian** theo giờ Việt Nam (GMT+7). Tuần bắt đầu Thứ Hai. Hạn chót chọn theo ngày = 23:59:59 ngày đó.
- **Thời điểm hoàn thành của nhân viên** (`completed_at`) = thời điểm nộp của lần được duyệt. Quản trị viên duyệt chậm **không** làm nhân viên bị tính trễ. Cả thời điểm nộp và thời điểm duyệt đều được lưu.
- **Quản lý dời hạn**: hạn hiện hành được dùng để tính; hạn gốc và người dời được lưu trong nhật ký để đối chiếu.
- **Việc không có hạn chót**: không tính vào các tỷ lệ đúng hạn/hoàn thành; được đếm riêng.
- Mặc định **không gộp** các chỉ số thành một điểm tổng.
- **Điểm tổng hợp (tùy chọn, GĐ 2)**: quản trị viên bật trong Cài đặt. Điểm = Σ(trọng số × chỉ số) ÷ Σ(trọng số của các chỉ số có dữ liệu), với A, B2, C tính theo %, D quy đổi `điểm/5 × 100`. Chỉ số chưa có dữ liệu (VD chưa việc nào được chấm) bị bỏ qua thay vì tính là 0. Trọng số mặc định 30/30/25/15, lưu ở `app_settings.kpi_weights`. Các chỉ số riêng luôn hiển thị bên cạnh.
- **Xu hướng theo tuần**: mỗi tuần (Thứ Hai–Chủ nhật) tính lại A, B2, C cho việc đến hạn trong tuần đó; tuần không có việc đến hạn để trống, không tính là 0%.

## Chỉ số nhân viên (theo khoảng thời gian chọn)

"**Việc đến hạn trong kỳ**" = việc của nhân viên có hạn chót nằm trong kỳ **và** (đã tới hạn tính đến hiện tại **hoặc** đã hoàn thành). Việc còn hạn không kéo tỷ lệ xuống; việc xong sớm vẫn được ghi nhận.

| Chỉ số | Công thức |
|---|---|
| A. Tỷ lệ hoàn thành | Việc đến hạn trong kỳ đã Hoàn thành (đã duyệt) ÷ Việc đến hạn trong kỳ |
| B1. Đúng hạn (trong số việc xong) | Việc xong có `completed_at ≤ due_at` ÷ Việc đến hạn đã xong |
| B2. Đúng hạn (trên mọi việc đến hạn) | Việc xong đúng hạn ÷ Việc đến hạn trong kỳ — để việc chưa làm không bị che |
| C. Khối lượng có trọng số | Tổng trọng số việc đến hạn đã xong ÷ Tổng trọng số việc đến hạn (trọng số: Đơn giản 1, Trung bình 2, Phức tạp 3, Lớn 5) |
| D. Chất lượng | Trung bình điểm 1–5 quản trị viên chấm ở các việc đến hạn đã duyệt có chấm điểm; hiển thị riêng, không trộn với năng suất |
| E. Số lần phải sửa | Tổng `revision_count` của việc đến hạn trong kỳ (mỗi lần "Yêu cầu chỉnh sửa" +1) |
| F. Quá hạn | Việc đang mở, đã qua hạn, **không** ở trạng thái Chờ duyệt (đã nộp, đang chờ quản lý) hoặc Tạm dừng (quyết định của quản lý). Số ngày trễ = số ngày (làm tròn lên) kể từ hạn |
| G. Khối lượng hiện tại | Số việc đang mở và tổng giờ ước tính. "Quá tải" nếu > 140% trung bình nhóm, "Còn trống" nếu < 60% |

## Thẻ tổng quan

| Thẻ | Cách tính |
|---|---|
| Việc đang mở | Trạng thái hiện tại không phải Hoàn thành / Đã hủy |
| Hoàn thành | Việc có `completed_at` trong kỳ |
| Đang thực hiện | Trạng thái hiện tại = Đang thực hiện |
| Quá hạn | Theo quy tắc F |
| Chờ duyệt | Trạng thái hiện tại = Chờ duyệt |
| Tỷ lệ đúng hạn | Trong các việc hoàn thành trong kỳ có hạn chót: tỷ lệ `completed_at ≤ due_at` |

## Tiến độ dự án / thương hiệu

Tiến độ có trọng số = Σ(trọng số × tiến độ hiệu lực) ÷ Σ trọng số, với tiến độ hiệu lực = 100% nếu Hoàn thành, còn lại = % nhân viên cập nhật (tối đa 99%). Thẻ thương hiệu hiển thị "Có việc trễ hạn" nếu có việc quá hạn, ngược lại "Đúng kế hoạch".

## Mục tiêu (Giai đoạn 3)

- **Thực tế**: nhập tay (`thu_cong`), hoặc tự tính từ việc liên kết: số việc đã **Hoàn thành (đã duyệt)** (`so_viec`) hay tổng trọng số của chúng (`trong_so`). Việc đã hủy bị bỏ qua; việc chờ duyệt chưa được tính.
- **% đạt** = thực tế ÷ chỉ tiêu × 100 (có thể vượt 100%).
- **% thời gian đã qua** = phần của kỳ (tháng/quý, giờ VN) đã trôi qua.
- **Đánh giá**: ≥ 100% → Đã đạt; kỳ chưa bắt đầu → Chưa tới kỳ; kỳ đã hết mà < 100% → Không đạt; còn lại "Đúng tiến độ" nếu % đạt + 10 ≥ % thời gian, ngược lại "Chậm tiến độ".
- Kết quả kinh doanh (doanh thu, khách, đơn hàng…) **không** trộn vào chỉ số hiệu suất nhân viên.

## Lịch nội dung (Giai đoạn 3)

- Một nội dung thuộc kỳ nếu **ngày đăng dự kiến** nằm trong kỳ.
- **Đã đăng** = có `published_at`. **Trễ lịch đăng** = chưa đăng và ngày đăng dự kiến đã qua. **Sẵn sàng** = các bước cần làm đều Xong (bước "Không cần" được bỏ qua) và đã duyệt.
- **% sản xuất** = (số bước cần làm đã xong + 1 nếu đã duyệt) ÷ (số bước cần làm + 1).
- Lượt xem, tương tác, khách tiềm năng chỉ cộng **bài đã đăng**. Tỷ lệ tương tác = tương tác ÷ lượt xem.

## Báo cáo

- Các chỉ số đội / thương hiệu dùng **đúng công thức A–C của nhân viên**, áp dụng cho nhóm việc (mỗi việc tính một lần, không nhân theo số người).
- Danh sách công việc xuất file = việc có hạn trong kỳ **hoặc** hoàn thành trong kỳ (bỏ việc hủy).
