-- =====================================================================
-- Hàm hỗ trợ, trigger bảo vệ dữ liệu, nhật ký hoạt động, thông báo,
-- và các RPC nghiệp vụ (nộp duyệt, duyệt, xóa dữ liệu mẫu).
-- =====================================================================

-- ---------- Hàm kiểm tra quyền (SECURITY DEFINER để tránh đệ quy RLS) ----------
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

create or replace function public.is_brand_member(p_brand uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.brand_members m where m.brand_id = p_brand and m.user_id = auth.uid());
$$;

-- Người được giao (hoặc người phụ trách chính) của công việc
create or replace function public.is_task_assignee(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.task_assignments a where a.task_id = p_task and a.user_id = auth.uid())
      or exists (select 1 from public.tasks t where t.id = p_task and t.primary_owner_id = auth.uid());
$$;

create or replace function public.can_view_project(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.is_active_user() and exists (
      select 1 from public.projects pr
      where pr.id = p_project and (
        public.is_brand_member(pr.brand_id)
        or pr.owner_id = auth.uid()
        or exists (select 1 from public.project_members pm where pm.project_id = pr.id and pm.user_id = auth.uid())
        or exists (
          select 1 from public.tasks t join public.task_assignments a on a.task_id = t.id
          where t.project_id = pr.id and a.user_id = auth.uid()
        )
      )
    )
  );
$$;

create or replace function public.can_view_task(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    public.is_active_user() and (
      public.is_task_assignee(p_task)
      or exists (select 1 from public.tasks t where t.id = p_task and public.is_brand_member(t.brand_id))
    )
  );
$$;

create or replace function public.can_work_on_task(p_task uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.is_active_user() and public.is_task_assignee(p_task));
$$;

-- Yêu cầu đến từ API của người dùng (không phải service_role / SQL editor / hàm SECURITY DEFINER)
create or replace function public.is_api_user_request()
returns boolean language sql stable as $$
  select current_user in ('authenticated', 'anon');
$$;

create or replace function public.current_role_of_actor()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

-- ---------- updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- ---------- Tạo hồ sơ khi có tài khoản mới ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invitations%rowtype;
  v_name text;
begin
  select * into v_inv from public.invitations where email = lower(new.email);
  v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), v_inv.full_name, split_part(new.email, '@', 1));

  insert into public.profiles (id, email, full_name, role, job_title, is_active, is_demo)
  values (
    new.id, lower(new.email), v_name,
    coalesce(v_inv.role, 'employee'),
    v_inv.job_title,
    v_inv.email is not null,                                   -- chỉ kích hoạt khi đã được mời
    coalesce((new.raw_user_meta_data ->> 'is_demo')::boolean, false)
  );

  if v_inv.email is not null then
    insert into public.brand_members (brand_id, user_id)
    select b, new.id from unnest(v_inv.brand_ids) as b
    where exists (select 1 from public.brands where id = b)
    on conflict do nothing;
    update public.invitations set accepted_at = now() where email = v_inv.email;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lời mời cho email đã có tài khoản (tự đăng ký trước đó): kích hoạt ngay
create or replace function public.invitations_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.profiles set role = new.role, job_title = coalesce(new.job_title, job_title),
         full_name = new.full_name, is_active = true
  where email = new.email returning id into v_id;
  if v_id is not null then
    insert into public.brand_members (brand_id, user_id)
    select b, v_id from unnest(new.brand_ids) as b
    where exists (select 1 from public.brands where id = b)
    on conflict do nothing;
    update public.invitations set accepted_at = now() where email = new.email;
  end if;
  return new;
end $$;

create trigger invitations_after_insert after insert on public.invitations
  for each row execute function public.invitations_after_insert();

-- ---------- Bảo vệ hồ sơ: nhân viên không tự đổi vai trò / trạng thái ----------
create or replace function public.profiles_guard()
returns trigger language plpgsql as $$
begin
  if not public.is_api_user_request() then
    return new;
  end if;
  if new.id <> old.id or new.email <> old.email or new.is_demo <> old.is_demo then
    raise exception 'Không được thay đổi định danh tài khoản' using errcode = '42501';
  end if;
  if not public.is_admin() then
    if new.role <> old.role or new.is_active <> old.is_active
       or coalesce(new.job_title, '') <> coalesce(old.job_title, '')
       or coalesce(new.responsibilities, '') <> coalesce(old.responsibilities, '') then
      raise exception 'Chỉ quản trị viên được đổi vai trò, chức danh, trách nhiệm hoặc trạng thái tài khoản' using errcode = '42501';
    end if;
  elsif old.id = auth.uid() and (new.role <> 'admin' or not new.is_active) then
    raise exception 'Bạn không thể tự gỡ quyền quản trị hoặc tự khóa tài khoản của mình' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- Ghi nhật ký ----------
create or replace function public.log_activity(p_task uuid, p_project uuid, p_action text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.activity_logs (task_id, project_id, actor_id, actor_role, action, details)
  values (p_task, p_project, auth.uid(), public.current_role_of_actor(), p_action, coalesce(p_details, '{}'::jsonb));
$$;
revoke execute on function public.log_activity(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.notify(p_user uuid, p_type public.notification_type, p_title text, p_body text, p_task uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, task_id)
  select p_user, p_type, p_title, p_body, p_task
  where p_user is not null and p_user is distinct from auth.uid();
$$;
revoke execute on function public.notify(uuid, public.notification_type, text, text, uuid) from public, anon, authenticated;

-- ---------- Công việc: kiểm tra trước khi thêm ----------
create or replace function public.tasks_before_insert()
returns trigger language plpgsql as $$
declare v_brand uuid;
begin
  if new.project_id is not null then
    select brand_id into v_brand from public.projects where id = new.project_id;
    if v_brand is distinct from new.brand_id then
      raise exception 'Dự án không thuộc thương hiệu đã chọn' using errcode = '23514';
    end if;
  end if;
  new.original_due_at := new.due_at;
  if new.status = 'hoan_thanh' then
    new.progress := 100;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end $$;

create trigger tasks_before_insert before insert on public.tasks
  for each row execute function public.tasks_before_insert();

-- ---------- Công việc: bảo vệ khi cập nhật ----------
-- Nhân viên chỉ được đổi: status (giới hạn), progress, is_blocked, blocker_note, completion_evidence.
-- Không được đổi hạn chót, độ ưu tiên, trọng số, điểm chất lượng, thông tin duyệt...
create or replace function public.tasks_before_update()
returns trigger language plpgsql as $$
declare
  v_allowed text[] := array['status', 'progress', 'is_blocked', 'blocker_note', 'completion_evidence', 'updated_at'];
  v_emp_status public.task_status[] := array['chua_bat_dau', 'dang_thuc_hien', 'cho_phan_hoi']::public.task_status[];
  v_brand uuid;
begin
  if public.is_api_user_request() and not public.is_admin() then
    if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
      raise exception 'Bạn chỉ được cập nhật trạng thái, tiến độ, vướng mắc và bằng chứng hoàn thành' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if not (old.status = any (v_emp_status || 'can_chinh_sua'::public.task_status)) or not (new.status = any (v_emp_status)) then
        raise exception 'Không thể chuyển trạng thái từ "%" sang "%". Dùng nút "Nộp duyệt" để gửi kết quả.', old.status, new.status
          using errcode = '42501';
      end if;
    end if;
    if old.status in ('cho_duyet', 'hoan_thanh', 'da_huy') and new.progress is distinct from old.progress then
      raise exception 'Công việc đã nộp hoặc đã đóng, không thể cập nhật tiến độ' using errcode = '42501';
    end if;
  end if;

  if new.project_id is distinct from old.project_id or new.brand_id is distinct from old.brand_id then
    if new.project_id is not null then
      select brand_id into v_brand from public.projects where id = new.project_id;
      if v_brand is distinct from new.brand_id then
        raise exception 'Dự án không thuộc thương hiệu đã chọn' using errcode = '23514';
      end if;
    end if;
  end if;

  if new.original_due_at is null and old.original_due_at is null and new.due_at is not null then
    new.original_due_at := new.due_at;
  end if;

  if new.status = 'hoan_thanh' and old.status <> 'hoan_thanh' then
    new.progress := 100;
    new.completed_at := coalesce(new.completed_at, now());
    if public.is_api_user_request() and public.is_admin() and new.requires_approval and new.approved_at is null then
      new.approved_at := now();
      new.approved_by := auth.uid();
    end if;
  elsif new.status <> 'hoan_thanh' and old.status = 'hoan_thanh' then
    -- mở lại công việc
    new.completed_at := null;
    new.approved_at := null;
    new.approved_by := null;
  end if;

  if new.is_blocked = false then
    new.blocker_note := null;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger tasks_before_update before update on public.tasks
  for each row execute function public.tasks_before_update();

-- ---------- Công việc: nhật ký thay đổi ----------
create or replace function public.tasks_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[] := array['title', 'description', 'priority', 'weight', 'estimated_hours', 'start_date',
                           'project_id', 'primary_owner_id', 'requires_approval'];
  v_f text;
  v_changes jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.id, new.project_id, 'tao_cong_viec', jsonb_build_object('title', new.title));
    return new;
  end if;

  if new.status is distinct from old.status then
    perform public.log_activity(new.id, new.project_id, 'doi_trang_thai',
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.due_at is distinct from old.due_at then
    perform public.log_activity(new.id, new.project_id, 'doi_han_chot',
      jsonb_build_object('from', old.due_at, 'to', new.due_at, 'original', new.original_due_at));
  end if;
  if new.progress is distinct from old.progress and new.status = old.status then
    perform public.log_activity(new.id, new.project_id, 'cap_nhat_tien_do',
      jsonb_build_object('from', old.progress, 'to', new.progress));
  end if;
  if new.is_blocked is distinct from old.is_blocked then
    perform public.log_activity(new.id, new.project_id,
      case when new.is_blocked then 'bao_vuong_mac' else 'go_vuong_mac' end,
      jsonb_build_object('note', new.blocker_note));
  end if;
  foreach v_f in array v_fields loop
    if (to_jsonb(new) -> v_f) is distinct from (to_jsonb(old) -> v_f) then
      v_changes := v_changes || jsonb_build_object(v_f, jsonb_build_object('from', to_jsonb(old) -> v_f, 'to', to_jsonb(new) -> v_f));
    end if;
  end loop;
  if v_changes <> '{}'::jsonb then
    perform public.log_activity(new.id, new.project_id, 'sua_thong_tin', v_changes);
  end if;
  return new;
end $$;

create trigger tasks_after_insert after insert on public.tasks
  for each row execute function public.tasks_after_change();
create trigger tasks_after_update after update on public.tasks
  for each row execute function public.tasks_after_change();

-- ---------- Giao việc: nhật ký + thông báo ----------
create or replace function public.task_assignments_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_task public.tasks%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_task from public.tasks where id = new.task_id;
    perform public.log_activity(new.task_id, v_task.project_id, 'giao_viec', jsonb_build_object('user_id', new.user_id));
    perform public.notify(new.user_id, 'giao_viec', 'Bạn được giao việc mới', v_task.title, new.task_id);
    return new;
  else
    select * into v_task from public.tasks where id = old.task_id;
    if found then
      perform public.log_activity(old.task_id, v_task.project_id, 'bo_giao_viec', jsonb_build_object('user_id', old.user_id));
    end if;
    return old;
  end if;
end $$;

create trigger task_assignments_after_insert after insert on public.task_assignments
  for each row execute function public.task_assignments_after_change();
create trigger task_assignments_after_delete after delete on public.task_assignments
  for each row execute function public.task_assignments_after_change();

-- ---------- Bình luận: nhật ký + thông báo nhắc tên ----------
create or replace function public.task_comments_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
  v_user uuid;
  v_author text;
begin
  select * into v_task from public.tasks where id = new.task_id;
  select full_name into v_author from public.profiles where id = new.author_id;
  perform public.log_activity(new.task_id, v_task.project_id,
    case new.kind when 'tien_do' then 'ghi_chu_tien_do' when 'vuong_mac' then 'bao_vuong_mac' else 'binh_luan' end,
    jsonb_build_object('comment_id', new.id));
  foreach v_user in array new.mentions loop
    if exists (select 1 from public.profiles where id = v_user and is_active) then
      perform public.notify(v_user, 'nhac_ten', v_author || ' đã nhắc đến bạn', v_task.title, new.task_id);
    end if;
  end loop;
  return new;
end $$;

create trigger task_comments_after_insert after insert on public.task_comments
  for each row execute function public.task_comments_after_insert();

create or replace function public.task_attachments_after_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  if tg_op = 'INSERT' then
    select project_id into v_project from public.tasks where id = new.task_id;
    perform public.log_activity(new.task_id, v_project, 'tai_tep', jsonb_build_object('file_name', new.file_name));
    return new;
  else
    select project_id into v_project from public.tasks where id = old.task_id;
    if found then
      perform public.log_activity(old.task_id, v_project, 'xoa_tep', jsonb_build_object('file_name', old.file_name));
    end if;
    return old;
  end if;
end $$;

create trigger task_attachments_after_insert after insert on public.task_attachments
  for each row execute function public.task_attachments_after_change();
create trigger task_attachments_after_delete after delete on public.task_attachments
  for each row execute function public.task_attachments_after_change();

-- ---------- Việc nhỏ & checklist: nhân viên chỉ được tích hoàn thành ----------
create or replace function public.subtask_items_guard()
returns trigger language plpgsql as $$
begin
  if public.is_api_user_request() and not public.is_admin() and tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['is_done', 'done_at']) is distinct from (to_jsonb(old) - array['is_done', 'done_at']) then
      raise exception 'Bạn chỉ được đánh dấu hoàn thành mục này' using errcode = '42501';
    end if;
  end if;
  if new.is_done and (tg_op = 'INSERT' or not old.is_done) then
    new.done_at := now();
  elsif not new.is_done then
    new.done_at := null;
  end if;
  return new;
end $$;

create trigger subtasks_guard before insert or update on public.subtasks
  for each row execute function public.subtask_items_guard();
create trigger checklist_items_guard before insert or update on public.checklist_items
  for each row execute function public.subtask_items_guard();

-- =====================================================================
-- RPC nghiệp vụ
-- =====================================================================

-- Nhân viên nộp kết quả để duyệt (hoặc hoàn thành ngay nếu việc không cần duyệt)
create or replace function public.submit_task(p_task uuid, p_evidence text default null)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
  v_admin uuid;
  v_name text;
begin
  if not public.can_work_on_task(p_task) then
    raise exception 'Bạn không được giao công việc này' using errcode = '42501';
  end if;
  select * into v_task from public.tasks where id = p_task for update;
  if v_task.status not in ('chua_bat_dau', 'dang_thuc_hien', 'cho_phan_hoi', 'can_chinh_sua') then
    raise exception 'Công việc đang ở trạng thái không thể nộp' using errcode = '22023';
  end if;

  if v_task.requires_approval then
    update public.tasks set
      status = 'cho_duyet', progress = 100, is_blocked = false,
      completion_evidence = coalesce(nullif(trim(p_evidence), ''), completion_evidence),
      submitted_at = now(), first_submitted_at = coalesce(first_submitted_at, now())
    where id = p_task returning * into v_task;
    insert into public.task_approvals (task_id, submitted_by, evidence)
    values (p_task, auth.uid(), nullif(trim(p_evidence), ''));
    select full_name into v_name from public.profiles where id = auth.uid();
    for v_admin in select id from public.profiles where role = 'admin' and is_active loop
      perform public.notify(v_admin, 'nop_duyet', coalesce(v_name, 'Nhân viên') || ' nộp việc chờ duyệt', v_task.title, p_task);
    end loop;
  else
    update public.tasks set
      status = 'hoan_thanh', progress = 100, is_blocked = false,
      completion_evidence = coalesce(nullif(trim(p_evidence), ''), completion_evidence),
      submitted_at = now(), first_submitted_at = coalesce(first_submitted_at, now()),
      completed_at = now()
    where id = p_task returning * into v_task;
  end if;
  return v_task;
end $$;

-- Quản trị viên duyệt hoặc yêu cầu chỉnh sửa
create or replace function public.review_task(
  p_task uuid, p_approve boolean, p_quality smallint default null, p_feedback text default null
)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare
  v_task public.tasks%rowtype;
  v_user uuid;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được duyệt công việc' using errcode = '42501';
  end if;
  if p_quality is not null and p_quality not between 1 and 5 then
    raise exception 'Điểm chất lượng phải từ 1 đến 5' using errcode = '22023';
  end if;
  if not p_approve and coalesce(trim(p_feedback), '') = '' then
    raise exception 'Vui lòng ghi rõ nội dung cần chỉnh sửa' using errcode = '22023';
  end if;
  select * into v_task from public.tasks where id = p_task for update;
  if not found or v_task.status <> 'cho_duyet' then
    raise exception 'Công việc không ở trạng thái chờ duyệt' using errcode = '22023';
  end if;

  update public.task_approvals set
    decision = case when p_approve then 'da_duyet' else 'yeu_cau_sua' end::public.review_decision,
    reviewed_by = auth.uid(), reviewed_at = now(),
    quality_score = case when p_approve then p_quality end,
    feedback = nullif(trim(p_feedback), '')
  where task_id = p_task and decision = 'cho_duyet';

  if p_approve then
    update public.tasks set
      status = 'hoan_thanh', approved_at = now(), approved_by = auth.uid(),
      completed_at = v_task.submitted_at,          -- tính theo thời điểm nhân viên nộp
      quality_score = p_quality
    where id = p_task returning * into v_task;
    perform public.log_activity(p_task, v_task.project_id, 'duyet',
      jsonb_build_object('quality_score', p_quality, 'feedback', nullif(trim(p_feedback), '')));
  else
    update public.tasks set status = 'can_chinh_sua', revision_count = revision_count + 1, progress = least(progress, 90)
    where id = p_task returning * into v_task;
    perform public.log_activity(p_task, v_task.project_id, 'yeu_cau_sua',
      jsonb_build_object('feedback', trim(p_feedback)));
  end if;

  if nullif(trim(p_feedback), '') is not null then
    insert into public.task_comments (task_id, author_id, kind, body)
    values (p_task, auth.uid(), 'binh_luan',
      case when p_approve then 'Đã duyệt: ' else 'Yêu cầu chỉnh sửa: ' end || trim(p_feedback));
  end if;

  for v_user in
    select user_id from public.task_assignments where task_id = p_task
    union select v_task.primary_owner_id
  loop
    perform public.notify(v_user,
      case when p_approve then 'da_duyet' else 'yeu_cau_sua' end::public.notification_type,
      case when p_approve then 'Công việc đã được duyệt' else 'Công việc cần chỉnh sửa' end,
      v_task.title, p_task);
  end loop;
  return v_task;
end $$;

-- Thay toàn bộ danh sách người được giao (chỉ quản trị viên)
create or replace function public.set_task_assignees(p_task uuid, p_users uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được giao việc' using errcode = '42501';
  end if;
  delete from public.task_assignments where task_id = p_task and not (user_id = any (coalesce(p_users, '{}')));
  insert into public.task_assignments (task_id, user_id, assigned_by)
  select p_task, u, auth.uid() from unnest(coalesce(p_users, '{}')) as u
  where exists (select 1 from public.profiles p where p.id = u and p.is_active)
  on conflict do nothing;
end $$;

-- Xóa toàn bộ dữ liệu mẫu (chỉ quản trị viên). Tài khoản mẫu bị vô hiệu hóa;
-- xóa hẳn tài khoản đăng nhập mẫu bằng script `npm run demo:remove`.
create or replace function public.purge_demo_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tasks int; v_projects int; v_users int; v_goals int; v_content int;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên được xóa dữ liệu mẫu' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_demo) then
    raise exception 'Hãy đăng nhập bằng tài khoản quản trị thật (không phải tài khoản mẫu) để xóa dữ liệu mẫu' using errcode = '42501';
  end if;
  delete from public.content_items where is_demo; get diagnostics v_content = row_count;
  delete from public.goals where is_demo; get diagnostics v_goals = row_count;
  delete from public.tasks where is_demo; get diagnostics v_tasks = row_count;
  delete from public.projects where is_demo; get diagnostics v_projects = row_count;
  delete from public.brand_members where user_id in (select id from public.profiles where is_demo);
  delete from public.notifications where user_id in (select id from public.profiles where is_demo);
  update public.profiles set is_active = false where is_demo and is_active;
  get diagnostics v_users = row_count;
  return jsonb_build_object('tasks', v_tasks, 'projects', v_projects, 'users_deactivated', v_users,
                            'goals', v_goals, 'content_items', v_content);
end $$;

-- Khởi tạo quản trị viên đầu tiên — dùng `node server/cli.mjs create-admin` hoặc biến ADMIN_EMAIL.
create or replace function public.bootstrap_admin(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.profiles set role = 'admin', is_active = true
  where email = lower(trim(p_email)) returning id into v_id;
  if v_id is null then
    raise exception 'Không tìm thấy tài khoản %, hãy đăng ký trong ứng dụng trước', p_email;
  end if;
  insert into public.brand_members (brand_id, user_id) select id, v_id from public.brands on conflict do nothing;
  return 'Đã đặt ' || p_email || ' làm quản trị viên';
end $$;

revoke execute on function public.bootstrap_admin(text) from public, anon, authenticated;
revoke execute on function public.purge_demo_data() from public, anon;
revoke execute on function public.submit_task(uuid, text) from public, anon;
revoke execute on function public.review_task(uuid, boolean, smallint, text) from public, anon;
revoke execute on function public.set_task_assignees(uuid, uuid[]) from public, anon;
grant execute on function public.purge_demo_data() to authenticated;
grant execute on function public.submit_task(uuid, text) to authenticated;
grant execute on function public.review_task(uuid, boolean, smallint, text) to authenticated;
grant execute on function public.set_task_assignees(uuid, uuid[]) to authenticated;
