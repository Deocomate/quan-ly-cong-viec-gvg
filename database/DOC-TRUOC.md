# Cơ sở dữ liệu

Cấu trúc CSDL (bảng, phân quyền RLS, hàm, trigger) nằm trong `server/migrations/` và được ứng dụng tự áp dụng khi khởi động — không cần chạy tay.

- `du-lieu-2026-10-16.json`: bản sao dữ liệu thật của dự án "Business Plan" (hệ thống cũ chạy trên Supabase) lúc 16/10/2026 (thương hiệu, nhân viên, lời mời, dự án, công việc, cài đặt...), mỗi bảng một mục.

Không có trong gói: mật khẩu và tài khoản đăng nhập (hệ thống cũ không xuất được), tệp đính kèm (lúc đó chưa có), và mọi khóa bí mật.

## Nhập lại dữ liệu

Tệp `du-lieu-*.json` nhập lại được bằng **Cài đặt → Sao lưu & khôi phục → Nhập** trong ứng dụng, hoặc `npm run db:import -- database/du-lieu-2026-10-16.json` (cần `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Tài khoản đăng nhập được tạo lại và đặt mật khẩu qua email. Xem `docs/07-trien-khai-coolify.md`.
