-- Lời mời mang mã bí mật: chỉ người nhận được thư / liên kết mời mới đăng ký được bằng email đã mời,
-- tránh việc người lạ biết email rồi giành lấy quyền được cấp trong lời mời.
alter table public.invitations add column if not exists token text not null default replace(gen_random_uuid()::text, '-', '');
