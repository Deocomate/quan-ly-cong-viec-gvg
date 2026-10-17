-- Môi trường nền cho các migration: vai trò, lược đồ auth (tài khoản đăng nhập), storage (siêu dữ liệu tệp)
-- và app_private (phiên, mã đặt lại mật khẩu — vai trò ứng dụng không có quyền truy cập).
-- Chạy đúng một lần trên CSDL trống, trước mọi migration (xem server/db.mjs).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  password_hash text,
  created_at timestamptz not null default now()
);
-- Người dùng đã đăng nhập chỉ cần tra id / email; không bao giờ đọc được băm mật khẩu.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

create schema app_private;
create table app_private.sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
create index sessions_user_idx on app_private.sessions (user_id);
create table app_private.reset_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
create table app_private.secrets (name text primary key, value text not null);

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on storage.objects to authenticated, service_role;
grant select (id, email) on auth.users to authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
