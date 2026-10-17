// Xuất / nhập toàn bộ dữ liệu ứng dụng (schema public) dưới dạng JSON: { tên_bảng: [dòng, ...] }.
// Cùng định dạng với database/du-lieu-*.json. Mật khẩu và tệp đính kèm không nằm trong bản sao lưu.
/** Thứ tự phụ thuộc khóa ngoại: bảng cha trước, bảng con sau. */
export const TABLES = [
  'brands',
  'profiles',
  'invitations',
  'brand_members',
  'projects',
  'project_members',
  'recurring_task_rules',
  'tasks',
  'task_assignments',
  'subtasks',
  'checklist_items',
  'task_comments',
  'task_attachments',
  'task_approvals',
  'activity_logs',
  'goals',
  'goal_members',
  'goal_tasks',
  'goal_progress_logs',
  'content_items',
  'notifications',
  'app_settings',
]

const q = (name) => `"${name.replace(/"/g, '""')}"`
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Kiểm tra dữ liệu tải lên; trả về { data, tables, unknown } hoặc ném lỗi tiếng Việt. */
export function validateBackup(raw) {
  if (!isObj(raw)) throw new Error('Tệp không đúng định dạng: cần một đối tượng JSON gồm các bảng.')
  const data = {}
  const unknown = []
  for (const [k, v] of Object.entries(raw)) {
    if (!TABLES.includes(k)) {
      unknown.push(k)
      continue
    }
    if (!Array.isArray(v) || v.some((r) => !isObj(r))) throw new Error(`Bảng "${k}" phải là danh sách các dòng dữ liệu.`)
    data[k] = v
  }
  const tables = TABLES.filter((t) => t in data)
  if (!tables.length) throw new Error('Tệp không chứa bảng dữ liệu nào của ứng dụng.')
  return { data, tables, unknown }
}

/** Thay mọi chuỗi trùng khóa trong `map` (id cũ → id mới), kể cả trong mảng và JSON lồng nhau. */
export function remapIds(value, map) {
  if (!map.size) return value
  const walk = (v) => {
    if (typeof v === 'string') return map.get(v) ?? v
    if (Array.isArray(v)) return v.map(walk)
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value)
}

/** Đọc toàn bộ dữ liệu trong một giao dịch chỉ-đọc để có ảnh chụp nhất quán. */
export async function exportBackup(pool) {
  const client = await pool.connect()
  try {
    await client.query('begin transaction isolation level repeatable read read only')
    const out = {}
    for (const t of TABLES) {
      const { rows } = await client.query(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows from public.${q(t)} x`)
      out[t] = rows[0].rows
    }
    await client.query('commit')
    return out
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Cột khóa chính của một bảng trong schema public. */
export async function primaryKey(client, table) {
  const { rows } = await client.query(
    `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = ('public.' || quote_ident($1))::regclass and i.indisprimary`,
    [table],
  )
  return rows.map((r) => r.attname)
}

async function tableMeta(client, table) {
  const cols = await client.query(
    `select column_name, is_identity, is_generated from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table],
  )
  const identity = cols.rows.find((c) => c.is_identity === 'YES')
  return {
    columns: cols.rows.filter((c) => c.is_generated !== 'ALWAYS').map((c) => c.column_name),
    identityColumn: identity?.column_name ?? null,
    pk: await primaryKey(client, table),
  }
}

/** Câu lệnh upsert cho một lô dòng; chỉ ghi các cột có trong tệp VÀ có trong bảng hiện tại. */
export function buildUpsert(table, meta, rows) {
  const present = new Set(rows.flatMap((r) => Object.keys(r)))
  const cols = meta.columns.filter((c) => present.has(c))
  if (!cols.length) return null
  const list = cols.map(q).join(', ')
  const update = cols.filter((c) => !meta.pk.includes(c))
  const conflict = !meta.pk.length
    ? ''
    : update.length
      ? ` on conflict (${meta.pk.map(q).join(', ')}) do update set ${update.map((c) => `${q(c)} = excluded.${q(c)}`).join(', ')}`
      : ` on conflict (${meta.pk.map(q).join(', ')}) do nothing`
  return (
    `insert into public.${q(table)} (${list})${meta.identityColumn ? ' overriding system value' : ''} ` +
    `select ${list} from jsonb_populate_recordset(null::public.${q(table)}, $1::jsonb)${conflict}`
  )
}

/** Tìm id mới cho hồ sơ/thương hiệu đã có sẵn ở CSDL đích (khớp theo email / slug); tạo tài khoản còn thiếu. */
async function planIdMap(client, data, provisionUser) {
  const map = new Map()
  const created = []
  const profiles = data.profiles ?? []
  if (profiles.length) {
    for (const p of profiles) if (!p.email) throw new Error('Có hồ sơ nhân viên không có email.')
    const emails = profiles.map((p) => String(p.email).toLowerCase())
    const { rows } = await client.query('select id, lower(email) as email from auth.users where lower(email) = any($1)', [emails])
    const byEmail = new Map(rows.map((r) => [r.email, r.id]))
    for (const p of profiles) {
      const email = String(p.email).toLowerCase()
      let id = byEmail.get(email)
      if (!id) {
        id = await provisionUser(client, { email, full_name: p.full_name })
        created.push({ id, email, full_name: p.full_name })
      }
      if (id !== p.id) map.set(p.id, id)
    }
  }
  const brands = data.brands ?? []
  if (brands.length) {
    const { rows } = await client.query('select id, slug from public.brands')
    const bySlug = new Map(rows.map((r) => [r.slug, r.id]))
    for (const b of brands) {
      const id = bySlug.get(b.slug)
      if (id && id !== b.id) map.set(b.id, id)
    }
  }
  return { map, created }
}

/**
 * Nhập dữ liệu.
 *  - mode "merge": thêm mới / cập nhật theo khóa chính, giữ nguyên dòng không có trong tệp.
 *  - mode "replace": xóa sạch dữ liệu ứng dụng (trừ hồ sơ tài khoản) rồi nạp lại từ tệp.
 * Tài khoản chưa có ở nơi đích được tạo qua `provisionUser(client, { email, full_name }) -> id` (mật khẩu ngẫu nhiên,
 * người dùng đặt lại sau). Dữ liệu chạy trong một giao dịch: lỗi ở đâu thì hoàn tác hết. Trigger người dùng
 * tạm tắt để việc nhập không sinh thêm thông báo / nhật ký trùng.
 */
export async function importBackup(pool, raw, { mode = 'merge', provisionUser }) {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Chế độ nhập không hợp lệ.')
  const { data, tables, unknown } = validateBackup(raw)
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { map, created } = await planIdMap(client, data, provisionUser)
    for (const t of TABLES) await client.query(`alter table public.${q(t)} disable trigger user`)
    if (mode === 'replace') {
      await client.query(`truncate table ${TABLES.filter((t) => t !== 'profiles').map((t) => `public.${q(t)}`).join(', ')}`)
    }
    const counts = {}
    for (const t of tables) {
      const rows = remapIds(data[t], map)
      counts[t] = rows.length
      if (!rows.length) continue
      const meta = await tableMeta(client, t)
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const sql = buildUpsert(t, meta, batch)
        if (sql) await client.query(sql, [JSON.stringify(batch)])
      }
      if (meta.identityColumn) {
        const col = q(meta.identityColumn)
        await client.query(
          `select setval(pg_get_serial_sequence('public.${q(t)}', $1), coalesce(max(${col}), 1), max(${col}) is not null) from public.${q(t)}`,
          [meta.identityColumn],
        )
      }
    }
    for (const t of TABLES) await client.query(`alter table public.${q(t)} enable trigger user`)
    await client.query('commit')
    return { counts, createdUsers: created, remapped: map.size, ignored: unknown }
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
