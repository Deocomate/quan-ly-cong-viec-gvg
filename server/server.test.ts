import { describe, expect, it } from 'vitest'
import { buildUpsert, remapIds, validateBackup } from './backup.mjs'
import { canSendMail, clientIp, loadConfig } from './config.mjs'
import { buildQuery } from './query.mjs'
import { invitationMail, resetPasswordMail } from './mail-templates.mjs'
import { createRateLimiter } from './rate-limit.mjs'

describe('validateBackup', () => {
  it('chấp nhận tệp xuất cũ và bỏ qua mục lạ', () => {
    const r = validateBackup({ brands: [{ id: 'a' }], tasks: [], luu_tru: [] })
    expect(r.tables).toEqual(['brands', 'tasks'])
    expect(r.unknown).toEqual(['luu_tru'])
  })
  it('từ chối dữ liệu sai dạng', () => {
    expect(() => validateBackup([])).toThrow()
    expect(() => validateBackup({ brands: {} })).toThrow(/brands/)
    expect(() => validateBackup({ x: [] })).toThrow(/không chứa bảng/)
  })
})

describe('remapIds', () => {
  it('thay id trong giá trị, mảng và JSON lồng nhau', () => {
    const map = new Map([['old', 'new']])
    const row = { created_by: 'old', brand_ids: ['old', 'keep'], details: { user_id: 'old', n: 1 }, title: 'old title' }
    expect(remapIds([row], map)).toEqual([{ created_by: 'new', brand_ids: ['new', 'keep'], details: { user_id: 'new', n: 1 }, title: 'old title' }])
  })
})

describe('buildUpsert', () => {
  const meta = { columns: ['id', 'name', 'extra'], identityColumn: null, pk: ['id'] }
  it('chỉ ghi cột có trong tệp và cập nhật khi trùng khóa', () => {
    const sql = buildUpsert('brands', meta, [{ id: '1', name: 'x', cu: 1 }])!
    expect(sql).toContain('("id", "name")')
    expect(sql).toContain('on conflict ("id") do update set "name" = excluded."name"')
    expect(sql).not.toContain('extra')
  })
  it('bảng chỉ có khóa chính thì bỏ qua dòng trùng; bảng identity dùng overriding', () => {
    expect(buildUpsert('brand_members', { columns: ['a', 'b'], identityColumn: null, pk: ['a', 'b'] }, [{ a: 1, b: 2 }])).toContain('do nothing')
    expect(buildUpsert('activity_logs', { ...meta, identityColumn: 'id' }, [{ id: 1 }])).toContain('overriding system value')
  })
})

describe('cấu hình', () => {
  const base = { APP_URL: 'https://app.vn/', DATA_DIR: '/d' }
  it('chuẩn hóa URL và bật email khi đủ biến', () => {
    const c = loadConfig({ ...base, SMTP_HOST: 'smtp.x', EMAIL_FROM: 'a@x.vn' })
    expect(c.appUrl).toBe('https://app.vn')
    expect(c.smtp).toMatchObject({ port: 587, secure: false })
    expect(canSendMail(c)).toBe(true)
    expect(c.dbDir).toMatch(/db$/)
  })
  it('quản trị viên đầu tiên lấy từ ADMIN_EMAIL', () => {
    expect(loadConfig({ ADMIN_EMAIL: ' Admin@X.vn ', ADMIN_PASSWORD: 'p' }).admin).toMatchObject({ email: 'admin@x.vn', password: 'p' })
    expect(loadConfig({}).admin).toBeNull()
  })
  it('cổng 465 mặc định dùng TLS; thiếu SMTP thì tắt email', () => {
    expect(loadConfig({ SMTP_HOST: 'h', SMTP_PORT: '465' }).smtp?.secure).toBe(true)
    expect(canSendMail(loadConfig(base))).toBe(false)
  })
})

describe('email giao dịch', () => {
  it('thoát ký tự HTML và chứa đường dẫn', () => {
    const m = resetPasswordMail({ name: '<b>An</b>', url: 'https://a.vn/x?a=1&b=2' })
    expect(m.html).not.toContain('<b>An</b>')
    expect(m.html).toContain('a=1&amp;b=2')
    expect(m.text).toContain('https://a.vn/x?a=1&b=2')
    expect(invitationMail({ name: 'B', inviter: 'Admin', url: 'https://a.vn' }).subject).toMatch(/mời/)
  })
})

describe('giới hạn tần suất', () => {
  it('chặn khi vượt ngưỡng và mở lại sau cửa sổ', () => {
    let t = 0
    const allow = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    expect([allow('a'), allow('a'), allow('a'), allow('b')]).toEqual([true, true, false, true])
    t = 1001
    expect(allow('a')).toBe(true)
  })
})

describe('địa chỉ IP sau proxy', () => {
  it('chỉ tin địa chỉ do proxy tin cậy nối vào, bỏ qua phần người dùng tự gửi', () => {
    // người dùng gửi "1.1.1.1", Traefik nối IP thật 9.9.9.9 vào cuối
    expect(clientIp('1.1.1.1, 9.9.9.9', '10.0.0.2', 1)).toBe('9.9.9.9')
    expect(clientIp('1.1.1.1, 9.9.9.9, 172.16.0.1', '10.0.0.2', 2)).toBe('9.9.9.9')
    expect(clientIp('1.1.1.1', '10.0.0.2', 0)).toBe('10.0.0.2')
    expect(clientIp(undefined, '10.0.0.2', 1)).toBe('10.0.0.2')
  })
  it('production mặc định tin 1 proxy, chạy thường thì không', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).trustProxy).toBe(1)
    expect(loadConfig({}).trustProxy).toBe(0)
    expect(loadConfig({ TRUST_PROXY: '2' }).trustProxy).toBe(2)
  })
})

describe('bộ lọc "in"', () => {
  it('giá trị null thành điều kiện "is null", không thành chuỗi "null"', () => {
    const q = buildQuery({ table: 'tasks', action: 'select', filters: [['project_id', 'in', ['a', null]]] })
    expect(q.sql).toContain('or t0."project_id" is null')
    expect(q.params).toEqual([JSON.stringify(['a'])])
  })
})
