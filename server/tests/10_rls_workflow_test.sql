-- Kiểm thử phân quyền và quy trình trên PostgreSQL cục bộ (mô phỏng cách máy chủ ứng dụng
-- gọi CSDL: SET ROLE authenticated + request.jwt.claims). Mỗi khối ASSERT thất bại sẽ dừng chạy.
\set QUIET on
\pset format unaligned
\pset tuples_only on

create or replace function pg_temp.act_as(p_email text) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, false);
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK (bị chặn đúng): % — %', p_label, sqlerrm;
    return;
  end;
  raise exception 'LỖI: lẽ ra phải bị chặn: %', p_label;
end $$;

grant execute on function pg_temp.act_as(text) to authenticated, service_role;
grant execute on function pg_temp.expect_error(text, text) to authenticated, service_role;

-- 1. Chủ doanh nghiệp đăng ký, rồi được nâng quyền bằng SQL Editor
insert into auth.users (email, raw_user_meta_data) values ('owner@thmai.vn', '{"full_name":"Thanh Mai"}');
do $$ begin
  assert (select not is_active from public.profiles where email = 'owner@thmai.vn'), 'tài khoản tự đăng ký phải chưa kích hoạt';
end $$;
select public.bootstrap_admin('owner@thmai.vn');
do $$ begin
  assert (select role = 'admin' and is_active from public.profiles where email = 'owner@thmai.vn'), 'bootstrap_admin thất bại';
end $$;

-- 2. Người lạ tự đăng ký: không thấy dữ liệu
insert into auth.users (email) values ('stranger@gmail.com');

-- 3. Tạo tài khoản mẫu và dữ liệu mẫu bằng service_role
insert into auth.users (email, raw_user_meta_data) values
  ('demo.admin@example.com', '{"is_demo":true}'), ('demo.anh@example.com', '{"is_demo":true}'),
  ('demo.bao@example.com', '{"is_demo":true}'), ('demo.ha@example.com', '{"is_demo":true}'),
  ('demo.long@example.com', '{"is_demo":true}');
set role service_role;
select public.seed_demo_data(
  (select id from auth.users where email = 'demo.admin@example.com'),
  array(select id from auth.users where email in ('demo.anh@example.com','demo.bao@example.com','demo.ha@example.com','demo.long@example.com')
        order by array_position(array['demo.anh@example.com','demo.bao@example.com','demo.ha@example.com','demo.long@example.com'], email)));
reset role;
do $$ begin
  assert (select count(*) from public.tasks where is_demo) >= 30, 'cần ít nhất 30 công việc mẫu';
  assert (select count(*) from public.tasks where status = 'hoan_thanh') > 0, 'thiếu việc hoàn thành';
  assert (select count(*) from public.tasks where status = 'can_chinh_sua') > 0, 'thiếu việc cần sửa';
  assert (select count(*) from public.tasks where status = 'cho_duyet') > 0, 'thiếu việc chờ duyệt';
  assert (select count(*) from public.tasks where due_at < now() and status in ('dang_thuc_hien','chua_bat_dau')) > 0, 'thiếu việc quá hạn';
  assert (select count(*) from public.task_approvals where decision = 'yeu_cau_sua') > 0, 'thiếu lịch sử yêu cầu sửa';
end $$;
select 'Dữ liệu mẫu: ' || count(*) || ' công việc' from public.tasks;

-- 4. Admin mời nhân viên thật
set role authenticated;
select pg_temp.act_as('owner@thmai.vn');
insert into public.invitations (email, full_name, job_title, brand_ids)
values ('nv.thu@thmai.vn', 'Hoàng Thu', 'Nhân viên nội dung', array[(select id from public.brands where slug = 'gom-vu-gia')]);
reset role;
insert into auth.users (email) values ('nv.thu@thmai.vn');
do $$ begin
  assert (select is_active and role = 'employee' and full_name = 'Hoàng Thu' from public.profiles where email = 'nv.thu@thmai.vn'), 'lời mời không kích hoạt hồ sơ';
  assert (select count(*) = 1 from public.brand_members m join public.profiles p on p.id = m.user_id where p.email = 'nv.thu@thmai.vn'), 'không gán thương hiệu';
end $$;

-- 5. Người lạ không thấy gì
set role authenticated;
select pg_temp.act_as('stranger@gmail.com');
do $$ begin
  assert (select count(*) from public.tasks) = 0, 'người lạ thấy công việc';
  assert (select count(*) from public.brands) = 0, 'người lạ thấy thương hiệu';
  assert (select count(*) from public.profiles) = 1, 'người lạ thấy hồ sơ người khác';
end $$;
select pg_temp.expect_error($q$ update public.profiles set is_active = true where id = auth.uid() $q$, 'người lạ tự kích hoạt');
select pg_temp.expect_error($q$ update public.profiles set role = 'admin' where id = auth.uid() $q$, 'người lạ tự nâng quyền');

-- 5b. Admin mời người đã tự đăng ký trước → KHÔNG tự kích hoạt (có thể là người lạ đăng ký chặn trước);
--     chủ tài khoản phải gửi đúng mã trong liên kết mời mới được kích hoạt.
reset role;
create temp table _late (token text);
grant all on _late to authenticated;
insert into auth.users (email) values ('late@thmai.vn');
set role authenticated;
select pg_temp.act_as('owner@thmai.vn');
insert into public.invitations (email, full_name, brand_ids) values ('late@thmai.vn', 'Người Đến Sau', array[(select id from public.brands where slug = 'klayy')]);
insert into _late select token from public.invitations where email = 'late@thmai.vn';
do $$ begin
  assert (select not is_active from public.profiles where email = 'late@thmai.vn'), 'lời mời không được tự kích hoạt tài khoản có sẵn';
end $$;
select pg_temp.act_as('late@thmai.vn');
select pg_temp.expect_error($$select public.accept_invitation('ma-sai')$$, 'nhận lời mời bằng mã sai');
select public.accept_invitation((select token from _late));
do $$ begin
  assert (select is_active and full_name = 'Người Đến Sau' from public.profiles where id = auth.uid()), 'nhận lời mời đúng mã không kích hoạt tài khoản';
end $$;
select pg_temp.act_as('stranger@gmail.com');
select pg_temp.expect_error($$select public.accept_invitation((select token from _late))$$, 'dùng lại mã mời cho tài khoản khác');

-- 6. Nhân viên mẫu Minh Anh (Gốm Vũ Gia, Klayy)
select pg_temp.act_as('demo.anh@example.com');
do $$ begin
  assert (select count(*) from public.tasks t join public.brands b on b.id = t.brand_id where b.slug = 'th-ceramics') = 0,
    'nhân viên thấy việc của thương hiệu không thuộc mình';
  assert (select count(*) from public.tasks) > 0, 'nhân viên không thấy việc của mình';
end $$;
create temp table _t as select id from public.tasks
  where title = 'Lên kịch bản livestream bộ đồ thờ';
grant select on _t to authenticated;

select pg_temp.expect_error($q$ update public.tasks set due_at = now() + interval '30 days' where id = (select id from _t) $q$, 'nhân viên tự dời hạn chót');
select pg_temp.expect_error($q$ update public.tasks set quality_score = 5 where id = (select id from _t) $q$, 'nhân viên tự chấm điểm');
select pg_temp.expect_error($q$ update public.tasks set weight = 5 where id = (select id from _t) $q$, 'nhân viên đổi trọng số');
select pg_temp.expect_error($q$ update public.tasks set status = 'hoan_thanh' where id = (select id from _t) $q$, 'nhân viên tự đánh dấu hoàn thành');
select pg_temp.expect_error($q$ update public.tasks set status = 'cho_duyet' where id = (select id from _t) $q$, 'nhân viên đổi sang chờ duyệt không qua nộp');
select pg_temp.expect_error($q$ insert into public.task_approvals (task_id, decision) values ((select id from _t), 'da_duyet') $q$, 'nhân viên tự ghi bản duyệt');
select pg_temp.expect_error($q$ insert into public.activity_logs (action) values ('gia_mao') $q$, 'nhân viên ghi nhật ký giả');
select pg_temp.expect_error($q$ delete from public.activity_logs $q$, 'nhân viên xóa nhật ký');
select pg_temp.expect_error($q$ select public.review_task((select id from _t), true, 5::smallint, null) $q$, 'nhân viên tự duyệt');
select pg_temp.expect_error($q$ select public.purge_demo_data() $q$, 'nhân viên xóa dữ liệu mẫu');
select pg_temp.expect_error($q$ insert into public.tasks (brand_id, title) values ((select id from public.brands limit 1), 'x') $q$, 'nhân viên tạo việc');
select pg_temp.expect_error($q$ update public.profiles set role = 'admin' where id = auth.uid() $q$, 'nhân viên tự nâng quyền');
select pg_temp.expect_error($q$ update public.profiles set job_title = 'Giám đốc' where id = auth.uid() $q$, 'nhân viên tự đổi chức danh');

-- Cập nhật hợp lệ
update public.tasks set progress = 70, status = 'dang_thuc_hien' where id = (select id from _t);
update public.tasks set is_blocked = true, blocker_note = 'Chờ ảnh sản phẩm' where id = (select id from _t);
update public.profiles set phone = '0900000000' where id = auth.uid();
insert into public.task_comments (task_id, body, kind, mentions)
values ((select id from _t), 'Đã xong 70%', 'tien_do', array[(select id from public.profiles where email = 'owner@thmai.vn')]);
insert into public.checklist_items (task_id, title) values ((select id from _t), 'Gửi bản nháp');
insert into storage.objects (bucket_id, name, owner) values ('task-files', (select id from _t)::text || '/kich-ban.pdf', auth.uid());
select pg_temp.expect_error(
  $q$ insert into storage.objects (bucket_id, name, owner) values ('task-files',
      (select id::text from public.tasks where title = 'Quay dựng 3 video TikTok tuần 3') || '/x.pdf', auth.uid()) $q$,
  'tải tệp lên việc không được giao');
-- Không sửa được việc của người khác dù cùng thương hiệu (RLS trả 0 dòng)
with u as (update public.tasks set progress = 99 where title = 'Quay dựng 3 video TikTok tuần 3' returning 1)
select 'Sửa việc của người khác: ' || count(*) || ' dòng (mong đợi 0)' from u;
do $$ begin
  assert (select progress from public.tasks where title = 'Quay dựng 3 video TikTok tuần 3') = 0, 'nhân viên sửa được việc người khác';
end $$;

-- Nộp duyệt
select 'Nộp duyệt → ' || (public.submit_task((select id from _t), 'Link kịch bản: https://example.com')).status;
select pg_temp.expect_error($q$ select public.submit_task((select id from _t), 'lần 2') $q$, 'nộp lại khi đang chờ duyệt');
select pg_temp.expect_error($q$ update public.tasks set progress = 10 where id = (select id from _t) $q$, 'sửa tiến độ khi chờ duyệt');

-- 7. Admin xử lý
select pg_temp.act_as('owner@thmai.vn');
do $$ begin
  assert (select count(*) from public.notifications where type = 'nop_duyet') >= 1, 'admin không nhận thông báo nộp duyệt';
  assert (select count(*) from public.notifications where type = 'nhac_ten') >= 1, 'admin không nhận thông báo nhắc tên';
end $$;
select pg_temp.expect_error($q$ select public.review_task((select id from _t), false, null, '  ') $q$, 'yêu cầu sửa không ghi lý do');
select 'Yêu cầu sửa → ' || (public.review_task((select id from _t), false, null, 'Thêm phần giới thiệu sản phẩm')).status;
update public.tasks set due_at = due_at + interval '2 days' where id = (select id from _t);

select pg_temp.act_as('demo.anh@example.com');
do $$ begin
  assert (select count(*) from public.notifications where type = 'yeu_cau_sua') >= 1, 'nhân viên không nhận thông báo yêu cầu sửa';
  assert (select revision_count from public.tasks where id = (select id from _t)) = 1, 'chưa tăng số lần sửa';
end $$;
select pg_temp.expect_error($q$ update public.notifications set title = 'x' $q$, 'sửa nội dung thông báo');
update public.notifications set is_read = true;
update public.tasks set status = 'dang_thuc_hien' where id = (select id from _t);
select 'Nộp lại → ' || (public.submit_task((select id from _t), 'Bản đã sửa')).status;

select pg_temp.act_as('owner@thmai.vn');
select 'Duyệt → ' || (public.review_task((select id from _t), true, 4::smallint, 'Tốt')).status;
do $$
declare t public.tasks%rowtype;
begin
  select * into t from public.tasks where id = (select id from _t);
  assert t.completed_at = t.submitted_at, 'completed_at phải bằng thời điểm nhân viên nộp';
  assert t.approved_at >= t.submitted_at, 'thiếu thời điểm duyệt';
  assert t.quality_score = 4, 'thiếu điểm chất lượng';
  assert (select count(*) from public.task_approvals where task_id = t.id) = 2, 'phải có 2 lần nộp';
  assert exists (select 1 from public.activity_logs where task_id = t.id and action = 'doi_han_chot' and actor_role = 'admin'),
    'nhật ký phải ghi rõ quản trị viên đổi hạn';
  assert (select count(*) from public.activity_logs where task_id = t.id) >= 8, 'nhật ký thiếu bản ghi';
end $$;
select pg_temp.expect_error($q$ update public.profiles set role = 'employee' where id = auth.uid() $q$, 'admin tự gỡ quyền');

-- Admin giao việc cho nhiều người
select public.set_task_assignees((select id from public.tasks where title = 'Kiểm tra màu in thử'),
  array(select id from public.profiles where email in ('demo.ha@example.com', 'nv.thu@thmai.vn')));
do $$ begin
  assert (select count(*) from public.task_assignments a join public.tasks t on t.id = a.task_id where t.title = 'Kiểm tra màu in thử') = 2,
    'giao nhiều người thất bại';
end $$;

-- 7b. Giai đoạn 2: việc lặp lại và nhắc hạn
select pg_temp.act_as('owner@thmai.vn');
insert into public.recurring_task_rules (brand_id, title, frequency, weekdays, assignee_ids, weight)
values ((select id from public.brands where slug = 'gom-vu-gia'), 'Đăng bài Facebook hằng ngày', 'daily', '{}',
        array[(select id from public.profiles where email = 'demo.anh@example.com')], 1),
       ((select id from public.brands where slug = 'gom-vu-gia'), '3 video TikTok mỗi tuần', 'weekly', '{1,3,5}',
        array[(select id from public.profiles where email = 'demo.bao@example.com')], 2);
select 'Sinh việc lặp lần 1: ' || public.generate_recurring_tasks(7);
select 'Sinh việc lặp lần 2 (phải = 0): ' || public.generate_recurring_tasks(7);
do $$ begin
  assert (select count(*) from public.tasks where title = 'Đăng bài Facebook hằng ngày') = 8, 'việc hằng ngày phải có 8 lần (hôm nay + 7 ngày)';
  assert (select count(*) from public.tasks where title = '3 video TikTok mỗi tuần') between 3 and 4, 'việc 3 lần/tuần sai số lượng';
  assert (select count(*) from public.tasks t where t.recurring_rule_id is not null
          and not exists (select 1 from public.task_assignments a where a.task_id = t.id)) = 0, 'việc lặp chưa được giao';
  assert (select count(*) from (select recurring_rule_id, recurrence_key from public.tasks where recurring_rule_id is not null
          group by 1, 2 having count(*) > 1) x) = 0, 'việc lặp bị trùng';
end $$;
select pg_temp.expect_error($q$ insert into public.recurring_task_rules (brand_id, title, frequency) values ((select id from public.brands limit 1), 'x', 'weekly') $q$,
  'quy tắc hằng tuần không chọn thứ');
select 'Nhắc hạn lần 1: ' || public.send_due_reminders();
select 'Nhắc hạn lần 2 (phải = 0): ' || public.send_due_reminders();
do $$ begin
  assert (select count(*) from public.notifications where type = 'qua_han') > 0, 'không có cảnh báo quá hạn';
end $$;
select pg_temp.act_as('demo.anh@example.com');
select pg_temp.expect_error($q$ insert into public.recurring_task_rules (brand_id, title, frequency) values ((select id from public.brands limit 1), 'x', 'daily') $q$,
  'nhân viên tạo quy tắc lặp');
select 'Nhân viên chạy tác vụ định kỳ (idempotent): ' || public.run_scheduled_jobs()::text;
do $$ begin
  assert (select count(*) from public.notifications where type = 'sap_den_han') + (select count(*) from public.notifications where type = 'qua_han') > 0,
    'nhân viên không nhận nhắc hạn';
end $$;
select pg_temp.act_as('stranger@gmail.com');
select pg_temp.expect_error($q$ select public.run_scheduled_jobs() $q$, 'người lạ chạy tác vụ định kỳ');

-- 7c. Giai đoạn 3: mục tiêu, lịch nội dung, hàng đợi email
reset role;
set role service_role;
select 'Dữ liệu mẫu GĐ3: ' || public.seed_demo_phase3(
  array(select id from auth.users where email in ('demo.anh@example.com','demo.bao@example.com','demo.ha@example.com','demo.long@example.com')
        order by array_position(array['demo.anh@example.com','demo.bao@example.com','demo.ha@example.com','demo.long@example.com'], email)))::text;
select 'Hàng đợi email (service_role): ' || count(*) from public.email_queue(500);
reset role;
do $$ begin
  assert (select count(*) from public.goals where is_demo) = 8, 'thiếu mục tiêu mẫu';
  assert (select count(*) from public.content_items where is_demo) = 12, 'thiếu nội dung mẫu';
  assert (select count(*) from public.goal_progress_logs) = 12, 'thiếu lịch sử mục tiêu';
end $$;
set role authenticated;

-- Nhân viên Minh Anh (Gốm Vũ Gia, Klayy)
select pg_temp.act_as('demo.anh@example.com');
do $$ begin
  assert (select count(*) from public.goals g join public.brands b on b.id = g.brand_id where b.slug in ('anam-tile', 'th-ceramics')) = 0,
    'nhân viên thấy mục tiêu thương hiệu khác';
  assert (select count(*) from public.content_items c join public.brands b on b.id = c.brand_id where b.slug = 'anam-tile') = 0,
    'nhân viên thấy nội dung thương hiệu khác';
  assert (select count(*) from public.goals) > 0, 'nhân viên không thấy mục tiêu của mình';
end $$;
select pg_temp.expect_error($q$ select public.email_queue(10) $q$, 'nhân viên đọc hàng đợi email');
select pg_temp.expect_error($q$ select public.notify_link(auth.uid(), 'x', 'y', '/') $q$, 'nhân viên tự tạo thông báo');
select pg_temp.expect_error($q$ insert into public.goals (brand_id, name, period_type, period_start, period_end, target_value)
  values ((select id from public.brands where slug = 'klayy'), 'x', 'thang', current_date, current_date, 1) $q$, 'nhân viên tạo mục tiêu');
select pg_temp.expect_error($q$ insert into public.goal_progress_logs (goal_id, value) select id, 1 from public.goals limit 1 $q$, 'nhân viên ghi thẳng lịch sử mục tiêu');
-- Cập nhật kết quả mục tiêu mình phụ trách
select public.record_goal_progress((select id from public.goals where name = 'Khách tiềm năng từ TikTok'), 90, 'Tuần 4');
do $$ begin
  assert (select actual_value from public.goals where name = 'Khách tiềm năng từ TikTok') = 90, 'không cập nhật được kết quả';
end $$;
select pg_temp.expect_error($q$ select public.record_goal_progress((select id from public.goals where name = 'Đơn hàng sàn TMĐT'), 999, null) $q$,
  'nhân viên cập nhật mục tiêu không phụ trách');
select pg_temp.expect_error($q$ select public.record_goal_progress((select id from public.goals where name = 'Khách tiềm năng từ TikTok'), -5, null) $q$,
  'kết quả âm');
-- Nội dung mình phụ trách: cập nhật tiến độ, gửi duyệt; không tự duyệt, không đổi chủ đề
update public.content_items set filming_status = 'xong', editing_status = 'dang_lam', notes = 'Đã quay xong'
  where topic = 'Phân biệt gốm Bát Tràng thật và hàng nhái';
update public.content_items set approval_status = 'cho_duyet' where topic = 'Phân biệt gốm Bát Tràng thật và hàng nhái';
select pg_temp.expect_error($q$ update public.content_items set approval_status = 'da_duyet' where topic = 'Phân biệt gốm Bát Tràng thật và hàng nhái' $q$,
  'nhân viên tự duyệt nội dung');
select pg_temp.expect_error($q$ update public.content_items set topic = 'đổi' where topic = 'Phân biệt gốm Bát Tràng thật và hàng nhái' $q$,
  'nhân viên đổi chủ đề nội dung');
do $$ declare n int; begin
  update public.content_items set views = 1 where topic = 'Khách hàng chia sẻ sau khi thỉnh bình hút lộc'; -- của Bảo
  get diagnostics n = row_count;
  assert n = 0, 'nhân viên sửa được nội dung người khác';
end $$;
reset role;
do $$ begin
  assert (select filming_status = 'xong' and approval_status = 'cho_duyet' from public.content_items where topic = 'Phân biệt gốm Bát Tràng thật và hàng nhái'),
    'cập nhật nội dung thất bại';
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.user_id
          where p.email = 'owner@thmai.vn' and n.title = 'Nội dung chờ duyệt') = 1, 'admin không nhận thông báo nội dung chờ duyệt';
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.user_id
          where p.email = 'owner@thmai.vn' and n.title like 'Cập nhật mục tiêu:%') = 1, 'admin không nhận thông báo cập nhật mục tiêu';
end $$;
set role authenticated;
-- Admin duyệt / yêu cầu sửa → người phụ trách nhận thông báo
select pg_temp.act_as('owner@thmai.vn');
select pg_temp.expect_error($q$ select public.record_goal_progress((select id from public.goals where metric = 'so_viec' limit 1), 3, null) $q$,
  'nhập tay mục tiêu tự tính');
update public.content_items set approval_status = 'can_sua', approval_note = 'Thêm phụ đề' where topic = 'Phân biệt gốm Bát Tràng thật và hàng nhái';
select pg_temp.expect_error($q$ insert into public.goal_tasks (goal_id, task_id)
  select g.id, t.id from public.goals g, public.tasks t join public.brands b on b.id = t.brand_id
  where g.name = 'Khách tiềm năng từ TikTok' and b.slug = 'klayy' limit 1 $q$, 'liên kết việc khác thương hiệu vào mục tiêu');
reset role;
do $$ begin
  assert (select count(*) from public.notifications n join public.profiles p on p.id = n.user_id
          where p.email = 'demo.anh@example.com' and n.title = 'Nội dung cần chỉnh sửa' and n.body like '%Thêm phụ đề%') = 1,
    'người phụ trách không nhận yêu cầu sửa nội dung';
end $$;
set role authenticated;

-- 8. Xóa dữ liệu mẫu: tài khoản mẫu không được tự xóa; admin thật thì được
select pg_temp.act_as('demo.admin@example.com');
select pg_temp.expect_error($q$ select public.purge_demo_data() $q$, 'admin mẫu xóa dữ liệu mẫu');
select pg_temp.act_as('owner@thmai.vn');
select 'Xóa dữ liệu mẫu: ' || public.purge_demo_data()::text;
reset role;
do $$ begin
  assert (select count(*) from public.tasks where is_demo) = 0, 'còn công việc mẫu';
  assert (select count(*) from public.goals where is_demo) = 0, 'còn mục tiêu mẫu';
  assert (select count(*) from public.content_items where is_demo) = 0, 'còn nội dung mẫu';
  assert (select count(*) from public.profiles where is_demo and is_active) = 0, 'tài khoản mẫu vẫn hoạt động';
  assert (select count(*) from public.brands) = 4, 'mất thương hiệu thật';
end $$;
select 'TẤT CẢ KIỂM THỬ ĐỀU ĐẠT';
