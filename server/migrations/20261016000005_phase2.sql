-- =====================================================================
-- Giai đoạn 2: việc lặp lại, nhắc hạn & cảnh báo quá hạn.
-- Các hàm đều idempotent (chạy lại nhiều lần không tạo trùng), nên có thể
-- gọi từ pg_cron và đồng thời từ ứng dụng khi người dùng mở trang.
-- =====================================================================

-- Chống trùng thông báo tự động
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_idx on public.notifications (dedupe_key) where dedupe_key is not null;

alter table public.recurring_task_rules add column if not exists last_generated_on date;
alter table public.recurring_task_rules add constraint recurring_weekdays_valid
  check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);
alter table public.recurring_task_rules add constraint recurring_weekly_needs_days
  check (frequency <> 'weekly' or cardinality(weekdays) > 0);
alter table public.recurring_task_rules add constraint recurring_monthly_needs_day
  check (frequency <> 'monthly' or day_of_month is not null);

create or replace function public.recurring_rules_check()
returns trigger language plpgsql as $$
declare v_brand uuid;
begin
  if new.project_id is not null then
    select brand_id into v_brand from public.projects where id = new.project_id;
    if v_brand is distinct from new.brand_id then
      raise exception 'Dự án không thuộc thương hiệu đã chọn' using errcode = '23514';
    end if;
  end if;
  if new.ends_on is not null and new.ends_on < new.starts_on then
    raise exception 'Ngày kết thúc phải sau ngày bắt đầu' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger recurring_rules_check before insert or update on public.recurring_task_rules
  for each row execute function public.recurring_rules_check();

-- Ngày d có khớp quy tắc không (1 = Thứ 2 … 7 = Chủ nhật)
create or replace function public.recurrence_matches(r public.recurring_task_rules, d date)
returns boolean language sql immutable as $$
  select case r.frequency
    when 'daily' then cardinality(r.weekdays) = 0 or extract(isodow from d)::smallint = any (r.weekdays)
    when 'weekly' then extract(isodow from d)::smallint = any (r.weekdays)
    when 'monthly' then extract(day from d) = least(r.day_of_month,
                          extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int)
    else false end;
$$;

-- Sinh các lần lặp từ hôm nay đến hôm nay + p_days (giờ VN). Không tạo trùng nhờ
-- unique (recurring_rule_id, recurrence_key).
create or replace function public.generate_recurring_tasks(p_days int default 7)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  r public.recurring_task_rules%rowtype;
  d date;
  v_id uuid;
  v_count int := 0;
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  p_days := least(greatest(coalesce(p_days, 7), 0), 31);
  for r in select * from public.recurring_task_rules where is_active loop
    for d in
      select gs::date from generate_series(greatest(r.starts_on, v_today),
                                           least(coalesce(r.ends_on, v_today + p_days), v_today + p_days),
                                           interval '1 day') gs
    loop
      continue when not public.recurrence_matches(r, d);
      insert into public.tasks (
        brand_id, project_id, title, description, primary_owner_id, created_by, start_date, due_at,
        priority, weight, estimated_hours, requires_approval, recurring_rule_id, recurrence_key
      ) values (
        r.brand_id, r.project_id, r.title, r.description,
        coalesce(r.primary_owner_id, r.assignee_ids[1]), r.created_by, d,
        (d + r.due_time) at time zone 'Asia/Ho_Chi_Minh',
        r.priority, r.weight, r.estimated_hours, r.requires_approval, r.id, d
      )
      on conflict (recurring_rule_id, recurrence_key) do nothing
      returning id into v_id;
      if v_id is not null then
        insert into public.task_assignments (task_id, user_id, assigned_by)
        select v_id, u, r.created_by from unnest(r.assignee_ids) u
        where exists (select 1 from public.profiles p where p.id = u and p.is_active)
        on conflict do nothing;
        v_count := v_count + 1;
        v_id := null;
      end if;
    end loop;
    update public.recurring_task_rules set last_generated_on = v_today where id = r.id;
  end loop;
  return v_count;
end $$;

-- Việc sinh tự động không gửi thông báo "giao việc mới" (tránh làm phiền); nhắc hạn sẽ báo.
create or replace function public.task_assignments_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_task from public.tasks where id = new.task_id;
    perform public.log_activity(new.task_id, v_task.project_id, 'giao_viec', jsonb_build_object('user_id', new.user_id));
    if v_task.recurring_rule_id is null then
      perform public.notify(new.user_id, 'giao_viec', 'Bạn được giao việc mới', v_task.title, new.task_id);
    end if;
    return new;
  else
    select * into v_task from public.tasks where id = old.task_id;
    if found then
      perform public.log_activity(old.task_id, v_task.project_id, 'bo_giao_viec', jsonb_build_object('user_id', old.user_id));
    end if;
    return old;
  end if;
end $$;

-- Nhắc sắp đến hạn + cảnh báo quá hạn. Mỗi (việc, người, hạn) chỉ báo 1 lần.
create or replace function public.send_due_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_days int := coalesce((select (value ->> 'days_before_due')::int from public.app_settings where key = 'reminders'), 1);
  v_count int := 0;
  v_n int;
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;

  -- Sắp đến hạn: báo người làm
  insert into public.notifications (user_id, type, title, body, task_id, dedupe_key)
  select p.uid, 'sap_den_han', 'Sắp đến hạn: ' || to_char(t.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'),
         t.title, t.id, 'sap_den_han:' || t.id || ':' || p.uid || ':' || t.due_at
  from public.tasks t
  cross join lateral (
    select a.user_id as uid from public.task_assignments a where a.task_id = t.id
    union select t.primary_owner_id where t.primary_owner_id is not null
  ) p
  join public.profiles pr on pr.id = p.uid and pr.is_active
  where t.status in ('chua_bat_dau', 'dang_thuc_hien', 'cho_phan_hoi', 'can_chinh_sua')
    and t.due_at > now() and t.due_at <= now() + make_interval(days => v_days)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;

  -- Quá hạn: báo người làm và quản trị viên
  insert into public.notifications (user_id, type, title, body, task_id, dedupe_key)
  select p.uid, 'qua_han', 'Công việc đã quá hạn', t.title, t.id, 'qua_han:' || t.id || ':' || p.uid || ':' || t.due_at
  from public.tasks t
  cross join lateral (
    select a.user_id as uid from public.task_assignments a where a.task_id = t.id
    union select t.primary_owner_id where t.primary_owner_id is not null
    union select pa.id from public.profiles pa where pa.role = 'admin' and pa.is_active
  ) p
  join public.profiles pr on pr.id = p.uid and pr.is_active
  where t.status in ('chua_bat_dau', 'dang_thuc_hien', 'cho_phan_hoi', 'can_chinh_sua')
    and t.due_at < now()
  on conflict do nothing;
  get diagnostics v_n = row_count; v_count := v_count + v_n;
  return v_count;
end $$;

-- Gói chạy định kỳ: gọi từ pg_cron, và ứng dụng gọi khi mở (dự phòng nếu chưa bật pg_cron)
create or replace function public.run_scheduled_jobs()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_gen int; v_rem int;
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'Không có quyền' using errcode = '42501';
  end if;
  v_gen := public.generate_recurring_tasks(7);
  v_rem := public.send_due_reminders();
  return jsonb_build_object('generated', v_gen, 'reminders', v_rem);
end $$;

revoke execute on function public.generate_recurring_tasks(int) from public, anon;
revoke execute on function public.send_due_reminders() from public, anon;
revoke execute on function public.run_scheduled_jobs() from public, anon;
grant execute on function public.generate_recurring_tasks(int) to authenticated, service_role;
grant execute on function public.send_due_reminders() to authenticated, service_role;
grant execute on function public.run_scheduled_jobs() to authenticated, service_role;

-- Lên lịch tự động nếu project đã bật pg_cron (Database → Extensions → pg_cron).
-- Mỗi giờ, phút thứ 5. Nếu chưa bật, ứng dụng vẫn tự gọi run_scheduled_jobs khi có người mở.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('quan-ly-cong-viec-hourly', '5 * * * *', 'select public.run_scheduled_jobs()');
  end if;
end $$;
