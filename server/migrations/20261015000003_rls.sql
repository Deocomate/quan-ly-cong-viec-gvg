-- =====================================================================
-- Row Level Security: quyền được kiểm soát tại CSDL, không chỉ ở giao diện.
-- =====================================================================

alter table public.profiles             enable row level security;
alter table public.invitations          enable row level security;
alter table public.brands               enable row level security;
alter table public.brand_members        enable row level security;
alter table public.projects             enable row level security;
alter table public.project_members      enable row level security;
alter table public.recurring_task_rules enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_assignments     enable row level security;
alter table public.subtasks             enable row level security;
alter table public.checklist_items      enable row level security;
alter table public.task_comments        enable row level security;
alter table public.task_attachments     enable row level security;
alter table public.task_approvals       enable row level security;
alter table public.activity_logs        enable row level security;
alter table public.goals                enable row level security;
alter table public.goal_members         enable row level security;
alter table public.goal_tasks           enable row level security;
alter table public.content_items        enable row level security;
alter table public.notifications        enable row level security;
alter table public.app_settings         enable row level security;

-- ---------- profiles ----------
-- Mọi tài khoản đang hoạt động thấy danh bạ (để hiển thị người được giao); người dùng luôn thấy hồ sơ mình.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- ---------- invitations ----------
create policy invitations_admin on public.invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- brands ----------
create policy brands_select on public.brands for select to authenticated using (public.is_active_user());
create policy brands_admin on public.brands for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy brand_members_select on public.brand_members for select to authenticated using (public.is_active_user());
create policy brand_members_admin on public.brand_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- projects ----------
create policy projects_select on public.projects for select to authenticated using (public.can_view_project(id));
create policy projects_admin on public.projects for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy project_members_select on public.project_members for select to authenticated
  using (public.can_view_project(project_id));
create policy project_members_admin on public.project_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- recurring rules ----------
create policy recurring_select on public.recurring_task_rules for select to authenticated
  using (public.is_admin() or (public.is_active_user() and public.is_brand_member(brand_id)));
create policy recurring_admin on public.recurring_task_rules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- tasks ----------
create policy tasks_select on public.tasks for select to authenticated using (public.can_view_task(id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_admin());
create policy tasks_delete on public.tasks for delete to authenticated using (public.is_admin());
-- Nhân viên được giao có thể cập nhật; trigger tasks_before_update giới hạn cột và trạng thái.
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_work_on_task(id)) with check (public.can_work_on_task(id));

create policy task_assignments_select on public.task_assignments for select to authenticated
  using (public.can_view_task(task_id));
create policy task_assignments_admin on public.task_assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- subtasks / checklist ----------
create policy subtasks_select on public.subtasks for select to authenticated using (public.can_view_task(task_id));
create policy subtasks_admin on public.subtasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy subtasks_update_assignee on public.subtasks for update to authenticated
  using (public.can_work_on_task(task_id) or assignee_id = auth.uid())
  with check (public.can_work_on_task(task_id) or assignee_id = auth.uid());

create policy checklist_select on public.checklist_items for select to authenticated using (public.can_view_task(task_id));
create policy checklist_insert on public.checklist_items for insert to authenticated
  with check (public.can_work_on_task(task_id));
create policy checklist_update on public.checklist_items for update to authenticated
  using (public.can_work_on_task(task_id)) with check (public.can_work_on_task(task_id));
create policy checklist_delete on public.checklist_items for delete to authenticated
  using (public.is_admin() or (created_by = auth.uid() and public.can_work_on_task(task_id)));

-- ---------- comments ----------
create policy comments_select on public.task_comments for select to authenticated using (public.can_view_task(task_id));
create policy comments_insert on public.task_comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_task(task_id));
create policy comments_delete on public.task_comments for delete to authenticated
  using (public.is_admin() or author_id = auth.uid());

-- ---------- attachments ----------
create policy attachments_select on public.task_attachments for select to authenticated using (public.can_view_task(task_id));
create policy attachments_insert on public.task_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_work_on_task(task_id));
create policy attachments_delete on public.task_attachments for delete to authenticated
  using (public.is_admin() or uploaded_by = auth.uid());

-- ---------- approvals (chỉ ghi qua RPC submit_task / review_task) ----------
create policy approvals_select on public.task_approvals for select to authenticated
  using (public.is_admin() or (public.is_active_user() and public.is_task_assignee(task_id)));

-- ---------- activity logs (chỉ đọc; ghi bởi trigger) ----------
create policy activity_select on public.activity_logs for select to authenticated
  using (public.is_admin() or (task_id is not null and public.can_view_task(task_id))
         or (task_id is null and project_id is not null and public.can_view_project(project_id)));

-- ---------- goals ----------
create policy goals_select on public.goals for select to authenticated
  using (public.is_admin() or (public.is_active_user() and public.is_brand_member(brand_id)));
create policy goals_admin on public.goals for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy goal_members_select on public.goal_members for select to authenticated using (public.is_active_user());
create policy goal_members_admin on public.goal_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy goal_tasks_select on public.goal_tasks for select to authenticated using (public.can_view_task(task_id));
create policy goal_tasks_admin on public.goal_tasks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- content calendar ----------
create policy content_select on public.content_items for select to authenticated
  using (public.is_admin() or (public.is_active_user() and public.is_brand_member(brand_id)));
create policy content_admin on public.content_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- notifications: chỉ của chính mình ----------
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- ---------- settings ----------
create policy settings_select on public.app_settings for select to authenticated using (public.is_active_user());
create policy settings_admin on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Bảng ghi bởi hệ thống: thu hồi quyền ghi trực tiếp cho chắc chắn
revoke insert, update, delete on public.activity_logs from anon, authenticated;
revoke insert, update, delete on public.task_approvals from anon, authenticated;
revoke insert, delete on public.notifications from anon, authenticated;
revoke all on all tables in schema public from anon;

-- Thông báo: người dùng chỉ được đổi cột is_read
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- =====================================================================
-- Lưu trữ tệp: bucket riêng tư "task-files", đường dẫn <task_id>/<tên tệp>
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 52428800)
on conflict (id) do nothing;

create policy "task_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'task-files' and public.can_view_task(((storage.foldername(name))[1])::uuid));
create policy "task_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-files' and public.can_work_on_task(((storage.foldername(name))[1])::uuid));
create policy "task_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'task-files' and (public.is_admin() or owner = auth.uid()));
