-- =====================================================================
-- Quản lý công việc đa thương hiệu — Schema chính (Giai đoạn 1 + bảng
-- chuẩn bị cho Giai đoạn 2, 3).
-- Chạy trên PostgreSQL 15+ (PGlite nhúng). Múi giờ nghiệp vụ: Asia/Ho_Chi_Minh.
-- =====================================================================

-- ---------- Kiểu liệt kê ----------
create type public.user_role as enum ('admin', 'employee');

create type public.task_status as enum (
  'chua_bat_dau',   -- Chưa bắt đầu
  'dang_thuc_hien', -- Đang thực hiện
  'cho_phan_hoi',   -- Chờ phản hồi
  'cho_duyet',      -- Chờ duyệt
  'can_chinh_sua',  -- Cần chỉnh sửa
  'hoan_thanh',     -- Hoàn thành
  'tam_dung',       -- Tạm dừng
  'da_huy'          -- Đã hủy (loại khỏi mọi thống kê)
);

create type public.task_priority as enum ('thap', 'trung_binh', 'cao', 'khan_cap');

create type public.project_status as enum (
  'len_ke_hoach', 'dang_thuc_hien', 'tam_dung', 'hoan_thanh', 'da_huy'
);

create type public.review_decision as enum ('cho_duyet', 'da_duyet', 'yeu_cau_sua');

create type public.comment_kind as enum ('binh_luan', 'tien_do', 'vuong_mac');

create type public.notification_type as enum (
  'giao_viec', 'sap_den_han', 'qua_han', 'nop_duyet', 'yeu_cau_sua',
  'da_duyet', 'nhac_ten', 'khac'
);

-- ---------- Người dùng ----------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null unique,
  full_name        text not null check (length(trim(full_name)) > 0),
  role             public.user_role not null default 'employee',
  job_title        text,
  responsibilities text,
  phone            text,
  is_active        boolean not null default false,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.profiles is 'Hồ sơ nhân viên, 1-1 với auth.users. is_active=false thì không truy cập được dữ liệu.';

-- Lời mời: quản trị viên tạo trước, khi người được mời đăng ký đúng email
-- thì hồ sơ được kích hoạt với vai trò và thương hiệu đã chọn.
create table public.invitations (
  email       text primary key check (email = lower(trim(email)) and email like '%@%'),
  full_name   text not null,
  role        public.user_role not null default 'employee',
  job_title   text,
  brand_ids   uuid[] not null default '{}',
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

-- ---------- Thương hiệu ----------
create table public.brands (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  industry    text,
  description text,
  color       text not null,
  sort_order  int not null default 0,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.brand_members (
  brand_id   uuid not null references public.brands (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);
create index brand_members_user_idx on public.brand_members (user_id);

-- ---------- Dự án ----------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands (id) on delete restrict,
  name        text not null check (length(trim(name)) > 0),
  description text,
  goals       text,
  notes       text,
  owner_id    uuid references public.profiles (id) on delete set null,
  status      public.project_status not null default 'dang_thuc_hien',
  start_date  date,
  due_date    date,
  links       jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  is_demo     boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create index projects_brand_idx on public.projects (brand_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- ---------- Quy tắc lặp lại (Giai đoạn 2) ----------
create table public.recurring_task_rules (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete cascade,
  title           text not null,
  description     text,
  frequency       text not null check (frequency in ('daily', 'weekly', 'monthly')),
  weekdays        smallint[] not null default '{}', -- 1=Thứ 2 ... 7=Chủ nhật
  day_of_month    smallint check (day_of_month between 1 and 31),
  due_time        time not null default '23:59',
  assignee_ids    uuid[] not null default '{}',
  primary_owner_id uuid references public.profiles (id) on delete set null,
  priority        public.task_priority not null default 'trung_binh',
  weight          smallint not null default 1 check (weight in (1, 2, 3, 5)),
  estimated_hours numeric(6, 2) check (estimated_hours >= 0),
  requires_approval boolean not null default true,
  starts_on       date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  ends_on         date,
  is_active       boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

-- ---------- Công việc ----------
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references public.brands (id) on delete restrict,
  project_id         uuid references public.projects (id) on delete cascade,
  title              text not null check (length(trim(title)) > 0),
  description        text,
  primary_owner_id   uuid references public.profiles (id) on delete set null,
  created_by         uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  start_date         date,
  due_at             timestamptz,
  original_due_at    timestamptz,
  priority           public.task_priority not null default 'trung_binh',
  weight             smallint not null default 1 check (weight in (1, 2, 3, 5)),
  estimated_hours    numeric(6, 2) check (estimated_hours >= 0),
  status             public.task_status not null default 'chua_bat_dau',
  progress           smallint not null default 0 check (progress between 0 and 100),
  requires_approval  boolean not null default true,
  is_blocked         boolean not null default false,
  blocker_note       text,
  links              jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),
  completion_evidence text,
  first_submitted_at timestamptz,
  submitted_at       timestamptz, -- lần nộp gần nhất của nhân viên
  approved_at        timestamptz, -- thời điểm quản trị viên duyệt
  approved_by        uuid references public.profiles (id) on delete set null,
  completed_at       timestamptz, -- thời điểm hoàn thành TÍNH CHO NHÂN VIÊN (= lần nộp được duyệt)
  quality_score      smallint check (quality_score between 1 and 5),
  revision_count     int not null default 0 check (revision_count >= 0),
  recurring_rule_id  uuid references public.recurring_task_rules (id) on delete set null,
  recurrence_key     date,
  is_demo            boolean not null default false,
  unique (recurring_rule_id, recurrence_key)
);
create index tasks_brand_idx on public.tasks (brand_id);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_status_idx on public.tasks (status);
create index tasks_due_idx on public.tasks (due_at);
create index tasks_owner_idx on public.tasks (primary_owner_id);
create index tasks_completed_idx on public.tasks (completed_at);

create table public.task_assignments (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_assignments_user_idx on public.task_assignments (user_id);

create table public.subtasks (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date    date,
  is_done     boolean not null default false,
  done_at     timestamptz,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index subtasks_task_idx on public.subtasks (task_id);

create table public.checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  title      text not null check (length(trim(title)) > 0),
  is_done    boolean not null default false,
  done_at    timestamptz,
  sort_order int not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index checklist_items_task_idx on public.checklist_items (task_id);

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  kind       public.comment_kind not null default 'binh_luan',
  body       text not null check (length(trim(body)) > 0),
  mentions   uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  uploaded_by  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  is_evidence  boolean not null default false,
  created_at   timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = task_id::text)
);
create index task_attachments_task_idx on public.task_attachments (task_id);

-- Mỗi lần nhân viên nộp duyệt tạo 1 bản ghi; quản trị viên duyệt cập nhật bản ghi đó.
create table public.task_approvals (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  submitted_by  uuid references public.profiles (id) on delete set null,
  submitted_at  timestamptz not null default now(),
  evidence      text,
  decision      public.review_decision not null default 'cho_duyet',
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  quality_score smallint check (quality_score between 1 and 5),
  feedback      text
);
create index task_approvals_task_idx on public.task_approvals (task_id, submitted_at);
create unique index task_approvals_one_pending on public.task_approvals (task_id) where decision = 'cho_duyet';

-- Nhật ký thay đổi: chỉ được ghi bởi trigger, không ai sửa/xóa qua API.
create table public.activity_logs (
  id         bigint generated always as identity primary key,
  task_id    uuid references public.tasks (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  actor_id   uuid references public.profiles (id) on delete set null,
  actor_role public.user_role,
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_logs_task_idx on public.activity_logs (task_id, created_at);
create index activity_logs_project_idx on public.activity_logs (project_id, created_at);

-- ---------- Mục tiêu & KPI (Giai đoạn 3) ----------
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands (id) on delete cascade,
  name          text not null,
  description   text,
  goal_type     text not null default 'cong_viec' check (goal_type in ('cong_viec', 'ket_qua_kinh_doanh')),
  period_type   text not null check (period_type in ('thang', 'quy')),
  period_start  date not null,
  period_end    date not null check (period_end >= period_start),
  target_value  numeric not null check (target_value > 0),
  actual_value  numeric not null default 0,
  unit          text,
  is_demo       boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create table public.goal_members (
  goal_id uuid not null references public.goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (goal_id, user_id)
);
create table public.goal_tasks (
  goal_id uuid not null references public.goals (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  primary key (goal_id, task_id)
);

-- ---------- Lịch nội dung (Giai đoạn 3) ----------
create table public.content_items (
  id               uuid primary key default gen_random_uuid(),
  brand_id         uuid not null references public.brands (id) on delete cascade,
  task_id          uuid references public.tasks (id) on delete set null,
  platform         text not null check (platform in ('facebook', 'tiktok', 'website', 'khac')),
  topic            text not null,
  content_type     text,
  script_status    text not null default 'chua_bat_dau',
  filming_status   text not null default 'chua_bat_dau',
  editing_status   text not null default 'chua_bat_dau',
  approval_status  text not null default 'chua_bat_dau',
  publish_date     date,
  published_at     timestamptz,
  responsible_id   uuid references public.profiles (id) on delete set null,
  content_url      text,
  views            int,
  engagements      int,
  leads            int,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now()
);

-- ---------- Thông báo ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       public.notification_type not null,
  title      text not null,
  body       text,
  task_id    uuid references public.tasks (id) on delete cascade,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ---------- Cài đặt (trọng số KPI, nhắc hạn) ----------
create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- ---------- Dữ liệu thật: 4 thương hiệu ----------
insert into public.brands (slug, name, industry, description, color, sort_order) values
  ('th-ceramics', 'TH Ceramics', 'Gốm sứ kiến trúc và vật liệu xây dựng',
   'Phát triển sản phẩm, điều phối sản xuất, chụp ảnh, catalog, báo giá, bán hàng và marketing.', 'terracotta', 1),
  ('anam-tile', 'Anam Tile', 'Gạch mosaic nghệ thuật cao cấp',
   'Mạng xã hội, website & SEO, ảnh và video sản phẩm, phát triển bộ sưu tập, kể chuyện thương hiệu.', 'teal', 2),
  ('gom-vu-gia', 'Gốm Vũ Gia', 'Gốm tâm linh truyền thống, bộ đồ thờ, bình hút lộc',
   'TikTok, Facebook, livestream, kịch bản, quay dựng video, đào tạo kiến thức sản phẩm, hỗ trợ bán hàng.', 'deepblue', 3),
  ('klayy', 'Klayy', 'Gốm trang trí thủ công hiện đại',
   'Nhận diện thương hiệu, ý tưởng sản phẩm, bao bì, nội dung, ảnh/video, thương mại điện tử, mạng xã hội.', 'dustypink', 4);

insert into public.app_settings (key, value) values
  ('kpi_weights', '{"completion": 30, "on_time": 30, "weighted": 25, "quality": 15, "show_combined": false}'::jsonb),
  ('reminders', '{"days_before_due": 1}'::jsonb);
