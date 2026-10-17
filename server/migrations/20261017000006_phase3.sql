-- =====================================================================
-- Giai đoạn 3: mục tiêu & KPI, lịch nội dung, email thông báo.
-- =====================================================================

-- ---------- Thông báo: đường dẫn + email ----------
alter table public.notifications add column if not exists link text;
alter table public.notifications add column if not exists emailed_at timestamptz;
create index if not exists notifications_email_queue_idx on public.notifications (created_at) where emailed_at is null;
alter table public.profiles add column if not exists email_notifications boolean not null default true;

-- Thông báo không gắn công việc (nội dung, mục tiêu) kèm đường dẫn trong ứng dụng
create or replace function public.notify_link(p_user uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, link)
  select p_user, 'khac', p_title, p_body, p_link
  where p_user is not null and p_user is distinct from auth.uid();
$$;
revoke execute on function public.notify_link(uuid, text, text, text) from public, anon, authenticated;

-- ---------- Mục tiêu & KPI ----------
-- metric: thu_cong = nhập kết quả thực tế; so_viec = số việc liên kết đã hoàn thành;
--         trong_so = tổng trọng số việc liên kết đã hoàn thành (tính ở ứng dụng từ goal_tasks).
alter table public.goals add column if not exists metric text not null default 'thu_cong'
  check (metric in ('thu_cong', 'so_viec', 'trong_so'));
alter table public.goals add column if not exists updated_at timestamptz not null default now();
alter table public.goals add constraint goals_business_is_manual
  check (goal_type = 'cong_viec' or metric = 'thu_cong');

create table public.goal_progress_logs (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.goals (id) on delete cascade,
  value       numeric not null,
  note        text,
  recorded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  recorded_at timestamptz not null default now()
);
create index goal_progress_logs_goal_idx on public.goal_progress_logs (goal_id, recorded_at);
alter table public.goal_progress_logs enable row level security;
create policy goal_logs_select on public.goal_progress_logs for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id
                 and (public.is_admin() or (public.is_active_user() and public.is_brand_member(g.brand_id)))));
revoke insert, update, delete on public.goal_progress_logs from anon, authenticated;
grant select on public.goal_progress_logs to authenticated;
grant all on public.goal_progress_logs to service_role;

-- Việc liên kết phải cùng thương hiệu với mục tiêu
create or replace function public.goal_tasks_check()
returns trigger language plpgsql as $$
begin
  if (select brand_id from public.tasks where id = new.task_id)
     is distinct from (select brand_id from public.goals where id = new.goal_id) then
    raise exception 'Công việc không thuộc thương hiệu của mục tiêu' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger goal_tasks_check before insert or update on public.goal_tasks
  for each row execute function public.goal_tasks_check();

create or replace function public.goals_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger goals_touch before update on public.goals for each row execute function public.goals_touch();

-- Ghi nhận kết quả thực tế: quản trị viên hoặc người được giao mục tiêu.
create or replace function public.record_goal_progress(p_goal uuid, p_value numeric, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.goals%rowtype;
begin
  select * into g from public.goals where id = p_goal;
  if not found then raise exception 'Không tìm thấy mục tiêu' using errcode = 'P0002'; end if;
  if not (public.is_admin() or (public.is_active_user()
          and exists (select 1 from public.goal_members m where m.goal_id = p_goal and m.user_id = auth.uid()))) then
    raise exception 'Chỉ quản trị viên hoặc người phụ trách mục tiêu được cập nhật kết quả' using errcode = '42501';
  end if;
  if g.metric <> 'thu_cong' then
    raise exception 'Mục tiêu này tự tính từ công việc liên kết, không nhập tay' using errcode = '22023';
  end if;
  if p_value is null or p_value < 0 then
    raise exception 'Kết quả phải là số không âm' using errcode = '22023';
  end if;
  update public.goals set actual_value = p_value where id = p_goal;
  insert into public.goal_progress_logs (goal_id, value, note) values (p_goal, p_value, nullif(trim(p_note), ''));
  if not public.is_admin() then
    insert into public.notifications (user_id, type, title, body, link)
    select p.id, 'khac', 'Cập nhật mục tiêu: ' || g.name,
           'Kết quả mới: ' || p_value || coalesce(' ' || g.unit, '') || ' / ' || g.target_value, '/muc-tieu'
    from public.profiles p where p.role = 'admin' and p.is_active and p.id <> auth.uid();
  end if;
end $$;
revoke execute on function public.record_goal_progress(uuid, numeric, text) from public, anon;
grant execute on function public.record_goal_progress(uuid, numeric, text) to authenticated;

-- ---------- Lịch nội dung ----------
alter table public.content_items drop constraint if exists content_items_platform_check;
alter table public.content_items add constraint content_items_platform_check
  check (platform in ('facebook', 'tiktok', 'instagram', 'youtube', 'website', 'shopee', 'zalo', 'khac'));
alter table public.content_items add constraint content_stage_values check (
  script_status in ('chua_bat_dau', 'dang_lam', 'xong', 'khong_can')
  and filming_status in ('chua_bat_dau', 'dang_lam', 'xong', 'khong_can')
  and editing_status in ('chua_bat_dau', 'dang_lam', 'xong', 'khong_can'));
alter table public.content_items add constraint content_approval_values
  check (approval_status in ('chua_bat_dau', 'cho_duyet', 'da_duyet', 'can_sua'));
alter table public.content_items add constraint content_metrics_non_negative
  check (coalesce(views, 0) >= 0 and coalesce(engagements, 0) >= 0 and coalesce(leads, 0) >= 0);
alter table public.content_items add column if not exists notes text;
alter table public.content_items add column if not exists approval_note text;
alter table public.content_items add column if not exists created_by uuid references public.profiles (id) on delete set null default auth.uid();
alter table public.content_items add column if not exists updated_at timestamptz not null default now();
create index if not exists content_items_brand_date_idx on public.content_items (brand_id, publish_date);

-- Người phụ trách nội dung được cập nhật tiến độ sản xuất, đường dẫn và số liệu
create policy content_responsible_update on public.content_items for update to authenticated
  using (public.is_active_user() and responsible_id = auth.uid() and public.is_brand_member(brand_id))
  with check (public.is_active_user() and responsible_id = auth.uid() and public.is_brand_member(brand_id));

create or replace function public.content_items_guard()
returns trigger language plpgsql as $$
declare
  v_allowed text[] := array['script_status', 'filming_status', 'editing_status', 'approval_status',
                            'content_url', 'views', 'engagements', 'leads', 'published_at', 'notes', 'updated_at'];
begin
  new.updated_at := now();
  if new.task_id is not null and (tg_op = 'INSERT' or new.task_id is distinct from old.task_id or new.brand_id is distinct from old.brand_id)
     and (select brand_id from public.tasks where id = new.task_id) is distinct from new.brand_id then
    raise exception 'Công việc liên kết không thuộc thương hiệu của nội dung' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and public.is_api_user_request() and not public.is_admin() then
    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception 'Bạn chỉ được cập nhật tiến độ sản xuất, đường dẫn, ghi chú và số liệu' using errcode = '42501';
    end if;
    if new.approval_status is distinct from old.approval_status
       and not (new.approval_status = 'cho_duyet' and old.approval_status in ('chua_bat_dau', 'can_sua')) then
      raise exception 'Nhân viên chỉ được gửi nội dung đi duyệt; quản lý mới duyệt hoặc yêu cầu sửa' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Thông báo chạy bằng quyền hệ thống (security definer) sau khi lưu
create or replace function public.content_items_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.approval_status is distinct from old.approval_status then
    if new.approval_status = 'cho_duyet' then
      perform public.notify_link(p.id, 'Nội dung chờ duyệt', new.topic, '/lich-noi-dung?id=' || new.id)
      from public.profiles p where p.role = 'admin' and p.is_active;
    elsif new.approval_status in ('da_duyet', 'can_sua') then
      perform public.notify_link(new.responsible_id,
        case new.approval_status when 'da_duyet' then 'Nội dung đã được duyệt' else 'Nội dung cần chỉnh sửa' end,
        new.topic || coalesce(': ' || new.approval_note, ''), '/lich-noi-dung?id=' || new.id);
    end if;
  end if;
  if tg_op = 'INSERT' or new.responsible_id is distinct from old.responsible_id then
    perform public.notify_link(new.responsible_id, 'Bạn phụ trách nội dung mới', new.topic, '/lich-noi-dung?id=' || new.id);
  end if;
  return null;
end $$;
create trigger content_items_notify after insert or update on public.content_items
  for each row execute function public.content_items_notify();
create trigger content_items_guard before insert or update on public.content_items
  for each row execute function public.content_items_guard();

-- ---------- Email ----------
-- Hàng đợi email do Edge Function `send-email-notifications` xử lý bằng service_role.
-- Trạng thái lần chạy gần nhất được ghi vào app_settings.key = 'email_status'.
create or replace function public.email_queue(p_limit int default 100)
returns table (id uuid, email text, full_name text, title text, body text, link text, task_id uuid, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id, p.email, p.full_name, n.title, n.body, n.link, n.task_id, n.created_at
  from public.notifications n join public.profiles p on p.id = n.user_id
  where n.emailed_at is null and p.is_active and p.email_notifications
    and n.created_at > now() - interval '2 days'
  order by n.created_at
  limit least(greatest(p_limit, 1), 500);
$$;
revoke execute on function public.email_queue(int) from public, anon, authenticated;
grant execute on function public.email_queue(int) to service_role;

-- ---------- Dữ liệu mẫu cho Giai đoạn 3 ----------
create or replace function public.seed_demo_phase3(p_employees uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_quarter date := date_trunc('quarter', v_today)::date;
  v_goal uuid;
  v_goals int := 0;
  v_content int;
  b record;
begin
  -- Mục tiêu công việc (tự tính từ việc liên kết) cho mỗi thương hiệu
  for b in select id, name, slug from public.brands loop
    insert into public.goals (brand_id, name, description, goal_type, metric, period_type, period_start, period_end, target_value, unit, is_demo)
    values (b.id, 'Hoàn thành việc tháng này — ' || b.name, 'Đếm việc liên kết đã được duyệt hoàn thành.',
            'cong_viec', 'so_viec', 'thang', v_month, (v_month + interval '1 month - 1 day')::date, 8, 'việc', true)
    returning id into v_goal;
    insert into public.goal_tasks (goal_id, task_id)
    select v_goal, t.id from public.tasks t where t.brand_id = b.id and t.is_demo and t.status <> 'da_huy'
    on conflict do nothing;
    v_goals := v_goals + 1;
  end loop;

  -- Mục tiêu kết quả kinh doanh (nhập tay) có lịch sử cập nhật
  insert into public.goals (brand_id, name, description, goal_type, metric, period_type, period_start, period_end, target_value, actual_value, unit, is_demo)
  select br.id, x.name, x.descr, 'ket_qua_kinh_doanh', 'thu_cong', x.ptype, x.pstart, x.pend, x.target, x.actual, x.unit, true
  from (values
    ('gom-vu-gia', 'Khách tiềm năng từ TikTok', 'Số khách để lại thông tin qua TikTok/Facebook.', 'thang', v_month, (v_month + interval '1 month - 1 day')::date, 120::numeric, 74::numeric, 'khách'),
    ('anam-tile', 'Doanh thu dự án quý', 'Doanh thu ký hợp đồng mới (triệu đồng).', 'quy', v_quarter, (v_quarter + interval '3 months - 1 day')::date, 1500::numeric, 620::numeric, 'triệu đồng'),
    ('klayy', 'Đơn hàng sàn TMĐT', 'Shopee + TikTok Shop.', 'thang', v_month, (v_month + interval '1 month - 1 day')::date, 300::numeric, 210::numeric, 'đơn'),
    ('th-ceramics', 'Báo giá gửi khách', 'Số báo giá công trình đã gửi.', 'thang', v_month, (v_month + interval '1 month - 1 day')::date, 40::numeric, 18::numeric, 'báo giá')
  ) as x(slug, name, descr, ptype, pstart, pend, target, actual, unit)
  join public.brands br on br.slug = x.slug;
  get diagnostics v_content = row_count;
  v_goals := v_goals + v_content;

  insert into public.goal_members (goal_id, user_id)
  select g.id, case br.slug when 'gom-vu-gia' then p_employees[1] when 'klayy' then p_employees[3]
                            when 'anam-tile' then p_employees[2] else p_employees[4] end
  from public.goals g join public.brands br on br.id = g.brand_id
  where g.is_demo and g.goal_type = 'ket_qua_kinh_doanh'
  on conflict do nothing;

  insert into public.goal_progress_logs (goal_id, value, note, recorded_by, recorded_at)
  select g.id, round(g.actual_value * s.f), s.note, gm.user_id, now() - s.ago
  from public.goals g
  join public.goal_members gm on gm.goal_id = g.id
  cross join (values (0.3, 'Tuần 1', interval '15 days'), (0.65, 'Tuần 2', interval '8 days'), (1.0, 'Tuần 3', interval '1 day')) as s(f, note, ago)
  where g.is_demo and g.goal_type = 'ket_qua_kinh_doanh';

  -- Lịch nội dung: 2 tuần qua + 2 tuần tới
  insert into public.content_items (brand_id, platform, topic, content_type, script_status, filming_status, editing_status,
                                    approval_status, publish_date, published_at, responsible_id, content_url, views, engagements, leads, is_demo, notes)
  select br.id, x.platform, x.topic, x.ctype, x.s1, x.s2, x.s3, x.appr, v_today + x.d,
         case when x.d < 0 and x.appr = 'da_duyet' then (v_today + x.d + time '19:00') at time zone 'Asia/Ho_Chi_Minh' end,
         p_employees[x.who], case when x.d < 0 and x.appr = 'da_duyet' then 'https://example.com/bai-mau-' || abs(x.d) end,
         x.views, x.eng, x.leads, true, x.note
  from (values
    ('gom-vu-gia', 'tiktok', 'Ý nghĩa bình hút lộc đặt phòng khách', 'Video ngắn', 'xong', 'xong', 'xong', 'da_duyet', -12, 1, 18400, 920, 14, null),
    ('gom-vu-gia', 'facebook', 'Cách bài trí bàn thờ gia tiên đúng chuẩn', 'Bài viết + ảnh', 'xong', 'khong_can', 'xong', 'da_duyet', -9, 2, 6200, 310, 6, null),
    ('gom-vu-gia', 'tiktok', 'Livestream giới thiệu bộ đồ thờ men lam', 'Livestream', 'xong', 'xong', 'khong_can', 'da_duyet', -5, 1, 9800, 640, 21, null),
    ('gom-vu-gia', 'tiktok', 'Phân biệt gốm Bát Tràng thật và hàng nhái', 'Video ngắn', 'xong', 'dang_lam', 'chua_bat_dau', 'chua_bat_dau', 2, 1, null, null, null, 'Quay tại xưởng sáng thứ 5'),
    ('gom-vu-gia', 'facebook', 'Khách hàng chia sẻ sau khi thỉnh bình hút lộc', 'Bài viết', 'dang_lam', 'khong_can', 'chua_bat_dau', 'chua_bat_dau', 6, 2, null, null, null, null),
    ('klayy', 'instagram', 'Bộ sưu tập bình hoa mùa thu', 'Ảnh carousel', 'xong', 'xong', 'xong', 'da_duyet', -10, 3, 4300, 520, 9, null),
    ('klayy', 'tiktok', 'Quy trình làm gốm thủ công tại xưởng Klayy', 'Video ngắn', 'xong', 'xong', 'xong', 'cho_duyet', 1, 1, null, null, null, 'Đã gửi bản dựng 2'),
    ('klayy', 'shopee', 'Ra mắt bộ cốc men rạn', 'Banner + mô tả', 'xong', 'xong', 'dang_lam', 'can_sua', 4, 3, null, null, null, null),
    ('anam-tile', 'website', 'Bài SEO: mosaic cho hồ bơi', 'Blog', 'xong', 'khong_can', 'khong_can', 'da_duyet', -7, 4, 1200, 35, 4, null),
    ('anam-tile', 'facebook', 'Công trình mosaic tại Đà Nẵng', 'Ảnh + câu chuyện', 'dang_lam', 'xong', 'chua_bat_dau', 'chua_bat_dau', 3, 2, null, null, null, null),
    ('th-ceramics', 'youtube', 'Giới thiệu nhà máy TH Ceramics', 'Video dài', 'xong', 'dang_lam', 'chua_bat_dau', 'chua_bat_dau', 9, 4, null, null, null, null),
    ('th-ceramics', 'facebook', 'Catalog gạch 2027 đã có bản in', 'Bài viết', 'xong', 'khong_can', 'xong', 'da_duyet', -3, 3, 2100, 88, 7, null)
  ) as x(slug, platform, topic, ctype, s1, s2, s3, appr, d, who, views, eng, leads, note)
  join public.brands br on br.slug = x.slug;
  get diagnostics v_content = row_count;

  -- Không gửi thông báo cho dữ liệu mẫu
  delete from public.notifications n using public.content_items c
  where c.is_demo and n.link = '/lich-noi-dung?id=' || c.id;

  return jsonb_build_object('goals', v_goals, 'content_items', v_content);
end $$;
revoke execute on function public.seed_demo_phase3(uuid[]) from public, anon, authenticated;
grant execute on function public.seed_demo_phase3(uuid[]) to service_role;
