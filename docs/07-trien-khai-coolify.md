# Triển khai bằng Docker / Coolify

Một container duy nhất (`Dockerfile`): máy chủ Node (`server/index.mjs`) phục vụ giao diện React, API, cơ sở dữ liệu PostgreSQL nhúng (PGlite) và việc chạy nền. **Không cần Supabase hay máy chủ CSDL riêng.** Mọi dữ liệu nằm trong thư mục `/data`:

| Đường dẫn | Nội dung |
|---|---|
| `/data/db` | CSDL PostgreSQL nhúng |
| `/data/files` | Tệp đính kèm công việc |
| `/data/backups` | Bản sao lưu tự động trước mỗi lần nhập dữ liệu (giữ 20 bản gần nhất) |

Cần khoảng 200–300 MB RAM cho tiến trình. Chỉ chạy **một** bản sao của ứng dụng: CSDL nhúng không cho hai tiến trình cùng ghi. Khi triển khai bản mới, bản mới tự chờ bản cũ nhả khóa `/data/server.lock` (tối đa 3 phút); khóa chỉ bị coi là bỏ rơi sau 2 phút không có nhịp tim, và một tiến trình phát hiện mình mất khóa sẽ dừng ngay để không có hai bên cùng ghi.

Khi nhận SIGTERM, máy chủ ngừng nhận yêu cầu mới, chờ các giao dịch đang chạy (nhập dữ liệu, việc định kỳ) hoàn tất rồi mới đóng CSDL — tối đa 25 giây. Hãy để thời gian chờ dừng container từ 30 giây trở lên (`docker-compose.yml` đã đặt `stop_grace_period: 30s`).

## 1. Tạo ứng dụng trên Coolify

1. **New Resource → Git repository**, *Build Pack*: **Dockerfile** (hoặc **Docker Compose** với `docker-compose.yml`). Cổng: `3000`. File Compose chỉ `expose` cổng 3000 trong mạng Docker, không gắn ra cổng của máy chủ, nên nhiều ứng dụng trên cùng máy không trùng cổng; Traefik của Coolify chuyển tên miền tới cổng này. Khi gán tên miền cho dịch vụ `app` ở bản Compose, ghi kèm cổng, ví dụ `https://quanly.ten-mien.vn:3000` (Coolify hiểu `:3000` là cổng bên trong container).
2. **Persistent Storage**: gắn một volume vào `/data`. **Bắt buộc** — không có volume thì mất dữ liệu mỗi lần triển khai. (Dùng Compose thì đã có volume `app-data`.)
3. **Domain**: gán tên miền, bật HTTPS. Đặt `APP_URL` đúng bằng địa chỉ đó (không có dấu `/` cuối).
4. **Environment Variables** (bảng dưới). Đánh dấu `ADMIN_PASSWORD`, `SMTP_PASS` là *secret*.
5. Health check: đường dẫn `/healthz`. Trong *Advanced* hãy **tắt Rolling Update** nếu có. Deploy.
6. Mở tên miền, đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Sau khi đăng nhập được có thể xóa hai biến này.

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `APP_URL` | có | địa chỉ công khai, dùng trong liên kết email |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | lần đầu | tạo quản trị viên đầu tiên khi CSDL chưa có quản trị viên (mật khẩu ≥ 8 ký tự); `ADMIN_NAME` tùy chọn |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | cho email | cổng 465 tự dùng TLS |
| `EMAIL_FROM` | cho email | ví dụ `Trung tâm điều hành <thongbao@ten-mien.vn>`; địa chỉ phải được SMTP cho phép gửi |
| `EMAIL_INTERVAL_MIN` | không | chu kỳ gửi thông báo, mặc định 10 phút |
| `RUN_SCHEDULED_JOBS` | không | `0` để tắt việc định kỳ hằng giờ (tạo việc lặp lại, nhắc hạn) |
| `TRUST_PROXY` | không | số proxy đứng trước ứng dụng, dùng để lấy đúng IP người dùng cho giới hạn đăng nhập. Mặc định `1` (Traefik của Coolify); đặt `2` nếu thêm Cloudflare proxy phía trước |
| `PORT`, `DATA_DIR` | không | mặc định `3000` và `/data` |

SMTP gợi ý: Resend (`smtp.resend.com`, user `resend`, mật khẩu là API key), Brevo, Zoho, Gmail (mật khẩu ứng dụng). Cần xác minh tên miền gửi (SPF/DKIM) để thư không vào spam.

## 2. Các luồng email

- **Quên mật khẩu**: `/quen-mat-khau` → máy chủ tạo mã dùng một lần (hiệu lực 1 giờ) → gửi liên kết `/dat-lai-mat-khau?token=…` → người dùng đặt mật khẩu mới và được đăng nhập luôn; mọi phiên cũ bị hủy. Phản hồi luôn như nhau dù email có tồn tại hay không; giới hạn 5 yêu cầu/15 phút cho mỗi email.
- **Lời mời nhân viên**: tạo lời mời xong, hệ thống gửi email có liên kết đăng ký chứa mã riêng của lời mời. Nút **Gửi lại email** / **Sao chép liên kết** ở danh sách lời mời đang chờ. Email đã được mời mà đăng ký không qua liên kết sẽ bị từ chối (tránh người lạ giành lấy quyền đã cấp).
- **Lời mời cho email đã có tài khoản**: tạo lời mời **không** tự kích hoạt tài khoản đó (có thể là người lạ đã đăng ký chặn trước bằng email của nhân viên). Chủ email mở liên kết trong thư mời, đăng nhập (hoặc dùng "Quên mật khẩu" để lấy lại quyền tài khoản) và lời mời được nhận tự động.
- **Thông báo**: giao việc, nhắc hạn, quá hạn, duyệt… gộp theo người, người dùng tự tắt ở Cài đặt; trạng thái lần chạy gần nhất hiển thị ở Cài đặt.
- **Khi chưa có SMTP**: quản trị viên mở **Nhân viên → Sửa → Tạo liên kết đặt lại mật khẩu** (hiệu lực 24 giờ) và gửi cho nhân viên; hoặc dùng dòng lệnh `set-password` (mục 4).

## 3. Sao lưu và khôi phục

Định dạng: một tệp JSON `{ "tên_bảng": [dòng, ...] }` — giống `database/du-lieu-*.json`. Không có mật khẩu và nội dung tệp đính kèm.

**Trong ứng dụng (quản trị viên): Cài đặt → Sao lưu & khôi phục.**
- *Tải bản sao lưu*: xuất toàn bộ dữ liệu ở một ảnh chụp nhất quán.
- *Nhập*: chọn tệp, chọn chế độ.
  - **Gộp**: thêm mới và cập nhật theo mã, dòng không có trong tệp giữ nguyên.
  - **Thay thế**: xóa dữ liệu ứng dụng hiện có rồi nạp lại đúng như tệp.
  - Trước mỗi lần nhập, máy chủ tự ghi một bản sao lưu vào `/data/backups`; không ghi được thì không nhập.
  - Toàn bộ chạy trong một giao dịch: lỗi thì hoàn tác hết. Việc nhập không sinh thông báo/nhật ký trùng.
  - Nhân viên trong tệp mà hệ thống chưa có tài khoản sẽ được **tạo lại** (mật khẩu ngẫu nhiên); tick "Gửi email đặt mật khẩu" để họ nhận thư, hoặc họ tự dùng "Quên mật khẩu". Tài khoản đã có (khớp email) và thương hiệu đã có (khớp `slug`) được nối vào, mọi tham chiếu id cũ tự đổi sang id mới.

Sao lưu cả hệ thống (kể cả tệp đính kèm): sao chép nguyên thư mục `/data` khi ứng dụng đang dừng, hoặc dùng tính năng backup volume của Coolify. Bản JSON không chứa tệp đính kèm; các dòng `task_attachments` vẫn được nhập nhưng tệp thật phải có trong `/data/files`.

## 4. Dòng lệnh quản trị

Chạy trong container (Coolify → Terminal) hoặc trên máy, **khi máy chủ đã dừng** (CSDL nhúng chỉ cho một tiến trình):

```bash
node server/cli.mjs export sao-luu.json
node server/cli.mjs import database/du-lieu-2026-10-16.json            # gộp
node server/cli.mjs import database/du-lieu-2026-10-16.json --replace --notify
node server/cli.mjs create-admin email@cua-ban.com 'mat-khau-moi' 'Họ tên'
node server/cli.mjs set-password email@cua-ban.com 'mat-khau-moi'
```

Khi máy chủ đang chạy, dùng trang Cài đặt cho việc xuất/nhập, và nút tạo liên kết đặt lại mật khẩu cho việc đổi mật khẩu.

Quy trình dựng lại từ bản cũ: triển khai ứng dụng → đăng nhập quản trị → Cài đặt → Nhập tệp `database/du-lieu-2026-10-16.json` (chế độ Gộp) → mọi người đặt mật khẩu qua email.

## 5. Kiểm tra sau triển khai

1. `https://<tên-miền>/healthz` trả `{"ok":true}`; `/api/status` cho biết email đã bật chưa.
2. Đăng nhập quản trị; thẻ email ở Cài đặt ghi nhận lần chạy sau tối đa `EMAIL_INTERVAL_MIN` phút.
3. Thử "Quên mật khẩu" với email của bạn; thử xuất rồi nhập lại (chế độ Gộp).
4. Khởi động lại container và kiểm tra dữ liệu còn nguyên (xác nhận volume `/data` hoạt động).

## 6. Nâng cấp

Triển khai bản mới: các migration trong `server/migrations/` chưa chạy sẽ được áp dụng tự động khi khởi động (bảng theo dõi `app_private.migrations`). Hãy tải một bản sao lưu JSON trước khi nâng cấp.
