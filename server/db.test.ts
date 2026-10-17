// Kiểm thử CSDL thật (PGlite trong bộ nhớ): migration, phân quyền RLS, quy trình duyệt, trigger, truy vấn qua API.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuth } from './auth.mjs'
import { openDb } from './db.mjs'
import { createFiles } from './files.mjs'
import { execQuery, execRpc } from './query.mjs'

let db: Awaited<ReturnType<typeof openDb>>

beforeAll(async () => {
  db = await openDb()
}, 60_000)
afterAll(() => db.close())

describe('kịch bản SQL phân quyền / quy trình', () => {
  it('chạy hết server/tests/10_rls_workflow_test.sql không lỗi', async () => {
    // Bỏ các lệnh meta của psql (\set, \pset...) — phần còn lại là SQL thuần.
    const sql = readFileSync(new URL('./tests/10_rls_workflow_test.sql', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => !l.startsWith('\\'))
      .join('\n')
    await db.lite.exec(sql)
  }, 120_000)
})

describe('đăng ký theo lời mời và truy vấn dưới RLS', () => {
  const auth = () => createAuth(db)
  it('email đã mời phải kèm đúng mã; người lạ ở trạng thái chưa kích hoạt', async () => {
    const admin = await db.tx(async (c) => {
      const id = await auth().upsertUser(c, { email: 'chu@x.vn', password: 'MatKhau123', full_name: 'Chủ' })
      await c.query('select public.bootstrap_admin($1)', ['chu@x.vn'])
      return id
    })
    const inv = (await db.asUser(admin, (c) => execQuery(c, { table: 'invitations', action: 'insert', select: 'token', values: { email: 'moi@x.vn', full_name: 'Mời', role: 'employee', brand_ids: [], invited_by: admin }, single: 'one' }))) as { token: string }
    await expect(auth().register({ email: 'moi@x.vn', password: 'MatKhau123', full_name: 'Mời' })).rejects.toThrow(/được mời/)
    const ok = await auth().register({ email: 'moi@x.vn', password: 'MatKhau123', full_name: 'Mời', invite: inv.token })
    const active = (await db.run((c) => c.query('select is_active from public.profiles where id = $1', [ok.user.id]))).rows[0].is_active
    expect(active).toBe(true)
    const la = await auth().register({ email: 'la@x.vn', password: 'MatKhau123', full_name: 'Lạ' })
    const rows = (await db.asUser(la.user.id, (c) => execQuery(c, { table: 'tasks', action: 'select', select: '*', filters: [], order: [] }))) as unknown[]
    expect(rows).toEqual([])
  })

  it('chặn bảng / hàm ngoài danh sách và thao tác thiếu điều kiện', async () => {
    const id = (await db.run((c) => c.query(`select id from public.profiles where email = 'chu@x.vn'`))).rows[0].id as string
    await expect(db.asUser(id, (c) => execQuery(c, { table: 'users', action: 'select', filters: [], order: [] }))).rejects.toThrow(/Bảng không được phép/)
    await expect(db.asUser(id, (c) => execQuery(c, { table: 'tasks', action: 'delete', filters: [], order: [] }))).rejects.toThrow(/điều kiện/)
    await expect(db.asUser(id, (c) => execRpc(c, 'bootstrap_admin', { p_email: 'a@b.c' }))).rejects.toThrow(/không được phép/)
  })

  it('vai trò ứng dụng không đọc được băm mật khẩu', async () => {
    const id = (await db.run((c) => c.query(`select id from public.profiles where email = 'chu@x.vn'`))).rows[0].id as string
    await expect(db.asUser(id, (c) => c.query('select password_hash from auth.users'))).rejects.toThrow(/permission denied/)
    await expect(db.asUser(id, (c) => c.query('select * from app_private.sessions'))).rejects.toThrow(/permission denied/)
  })
})

describe('lời mời cho tài khoản đã tồn tại', () => {
  it('người đăng ký chặn trước không được kích hoạt; chủ email nhận lời mời bằng mã sau khi đăng nhập', async () => {
    const auth = createAuth(db)
    const admin = (await db.run((c) => c.query(`select id from public.profiles where email = 'chu@x.vn'`))).rows[0].id as string
    // kẻ gian đăng ký trước bằng email người sắp được mời
    const squat = await auth.register({ email: 'sap-vao@x.vn', password: 'MatKhau123', full_name: 'Kẻ gian' })
    const inv = (await db.asUser(admin, (c) =>
      execQuery(c, { table: 'invitations', action: 'insert', select: 'token', values: { email: 'sap-vao@x.vn', full_name: 'Người mới', role: 'admin', brand_ids: [], invited_by: admin }, single: 'one' }),
    )) as { token: string }
    const profile = async () => (await db.run((c) => c.query('select is_active, role, full_name from public.profiles where id = $1', [squat.user.id]))).rows[0]
    expect((await profile()).is_active).toBe(false)
    await expect(db.asUser(squat.user.id, (c) => execRpc(c, 'accept_invitation', { p_token: 'doan-bua' }))).rejects.toThrow(/không hợp lệ/)
    expect((await profile()).is_active).toBe(false)
    // chủ email thật nhận thư mời: đăng ký báo đã có tài khoản và hướng dẫn đăng nhập
    await expect(auth.register({ email: 'sap-vao@x.vn', password: 'MatKhau123', full_name: 'Người mới', invite: inv.token })).rejects.toThrow(/lời mời sẽ được nhận/)
    await db.asUser(squat.user.id, (c) => execRpc(c, 'accept_invitation', { p_token: inv.token }))
    expect(await profile()).toMatchObject({ is_active: true, role: 'admin', full_name: 'Người mới' })
    await expect(db.asUser(squat.user.id, (c) => execRpc(c, 'accept_invitation', { p_token: inv.token }))).rejects.toThrow(/không hợp lệ/)
  })
})

describe('tệp đính kèm', () => {
  it('không cho tải lên đè đường dẫn đã có; tệp gốc giữ nguyên', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qlcv-files-'))
    try {
      const files = createFiles(db, dir)
      const admin = (await db.run((c) => c.query(`select id from public.profiles where email = 'chu@x.vn'`))).rows[0].id as string
      const brand = (await db.run((c) => c.query('select id from public.brands limit 1'))).rows[0].id as string
      const task = (await db.asUser(admin, (c) => execQuery(c, { table: 'tasks', action: 'insert', select: 'id', values: { brand_id: brand, title: 'Có tệp' }, single: 'one' }))) as { id: string }
      const path = `${task.id}/bao-cao.txt`
      await files.upload(admin, path, Buffer.from('ban goc'))
      await expect(files.upload(admin, path, Buffer.from('ban de'))).rejects.toThrow(/trùng đường dẫn/)
      expect(readFileSync(join(dir, path), 'utf8')).toBe('ban goc')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
