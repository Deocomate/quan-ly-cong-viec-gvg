-- =====================================================================
-- Dữ liệu mẫu. Mọi bản ghi mẫu có is_demo = true và được gắn nhãn "Mẫu"
-- trên giao diện. Hàm này chỉ chạy bằng service_role (script
-- `npm run demo:seed`), không gọi được từ trình duyệt.
-- =====================================================================
create or replace function public.seed_demo_data(p_admin uuid, p_employees uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_brand record;
  v_proj  jsonb := '{}'::jsonb;
  v_pid   uuid;
  v_tid   uuid;
  v_emp   uuid;
  v_due   timestamptz;
  v_sub   timestamptz;
  v_count int := 0;
  r record;
begin
  if array_length(p_employees, 1) <> 4 then
    raise exception 'Cần đúng 4 nhân viên mẫu';
  end if;
  if exists (select 1 from public.tasks where is_demo) then
    raise exception 'Dữ liệu mẫu đã tồn tại. Hãy xóa trước khi tạo lại.';
  end if;

  -- Kích hoạt tài khoản mẫu
  update public.profiles set role = 'admin', is_active = true, is_demo = true,
         job_title = 'Chủ doanh nghiệp (mẫu)' where id = p_admin;
  update public.profiles p set role = 'employee', is_active = true, is_demo = true,
         job_title = x.job, responsibilities = x.resp, full_name = x.name
  from (values
    (p_employees[1], 'Nguyễn Minh Anh', 'Chuyên viên nội dung', 'Viết kịch bản, bài đăng Facebook/TikTok'),
    (p_employees[2], 'Trần Quốc Bảo', 'Quay dựng & livestream', 'Quay, dựng video, vận hành livestream'),
    (p_employees[3], 'Lê Thu Hà', 'Thiết kế thương hiệu', 'Nhận diện, bao bì, ảnh sản phẩm'),
    (p_employees[4], 'Phạm Đức Long', 'Kinh doanh & website', 'Báo giá, chăm sóc khách hàng, website, SEO')
  ) as x(id, name, job, resp)
  where p.id = x.id;

  insert into public.brand_members (brand_id, user_id)
  select b.id, u from public.brands b, unnest(array[p_admin]) u
  union all
  select b.id, x.u from public.brands b join (values
    ('gom-vu-gia', p_employees[1]), ('klayy', p_employees[1]),
    ('gom-vu-gia', p_employees[2]), ('anam-tile', p_employees[2]),
    ('klayy', p_employees[3]), ('th-ceramics', p_employees[3]),
    ('th-ceramics', p_employees[4]), ('anam-tile', p_employees[4])
  ) as x(slug, u) on x.slug = b.slug
  on conflict do nothing;

  -- Dự án mẫu
  for r in
    select * from (values
      ('p1', 'th-ceramics', 'Catalog sản phẩm 2027', 'Chụp ảnh và dàn trang catalog gạch ốp lát kiến trúc.', 'Hoàn thiện catalog 60 trang trước hội chợ', 3, -30, 45),
      ('p2', 'th-ceramics', 'Báo giá & chăm sóc khách hàng dự án', 'Chuẩn bị báo giá, theo dõi khách hàng công trình.', 'Phản hồi báo giá trong 24 giờ', 4, -20, 40),
      ('p3', 'anam-tile', 'Website & SEO', 'Làm mới website và tối ưu SEO cho bộ sưu tập mosaic.', 'Tăng lượt truy cập tự nhiên', 4, -25, 35),
      ('p4', 'anam-tile', 'Bộ sưu tập Mosaic Sen', 'Phát triển và kể chuyện cho bộ sưu tập mới.', 'Ra mắt 12 mẫu mosaic', 2, -15, 50),
      ('p5', 'gom-vu-gia', 'Phát triển kênh TikTok', 'Sản xuất video ngắn đều đặn cho kênh TikTok.', '20 video mỗi tháng', 1, -30, 60),
      ('p6', 'gom-vu-gia', 'Chiến dịch Livestream Tết', 'Chuẩn bị và vận hành các phiên livestream mùa Tết.', '40 phiên livestream', 2, -10, 70),
      ('p7', 'gom-vu-gia', 'Đào tạo kiến thức sản phẩm', 'Tài liệu đào tạo về bộ đồ thờ và bình hút lộc.', 'Toàn đội nắm vững 30 sản phẩm chủ lực', 1, -12, 20),
      ('p8', 'klayy', 'Nhận diện thương hiệu', 'Hoàn thiện logo, bảng màu, bao bì.', 'Chốt bộ nhận diện và bao bì', 3, -40, 15),
      ('p9', 'klayy', 'Ra mắt sản phẩm', 'Đăng bán 10 sản phẩm mới trên sàn TMĐT.', '10 sản phẩm lên sàn', 3, -5, 40)
    ) as t(k, slug, name, descr, goals, owner_idx, start_off, due_off)
  loop
    insert into public.projects (brand_id, name, description, goals, owner_id, status, start_date, due_date, is_demo, created_by)
    select b.id, r.name, r.descr, r.goals, p_employees[r.owner_idx], 'dang_thuc_hien',
           v_today + r.start_off, v_today + r.due_off, true, p_admin
    from public.brands b where b.slug = r.slug
    returning id into v_pid;
    v_proj := v_proj || jsonb_build_object(r.k, v_pid);
    insert into public.project_members (project_id, user_id) values (v_pid, p_employees[r.owner_idx]);
  end loop;

  -- Công việc mẫu: (dự án, tiêu đề, nhân viên, trọng số, ưu tiên, giờ, kịch bản, hạn (ngày so với hôm nay), điểm)
  for r in
    select * from (values
      ('p1', 'Chụp ảnh 20 mẫu gạch men vân đá', 3, 3, 'cao', 12, 'ok', -12, 5),
      ('p1', 'Viết mô tả kỹ thuật cho catalog', 4, 2, 'trung_binh', 6, 'late', -8, 3),
      ('p1', 'Dàn trang catalog bản nháp', 3, 5, 'cao', 24, 'doing', 6, null),
      ('p1', 'Kiểm tra màu in thử', 3, 1, 'trung_binh', 2, 'todo', 10, null),
      ('p2', 'Báo giá công trình khách sạn Đà Nẵng', 4, 2, 'khan_cap', 4, 'ok', -5, 4),
      ('p2', 'Gửi mẫu gạch cho kiến trúc sư', 4, 1, 'cao', 2, 'overdue', -3, null),
      ('p2', 'Cập nhật bảng giá quý 4', 4, 2, 'trung_binh', 5, 'review', 1, null),
      ('p3', 'Tối ưu SEO trang bộ sưu tập', 4, 3, 'cao', 10, 'rev_ok', -6, 4),
      ('p3', 'Viết 4 bài blog về mosaic nghệ thuật', 2, 2, 'trung_binh', 8, 'revise', 2, null),
      ('p3', 'Sửa lỗi tốc độ tải trang', 4, 2, 'cao', 6, 'blocked', 3, null),
      ('p4', 'Quay video giới thiệu Mosaic Sen', 2, 3, 'cao', 10, 'doing', 4, null),
      ('p4', 'Viết câu chuyện thương hiệu cho bộ sưu tập', 2, 2, 'trung_binh', 5, 'overdue', -2, null),
      ('p4', 'Chụp ảnh ứng dụng tại công trình', 2, 3, 'trung_binh', 8, 'wait', 7, null),
      ('p5', 'Kịch bản 5 video TikTok tuần 1', 1, 2, 'cao', 6, 'ok', -14, 5),
      ('p5', 'Quay dựng 3 video TikTok tuần 1', 2, 3, 'cao', 12, 'ok', -11, 4),
      ('p5', 'Kịch bản 5 video TikTok tuần 2', 1, 2, 'cao', 6, 'rev_ok', -7, 3),
      ('p5', 'Quay dựng 3 video TikTok tuần 2', 2, 3, 'cao', 12, 'late', -4, 4),
      ('p5', 'Kịch bản 5 video TikTok tuần 3', 1, 2, 'cao', 6, 'review', 0, null),
      ('p5', 'Quay dựng 3 video TikTok tuần 3', 2, 3, 'cao', 12, 'todo', 3, null),
      ('p6', 'Lên kịch bản livestream bộ đồ thờ', 1, 2, 'khan_cap', 4, 'doing', 0, null),
      ('p6', 'Chuẩn bị sản phẩm và phông nền livestream', 2, 1, 'cao', 3, 'overdue', -1, null),
      ('p6', 'Vận hành livestream thử nghiệm', 2, 2, 'trung_binh', 4, 'paused', 5, null),
      ('p6', 'Tổng hợp câu hỏi khách hàng sau livestream', 1, 1, 'thap', 2, 'noapp', -2, null),
      ('p7', 'Soạn tài liệu kiến thức bình hút lộc', 1, 3, 'trung_binh', 10, 'overdue', -4, null),
      ('p7', 'Quay video đào tạo bày trí bàn thờ', 2, 3, 'trung_binh', 8, 'todo', 12, null),
      ('p8', 'Chốt logo và bảng màu Klayy', 3, 5, 'khan_cap', 20, 'ok', -20, 5),
      ('p8', 'Thiết kế bao bì hộp quà', 3, 3, 'cao', 16, 'revise', 1, null),
      ('p8', 'Viết hướng dẫn giọng điệu thương hiệu', 1, 2, 'trung_binh', 5, 'review', -1, null),
      ('p9', 'Chụp ảnh 10 sản phẩm mới', 3, 3, 'cao', 12, 'doing', 2, null),
      ('p9', 'Viết mô tả sản phẩm cho sàn TMĐT', 1, 2, 'trung_binh', 6, 'todo', 6, null),
      ('p9', 'Đăng 10 sản phẩm lên Shopee', 4, 2, 'trung_binh', 5, 'todo', 9, null),
      ('p9', 'Lên kế hoạch nội dung tháng ra mắt', 1, 2, 'cao', 4, 'ok', -3, 4),
      ('p9', 'Khảo sát giá đối thủ', 4, 1, 'thap', 3, 'cancel', -2, null),
      ('p8', 'Mockup bao bì in thử', 3, 2, 'trung_binh', 6, 'nodue', null, null)
    ) as t(pk, title, emp_idx, weight, prio, hours, scen, due_off, quality)
  loop
    v_pid := (v_proj ->> r.pk)::uuid;
    v_emp := p_employees[r.emp_idx];
    v_due := case when r.due_off is null then null
                  else ((v_today + r.due_off)::timestamp + time '23:59') at time zone 'Asia/Ho_Chi_Minh' end;

    insert into public.tasks (
      brand_id, project_id, title, description, primary_owner_id, created_by, created_at,
      start_date, due_at, priority, weight, estimated_hours, status, progress, requires_approval, is_demo
    )
    select pr.brand_id, v_pid, r.title,
           'Công việc mẫu để minh họa quy trình. Có thể xóa trong Cài đặt > Dữ liệu mẫu.',
           v_emp, p_admin, coalesce(v_due, now()) - interval '10 days',
           (coalesce(v_due, now()) - interval '7 days')::date, v_due, r.prio::public.task_priority, r.weight,
           r.hours, 'chua_bat_dau', 0, r.scen <> 'noapp', true
    from public.projects pr where pr.id = v_pid
    returning id into v_tid;
    insert into public.task_assignments (task_id, user_id, assigned_by) values (v_tid, v_emp, p_admin);
    v_count := v_count + 1;

    if r.scen in ('ok', 'late', 'rev_ok') then
      v_sub := case r.scen when 'ok' then v_due - interval '1 day'
                           when 'late' then v_due + interval '2 days'
                           else v_due - interval '6 hours' end;
      if r.scen = 'rev_ok' then
        insert into public.task_approvals (task_id, submitted_by, submitted_at, decision, reviewed_by, reviewed_at, feedback)
        values (v_tid, v_emp, v_due - interval '2 days', 'yeu_cau_sua', p_admin, v_due - interval '1 day 20 hours',
                'Cần chỉnh lại phần mở đầu cho rõ thông điệp.');
      end if;
      insert into public.task_approvals (task_id, submitted_by, submitted_at, evidence, decision, reviewed_by, reviewed_at, quality_score)
      values (v_tid, v_emp, v_sub, 'Đã hoàn thành, link kết quả trong phần tệp.', 'da_duyet', p_admin,
              v_sub + case when r.scen = 'ok' then interval '2 days' else interval '3 hours' end, r.quality);
      update public.tasks set status = 'hoan_thanh', progress = 100,
             first_submitted_at = case when r.scen = 'rev_ok' then v_due - interval '2 days' else v_sub end,
             submitted_at = v_sub, completed_at = v_sub,
             approved_at = v_sub + case when r.scen = 'ok' then interval '2 days' else interval '3 hours' end,
             approved_by = p_admin, quality_score = r.quality,
             revision_count = case when r.scen = 'rev_ok' then 1 else 0 end,
             completion_evidence = 'Đã hoàn thành, link kết quả trong phần tệp.'
      where id = v_tid;
    elsif r.scen = 'review' then
      v_sub := least(now(), v_due) - interval '3 hours';
      insert into public.task_approvals (task_id, submitted_by, submitted_at, evidence)
      values (v_tid, v_emp, v_sub, 'Bản hoàn chỉnh đã nộp, nhờ chị xem giúp.');
      update public.tasks set status = 'cho_duyet', progress = 100, submitted_at = v_sub, first_submitted_at = v_sub,
             completion_evidence = 'Bản hoàn chỉnh đã nộp, nhờ chị xem giúp.' where id = v_tid;
    elsif r.scen = 'revise' then
      insert into public.task_approvals (task_id, submitted_by, submitted_at, decision, reviewed_by, reviewed_at, feedback)
      values (v_tid, v_emp, now() - interval '2 days', 'yeu_cau_sua', p_admin, now() - interval '1 day',
              'Màu sắc chưa đúng tinh thần thương hiệu, chỉnh lại theo bảng màu đã chốt.');
      update public.tasks set status = 'can_chinh_sua', progress = 80, revision_count = 1,
             submitted_at = now() - interval '2 days', first_submitted_at = now() - interval '2 days' where id = v_tid;
      insert into public.task_comments (task_id, author_id, body)
      values (v_tid, p_admin, 'Yêu cầu chỉnh sửa: Màu sắc chưa đúng tinh thần thương hiệu, chỉnh lại theo bảng màu đã chốt.');
    elsif r.scen = 'doing' then
      update public.tasks set status = 'dang_thuc_hien', progress = 50 where id = v_tid;
    elsif r.scen = 'overdue' then
      update public.tasks set status = 'dang_thuc_hien', progress = 30 where id = v_tid;
    elsif r.scen = 'wait' then
      update public.tasks set status = 'cho_phan_hoi', progress = 40 where id = v_tid;
    elsif r.scen = 'blocked' then
      update public.tasks set status = 'dang_thuc_hien', progress = 20, is_blocked = true,
             blocker_note = 'Chờ bên hosting cấp quyền truy cập máy chủ.' where id = v_tid;
    elsif r.scen = 'paused' then
      update public.tasks set status = 'tam_dung', progress = 10 where id = v_tid;
    elsif r.scen = 'noapp' then
      update public.tasks set status = 'hoan_thanh', submitted_at = v_due - interval '4 hours',
             first_submitted_at = v_due - interval '4 hours', completed_at = v_due - interval '4 hours' where id = v_tid;
    elsif r.scen = 'cancel' then
      update public.tasks set status = 'da_huy' where id = v_tid;
    elsif r.scen = 'nodue' then
      update public.tasks set status = 'dang_thuc_hien', progress = 30 where id = v_tid;
    end if;

    if r.scen in ('doing', 'overdue') then
      insert into public.checklist_items (task_id, title, is_done, sort_order, created_by) values
        (v_tid, 'Chuẩn bị tài liệu tham khảo', true, 1, p_admin),
        (v_tid, 'Thực hiện bản nháp', r.scen = 'doing', 2, p_admin),
        (v_tid, 'Tự kiểm tra trước khi nộp', false, 3, p_admin);
      insert into public.task_comments (task_id, author_id, kind, body)
      values (v_tid, v_emp, 'tien_do', 'Đã xong phần chuẩn bị, đang làm bản nháp.');
    end if;
  end loop;

  -- Việc nhỏ minh họa
  insert into public.subtasks (task_id, title, assignee_id, is_done, sort_order)
  select t.id, s.title, t.primary_owner_id, s.done, s.ord
  from public.tasks t,
       (values ('Chọn 10 mẫu chủ lực', true, 1), ('Chụp ảnh nền trắng', true, 2), ('Chụp ảnh bối cảnh', false, 3)) as s(title, done, ord)
  where t.is_demo and t.title = 'Chụp ảnh 10 sản phẩm mới';

  return jsonb_build_object('tasks', v_count, 'projects', (select count(*) from jsonb_object_keys(v_proj)));
end $$;

revoke execute on function public.seed_demo_data(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.seed_demo_data(uuid, uuid[]) to service_role;

-- Dọn dữ liệu mẫu bằng service_role (dùng trong script `npm run demo:remove`)
create or replace function public.purge_demo_data_service()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_tasks int; v_projects int;
begin
  delete from public.content_items where is_demo;
  delete from public.goals where is_demo;
  delete from public.tasks where is_demo; get diagnostics v_tasks = row_count;
  delete from public.projects where is_demo; get diagnostics v_projects = row_count;
  return jsonb_build_object('tasks', v_tasks, 'projects', v_projects);
end $$;
revoke execute on function public.purge_demo_data_service() from public, anon, authenticated;
grant execute on function public.purge_demo_data_service() to service_role;
