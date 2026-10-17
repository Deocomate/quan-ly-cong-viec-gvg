// Dịch yêu cầu truy vấn của giao diện (bảng, bộ lọc, sắp xếp, nhúng bảng con...) sang SQL tham số hóa.
// Chạy dưới vai trò `authenticated` nên RLS, trigger và ràng buộc của CSDL quyết định quyền — ở đây chỉ kiểm tra
// tên bảng / cột / hàm nằm trong danh sách cho phép và dựng SQL an toàn.
import { primaryKey, TABLES } from './backup.mjs'

export class QueryError extends Error {
  constructor(message, code = 'bad_request') {
    super(message)
    this.code = code
    this.status = 400
  }
}

export const RPC_FUNCTIONS = new Set([
  'accept_invitation',
  'submit_task',
  'review_task',
  'set_task_assignees',
  'record_goal_progress',
  'purge_demo_data',
  'run_scheduled_jobs',
  'generate_recurring_tasks',
])

const VOID_FUNCTIONS = new Set(['set_task_assignees', 'record_goal_progress', 'accept_invitation'])
const IDENT = /^[a-z_][a-z0-9_]*$/
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }
const ident = (s) => {
  if (typeof s !== 'string' || !IDENT.test(s)) throw new QueryError(`Tên không hợp lệ: ${String(s).slice(0, 40)}`)
  return `"${s}"`
}
const tableOf = (t) => {
  if (!TABLES.includes(t)) throw new QueryError(`Bảng không được phép: ${String(t).slice(0, 40)}`)
  return `public.${ident(t)}`
}
const singular = (t) => t.replace(/s$/, '')

/** "*, bảng_con(cột, cột)" → danh sách cột SQL; bảng con nối qua khóa `<bảng_cha_số_ít>_id`. */
export function selectList(select, alias, table) {
  const sel = !select || select === '*' ? '*' : select
  return sel
    .split(/,(?![^()]*\))/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (s === '*') return `${alias}.*`
      const m = /^([a-z_][a-z0-9_]*)\(([^)]*)\)$/.exec(s)
      if (m) {
        const child = m[1]
        tableOf(child)
        const cols = m[2].split(',').map((c) => c.trim())
        const pairs = cols.map((c) => `'${c}', x.${ident(c)}`).join(', ')
        return `(select coalesce(jsonb_agg(jsonb_build_object(${pairs})), '[]'::jsonb) from public.${ident(child)} x where x.${ident(`${singular(table)}_id`)} = ${alias}.id) as ${ident(child)}`
      }
      return `${alias}.${ident(s)}`
    })
    .join(', ')
}

function whereClause(filters, params, alias = 't0') {
  const conds = (filters ?? []).map(([col, op, val]) => {
    const c = `${alias}.${ident(col)}`
    if (op === 'is') {
      if (val === null) return `${c} is null`
      if (val === true || val === false) return `${c} is ${val}`
      throw new QueryError('Giá trị "is" không hợp lệ')
    }
    if (op === 'in') {
      if (!Array.isArray(val)) throw new QueryError('"in" cần một danh sách')
      const values = val.filter((v) => v !== null && v !== undefined)
      params.push(JSON.stringify(values.map(String)))
      const cond = `${c}::text in (select jsonb_array_elements_text($${params.length}::text::jsonb))`
      return values.length < val.length ? `(${cond} or ${c} is null)` : cond
    }
    if (!OPS[op]) throw new QueryError(`Phép lọc không hỗ trợ: ${op}`)
    params.push(val)
    return `${c} ${OPS[op]} $${params.length}`
  })
  return conds.length ? `where ${conds.join(' and ')}` : ''
}

function orderClause(order) {
  if (!order?.length) return ''
  return (
    'order by ' +
    order
      .map((o) => `t0.${ident(o.col)} ${o.asc === false ? 'desc' : 'asc'}${o.nullsFirst === true ? ' nulls first' : o.nullsFirst === false ? ' nulls last' : ''}`)
      .join(', ')
  )
}

const rowsOf = (cte, select, table) =>
  select ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as v from (select ${selectList(select, 't0', table)} from ${cte} t0) t` : `select '[]'::jsonb as v`

/** Dựng câu lệnh SQL cho một yêu cầu; `pk` là danh sách cột khóa chính (chỉ cần cho upsert). */
export function buildQuery(req, pk = []) {
  const { table, action, select = null, filters = [], order = [], values = null } = req
  const T = tableOf(table)
  const params = []

  if (action === 'select') {
    const limit = Number.isInteger(req.limit) && req.limit > 0 ? `limit ${Math.min(req.limit, 5000)}` : ''
    const where = whereClause(filters, params)
    return {
      sql: `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as v from (select ${selectList(select, 't0', table)} from ${T} t0 ${where} ${orderClause(order)} ${limit}) t`,
      params,
    }
  }

  if (action === 'insert' || action === 'upsert') {
    const rows = Array.isArray(values) ? values : [values]
    if (!rows.length || rows.some((r) => r === null || typeof r !== 'object' || Array.isArray(r))) throw new QueryError('Dữ liệu thêm không hợp lệ')
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    if (!cols.length) throw new QueryError('Dữ liệu thêm trống')
    const list = cols.map(ident).join(', ')
    params.push(JSON.stringify(rows))
    let conflict = ''
    if (action === 'upsert') {
      const upd = cols.filter((c) => !pk.includes(c))
      conflict = ` on conflict (${pk.map(ident).join(', ')}) do ${upd.length ? `update set ${upd.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ')}` : 'nothing'}`
    }
    return {
      sql: `with r as (insert into ${T} (${list}) select ${list} from jsonb_populate_recordset(null::${T}, $1::text::jsonb)${conflict} returning *) ${rowsOf('r', select, table)}`,
      params,
    }
  }

  if (action === 'update') {
    if (!filters.length) throw new QueryError('Cập nhật cần có điều kiện lọc')
    if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length) throw new QueryError('Dữ liệu cập nhật không hợp lệ')
    params.push(JSON.stringify(values))
    const sets = Object.keys(values).map((c) => `${ident(c)} = s.${ident(c)}`).join(', ')
    const where = whereClause(filters, params)
    return {
      sql: `with r as (update ${T} t0 set ${sets} from (select * from jsonb_populate_record(null::${T}, $1::text::jsonb)) s ${where} returning t0.*) ${rowsOf('r', select, table)}`,
      params,
    }
  }

  if (action === 'delete') {
    if (!filters.length) throw new QueryError('Xóa cần có điều kiện lọc')
    const where = whereClause(filters, params)
    return { sql: `with r as (delete from ${T} t0 ${where} returning t0.*) ${rowsOf('r', select, table)}`, params }
  }

  throw new QueryError(`Thao tác không hỗ trợ: ${action}`)
}

/** Chạy yêu cầu trên một kết nối đã đặt vai trò người dùng. Trả về `data` theo kiểu single / maybeSingle nếu có. */
const pkCache = new Map() // khóa chính không đổi khi máy chủ đang chạy (migration chỉ áp dụng lúc khởi động)

export async function execQuery(client, req) {
  let pk = []
  if (req.action === 'upsert') {
    tableOf(req.table)
    if (!pkCache.has(req.table)) pkCache.set(req.table, await primaryKey(client, req.table))
    pk = pkCache.get(req.table)
  }
  const { sql, params } = buildQuery(req, pk)
  const rows = (await client.query(sql, params)).rows[0].v
  if (req.single === 'one' || req.single === 'maybe') {
    if (rows.length > 1 || (req.single === 'one' && rows.length !== 1)) {
      throw Object.assign(new QueryError('Yêu cầu một dòng nhưng nhận được ' + rows.length, 'PGRST116'), { details: `${rows.length} dòng` })
    }
    return rows[0] ?? null
  }
  return rows
}

/** Gọi hàm RPC (đã nằm trong danh sách cho phép) với đối số đặt tên p_*. */
export async function execRpc(client, fn, args = {}) {
  if (!RPC_FUNCTIONS.has(fn)) throw new QueryError(`Hàm không được phép: ${String(fn).slice(0, 40)}`)
  const names = Object.keys(args ?? {})
  const values = names.map((n) => {
    if (!/^p_[a-z_]+$/.test(n)) throw new QueryError(`Tên đối số không hợp lệ: ${n}`)
    return args[n]
  })
  const call = names.map((n, i) => `${n} => $${i + 1}`).join(', ')
  const expr = `public.${ident(fn)}(${call})`
  if (VOID_FUNCTIONS.has(fn)) {
    await client.query(`select ${expr}`, values)
    return null
  }
  return (await client.query(`select to_jsonb(${expr}) as v`, values)).rows[0].v
}
