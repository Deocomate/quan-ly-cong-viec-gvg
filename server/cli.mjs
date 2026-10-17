// Dòng lệnh quản trị, chạy trực tiếp trên thư mục dữ liệu (DATA_DIR). Phải DỪNG máy chủ trước vì CSDL nhúng chỉ cho một tiến trình.
//   node server/cli.mjs export [tệp.json]
//   node server/cli.mjs import tệp.json [--replace] [--notify]
//   node server/cli.mjs create-admin <email> <mật_khẩu> [họ tên]
//   node server/cli.mjs set-password <email> <mật_khẩu>
//   node server/cli.mjs seed-demo | remove-demo
import { readFileSync, writeFileSync } from 'node:fs'
import { exportBackup } from './backup.mjs'
import { loadConfig, loadEnvFile } from './config.mjs'
import { backupFileName, restoreFromData } from './restore.mjs'
import { createServices } from './services.mjs'

loadEnvFile()

const [cmd, ...rest] = process.argv.slice(2)
const flags = new Set(rest.filter((a) => a.startsWith('--')))
const args = rest.filter((a) => !a.startsWith('--'))
const USAGE = `Cách dùng:
  node server/cli.mjs export [tệp.json]
  node server/cli.mjs import tệp.json [--replace] [--notify]
  node server/cli.mjs create-admin <email> <mật_khẩu> [họ tên]
  node server/cli.mjs set-password <email> <mật_khẩu>
  node server/cli.mjs seed-demo | remove-demo`

const DEMO = [
  { email: 'demo.admin@example.com', full_name: 'Quản trị viên mẫu' },
  { email: 'demo.anh@example.com', full_name: 'Nguyễn Minh Anh' },
  { email: 'demo.bao@example.com', full_name: 'Trần Quốc Bảo' },
  { email: 'demo.ha@example.com', full_name: 'Lê Thu Hà' },
  { email: 'demo.long@example.com', full_name: 'Phạm Đức Long' },
]

const needs = { export: 0, import: 1, 'create-admin': 2, 'set-password': 2, 'seed-demo': 0, 'remove-demo': 0 }
if (!(cmd in needs) || args.length < needs[cmd]) {
  console.error(USAGE)
  process.exit(2)
}

const svc = await createServices(loadConfig())
try {
  if (cmd === 'export') {
    const out = args[0] ?? backupFileName()
    const data = await exportBackup(svc.db)
    writeFileSync(out, JSON.stringify(data, null, 2))
    console.log(`Đã xuất ${out}:`, Object.fromEntries(Object.entries(data).map(([t, r]) => [t, r.length])))
  } else if (cmd === 'import') {
    const result = await restoreFromData(svc, JSON.parse(readFileSync(args[0], 'utf8')), { mode: flags.has('--replace') ? 'replace' : 'merge', notify: flags.has('--notify') })
    console.log('Đã nhập:', result.counts)
    console.log(`Bản sao lưu trước khi nhập: ${result.snapshot}`)
    if (result.createdUsers.length) {
      console.log(`Đã tạo lại ${result.createdUsers.length} tài khoản (chưa có mật khẩu):`, result.createdUsers.map((u) => u.email).join(', '))
      console.log(result.mails ? `Đã gửi ${result.mails.sent} thư đặt mật khẩu, lỗi ${result.mails.failed}.` : 'Dùng "set-password" hoặc "Quên mật khẩu" ở trang đăng nhập để đặt mật khẩu (hoặc chạy lại với --notify khi đã cấu hình SMTP).')
    }
    if (result.ignored.length) console.log('Bỏ qua các mục không thuộc ứng dụng:', result.ignored.join(', '))
  } else if (cmd === 'create-admin') {
    await svc.db.tx(async (c) => {
      await svc.auth.upsertUser(c, { email: args[0], password: args[1], full_name: args[2] })
      await c.query('select public.bootstrap_admin($1)', [args[0]])
    })
    console.log(`Đã đặt ${args[0].toLowerCase()} làm quản trị viên.`)
  } else if (cmd === 'set-password') {
    const email = args[0].toLowerCase()
    const found = await svc.db.run((c) => c.query('select 1 from auth.users where email = $1', [email]))
    if (!found.rows.length) throw new Error(`Không có tài khoản ${email}.`)
    await svc.db.tx((c) => svc.auth.upsertUser(c, { email, password: args[1] }))
    console.log(`Đã đặt lại mật khẩu cho ${email}.`)
  } else if (cmd === 'seed-demo') {
    const password = process.env.DEMO_PASSWORD ?? 'Demo@12345'
    await svc.db.tx(async (c) => {
      const ids = []
      for (const d of DEMO) {
        const id = await svc.auth.upsertUser(c, { ...d, password })
        await c.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"is_demo": true}'::jsonb where id = $1`, [id])
        await c.query('update public.profiles set is_demo = true where id = $1', [id])
        ids.push(id)
      }
      const seeded = await c.query('select public.seed_demo_data($1, $2::uuid[]) as v', [ids[0], ids.slice(1)])
      const extra = await c.query('select public.seed_demo_phase3($1::uuid[]) as v', [ids.slice(1)])
      console.log('Đã tạo dữ liệu mẫu:', JSON.stringify(seeded.rows[0].v), JSON.stringify(extra.rows[0].v))
    })
    console.log(`Đăng nhập thử: ${DEMO[1].email} / ${password}`)
  } else if (cmd === 'remove-demo') {
    await svc.db.tx(async (c) => {
      console.log('Đã xóa:', JSON.stringify((await c.query('select public.purge_demo_data_service() as v')).rows[0].v))
      const r = await c.query(`delete from auth.users where email = any($1::text[]) or coalesce(raw_user_meta_data ->> 'is_demo', 'false') = 'true' returning email`, [DEMO.map((d) => d.email)])
      console.log('Đã xóa tài khoản:', r.rows.map((x) => x.email).join(', ') || '(không có)')
    })
  }
} catch (e) {
  console.error('Lỗi:', e.message)
  process.exitCode = 1
} finally {
  await svc.close()
}
