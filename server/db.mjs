// CSDL nhúng: PostgreSQL (PGlite) lưu trong thư mục dữ liệu, không cần dịch vụ ngoài.
// PGlite chỉ có một kết nối, nên mọi truy cập đi qua một khóa tuần tự (`connect`).
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const HERE = fileURLToPath(new URL('.', import.meta.url))

export async function openDb(dir) {
  const lite = new PGlite(dir ?? 'memory://')
  await lite.waitReady
  let tail = Promise.resolve()

  /** Lấy quyền dùng CSDL độc quyền cho đến khi gọi release(); dùng được như một "pool.connect()". */
  const connect = () => {
    let release
    const gate = new Promise((r) => (release = r))
    const turn = tail.then(() => ({
      query: (sql, params) => lite.query(sql, params),
      release: () => release(),
    }))
    tail = tail.then(() => gate)
    return turn
  }

  const db = {
    lite,
    connect,
    /** Chạy một việc với quyền độc quyền; tự nhả khóa. */
    async run(fn) {
      const c = await connect()
      try {
        return await fn(c)
      } finally {
        c.release()
      }
    },
    /** Giao dịch có commit/rollback tự động. */
    async tx(fn) {
      return db.run(async (c) => {
        await c.query('begin')
        try {
          const r = await fn(c)
          await c.query('commit')
          return r
        } catch (e) {
          await c.query('rollback').catch(() => {})
          throw e
        }
      })
    },
    /** Giao dịch chạy dưới vai trò `authenticated` của một người dùng — RLS áp dụng đầy đủ. */
    asUser(userId, fn) {
      return db.tx(async (c) => {
        await c.query('set local role authenticated')
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
        return fn(c)
      })
    },
    /** Đóng CSDL sau khi mọi việc đang chờ khóa (giao dịch, nhập dữ liệu, việc nền) đã xong. */
    close: () => db.run(() => lite.close()),
  }
  await migrate(db)
  return db
}

const MIGRATIONS_TABLE = `create table if not exists app_private.migrations (name text primary key, applied_at timestamptz not null default now());`

/**
 * Áp dụng bootstrap.sql (lần đầu) và các migration chưa chạy, theo thứ tự tên tệp. Mỗi bước nằm trong một giao dịch
 * cùng với dòng ghi sổ của nó, nên tiến trình bị dừng giữa chừng không để lại trạng thái "đã chạy nhưng chưa ghi sổ".
 */
async function migrate(db) {
  const atomic = (sql, label) =>
    db.lite.exec(`begin;\n${sql}\n;commit;`).catch(async (e) => {
      await db.lite.exec('rollback').catch(() => {})
      throw new Error(`${label} lỗi: ${e.message}`)
    })
  await db.run(async (c) => {
    const { rows } = await c.query(`select to_regnamespace('app_private') is not null as ready`)
    if (!rows[0].ready) await atomic((await readFile(join(HERE, 'bootstrap.sql'), 'utf8')) + '\n' + MIGRATIONS_TABLE, 'Khởi tạo CSDL')
    else await db.lite.exec(MIGRATIONS_TABLE)
    const done = new Set((await c.query('select name from app_private.migrations')).rows.map((r) => r.name))
    const files = (await readdir(join(HERE, 'migrations'))).filter((f) => /^[\w.-]+\.sql$/.test(f)).sort()
    for (const f of files) {
      if (done.has(f)) continue
      const sql = await readFile(join(HERE, 'migrations', f), 'utf8')
      await atomic(`${sql}\n;insert into app_private.migrations (name) values ('${f}');`, `Migration ${f}`)
      console.log(`[db] đã áp dụng ${f}`)
    }
  })
}
