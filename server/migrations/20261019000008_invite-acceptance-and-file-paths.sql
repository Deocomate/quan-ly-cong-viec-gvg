-- Lời mời không còn tự kích hoạt tài khoản đã tồn tại. Trước đây, người lạ có thể đăng ký trước bằng email
-- của người sắp được mời (tài khoản chưa kích hoạt) và tự động nhận quyền khi quản trị viên tạo lời mời.
-- Nay chủ tài khoản phải chứng minh nhận được lời mời: đăng nhập rồi gửi đúng mã trong liên kết mời.
drop trigger if exists invitations_after_insert on public.invitations;
drop function if exists public.invitations_after_insert();

create or replace function public.accept_invitation(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'Chưa đăng nhập' using errcode = '42501';
  end if;
  select i.* into v_inv
  from public.invitations i join auth.users u on lower(u.email) = i.email
  where u.id = v_uid and i.accepted_at is null;
  if v_inv.email is null or v_inv.token is distinct from p_token then
    raise exception 'Lời mời không hợp lệ, đã được dùng hoặc không dành cho tài khoản này' using errcode = '42501';
  end if;
  update public.profiles
  set role = v_inv.role, job_title = coalesce(v_inv.job_title, job_title), full_name = v_inv.full_name, is_active = true
  where id = v_uid;
  insert into public.brand_members (brand_id, user_id)
  select b, v_uid from unnest(v_inv.brand_ids) as b
  where exists (select 1 from public.brands where id = b)
  on conflict do nothing;
  update public.invitations set accepted_at = now() where email = v_inv.email;
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- Mỗi đường dẫn tệp chỉ có một bản ghi: tải lên trùng đường dẫn bị từ chối thay vì ghi đè tệp của người khác.
delete from storage.objects a using storage.objects b
where a.bucket_id = b.bucket_id and a.name = b.name and a.id > b.id;
create unique index if not exists storage_objects_bucket_name_idx on storage.objects (bucket_id, name);
