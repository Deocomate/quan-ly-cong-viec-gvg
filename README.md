# Trung tâm điều hành — Quản lý dự án & hiệu suất cho 4 thương hiệu

Ứng dụng web quản lý công việc, dự án, quy trình duyệt và hiệu suất nhân viên cho **TH Ceramics, Anam Tile, Gốm Vũ Gia, Klayy**. Giao diện tiếng Việt, múi giờ Asia/Ho_Chi_Minh, dùng tốt trên máy tính, máy tính bảng và điện thoại.

**Công nghệ:** React 19 + TypeScript, Vite, Tailwind CSS 4, TanStack Query, Recharts. Máy chủ Node 24 tự chứa: PostgreSQL nhúng (PGlite, lưu trong một thư mục), đăng nhập riêng, phân quyền bằng Row Level Security, email qua SMTP. **Không cần Supabase hay bất kỳ dịch vụ ngoài nào** — chỉ một container và một thư mục dữ liệu.

> **Trạng thái:** cả 3 giai đoạn đã hoàn thành và được kiểm thử (Vitest gồm cả kịch bản phân quyền trên CSDL thật, Playwright 36 bước nghiệp vụ trên máy chủ thật). Chưa gửi email thật vì cần tài khoản SMTP của bạn. Triển khai Docker/Coolify: [docs/07-trien-khai-coolify.md](docs/07-trien-khai-coolify.md).

Tài liệu thiết kế: [docs/](docs/) — kiến trúc thông tin, bố cục, CSDL, phân quyền, kế hoạch, công thức KPI, triển khai.

---

## 1. Chạy thử trên máy

Cần Node.js 24 trở lên.

```bash
npm install
cp .env.example .env     # điền ADMIN_EMAIL và ADMIN_PASSWORD (ít nhất 8 ký tự)
npm run dev:api          # máy chủ + CSDL nhúng ở cổng 3000, dữ liệu trong ./.data
npm run dev              # giao diện ở http://localhost:5173 (tự chuyển /api sang cổng 3000)
```

Đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD` — tài khoản này được tạo tự động ở lần chạy đầu tiên nếu CSDL chưa có quản trị viên. (Dòng lệnh khi đã dừng máy chủ: `node server/cli.mjs create-admin <email> <mật khẩu>`.)

Mời nhân viên: **Nhân viên → Mời nhân viên**. Hệ thống gửi email mời (nếu đã cấu hình SMTP) kèm liên kết đăng ký có mã riêng; cũng có thể sao chép liên kết gửi qua Zalo. Người đăng ký đúng email được mời qua liên kết đó sẽ tự được kích hoạt với vai trò và thương hiệu đã chọn. Người tự đăng ký không có lời mời ở trạng thái chưa kích hoạt và không thấy dữ liệu nào.

## 2. Dữ liệu mẫu (tùy chọn)

Dừng máy chủ rồi chạy:

```bash
npm run demo:seed     # 1 quản trị viên mẫu + 4 nhân viên mẫu (mật khẩu Demo@12345 hoặc DEMO_PASSWORD), 9 dự án, 34 công việc, mục tiêu, lịch nội dung
npm run demo:remove   # xóa dữ liệu mẫu và tài khoản mẫu
```

Mọi bản ghi mẫu có nhãn **"Mẫu"**. Cũng xóa được trong ứng dụng: **Cài đặt → Xóa toàn bộ dữ liệu mẫu**.

## 3. Kiểm thử

| Lệnh | Kiểm tra |
|---|---|
| `npm test` | Công thức KPI, mục tiêu, lịch nội dung, CSV, email, bộ dịch truy vấn, và kịch bản phân quyền / quy trình duyệt chạy trên PostgreSQL nhúng thật |
| `npm run typecheck` / `npm run lint` / `npm run build` | TypeScript, lint, bản dựng |
| `npm run e2e` | Dựng giao diện, tạo CSDL tạm có dữ liệu mẫu, chạy máy chủ thật và Playwright qua 36 bước nghiệp vụ (kể cả tải Excel/CSV, tạo PDF); ảnh lưu ở `e2e/screenshots/` (cần Chromium; đặt `CHROMIUM_PATH` nếu cần) |

## 4. Email (tùy chọn)

Đặt `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `APP_URL` để máy chủ gửi: **đặt lại mật khẩu**, **lời mời nhân viên**, **thông báo** (giao việc, nhắc hạn, quá hạn, duyệt… gộp 1 email/người mỗi `EMAIL_INTERVAL_MIN` phút, người dùng tự tắt trong Cài đặt). Chưa cấu hình SMTP thì ứng dụng vẫn chạy: quản trị viên tạo liên kết đặt lại mật khẩu cho nhân viên ngay trong hộp thoại **Sửa** nhân viên, và gửi liên kết mời bằng tay. Chi tiết: [docs/07-trien-khai-coolify.md](docs/07-trien-khai-coolify.md).

## 5. Triển khai Docker / Coolify

`Dockerfile` và `docker-compose.yml` ở thư mục gốc. Một container, một volume `/data` (CSDL + tệp đính kèm + bản sao lưu). Hướng dẫn từng bước và bảng biến môi trường: [docs/07-trien-khai-coolify.md](docs/07-trien-khai-coolify.md).

## 6. Sao lưu và khôi phục

**Cài đặt → Sao lưu & khôi phục** (quản trị viên): tải bản sao lưu `.json`, hoặc nhập lại một tệp đã xuất trước đó (gộp hoặc thay thế). Có cả dòng lệnh khi đã dừng máy chủ: `npm run db:export -- tệp.json`, `npm run db:import -- tệp.json [--replace] [--notify]`. Tệp mẫu ở [database/](database/). Nhân viên chưa có tài khoản được tạo lại và nhận email đặt mật khẩu.

## Cấu trúc thư mục

```
src/
  lib/            kết nối máy chủ (backend.ts), kiểu dữ liệu, hằng số, ngày giờ VN, công thức KPI (+ test)
  hooks/          truy vấn dữ liệu (TanStack Query)
  contexts/       đăng nhập / hồ sơ
  components/     bố cục, UI dùng chung, form công việc/dự án, hộp thoại nộp & duyệt
  pages/          Tổng quan, Công việc của tôi, Chi tiết việc, Dự án, Thương hiệu, Nhân viên, Hiệu suất, Lịch công việc,
                  Việc lặp lại, Lịch nội dung, Mục tiêu & KPI, Báo cáo, Tổng kết tháng, Thông báo, Cài đặt, Đăng nhập
server/
  index.mjs       máy chủ HTTP: giao diện tĩnh + API
  db.mjs          CSDL nhúng (PGlite) + áp dụng migration
  migrations/     schema, hàm/trigger, RLS, dữ liệu mẫu, việc lặp lại, mục tiêu, email, mã lời mời
  bootstrap.sql   vai trò, bảng tài khoản, phiên (chạy một lần trên CSDL trống)
  auth.mjs        đăng ký / đăng nhập / phiên / đặt lại mật khẩu
  query.mjs       dịch truy vấn từ giao diện sang SQL, chạy dưới quyền người dùng
  files.mjs       tệp đính kèm trên đĩa
  backup.mjs, restore.mjs, cli.mjs     xuất / nhập dữ liệu, dòng lệnh quản trị
  worker.mjs, email-digest.ts, mailer.mjs, mail-templates.mjs     việc nền và email
  tests/          kịch bản SQL kiểm thử phân quyền
e2e/              kịch bản Playwright
docs/             tài liệu thiết kế
database/         bản sao dữ liệu thật (JSON) để nhập lại
```
