/**
 * Kết nối với máy chủ ứng dụng (server/index.mjs): xác thực, truy vấn dữ liệu, tệp đính kèm.
 * `db()` có dạng quen thuộc `from(...).select().eq()` — mỗi lệnh được gửi dưới dạng JSON tới /api/db,
 * máy chủ chạy dưới quyền của người đăng nhập nên các chính sách RLS trong CSDL quyết định ai thấy / sửa gì.
 */

const TOKEN_KEY = 'qlcv-session'
const INVITE_KEY = 'qlcv-pending-invite'

export interface Session {
  user: { id: string; email: string }
}
export interface DbError {
  message: string
  code?: string
  details?: string | null
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DbResult<T = any> {
  data: T
  error: DbError | null
}

/** Máy chủ không có tính năng này (chưa cấu hình SMTP, hoặc đang chạy `npm run dev` không có API). */
export class ApiUnavailable extends Error {}

// ---------- Phiên đăng nhập ----------
const store = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (v: string | null) => {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* trình duyệt chặn lưu trữ: phiên chỉ tồn tại trong bộ nhớ */
    }
  },
}

let token: string | null = store.get()
let session: Session | null = null
const listeners = new Set<(s: Session | null) => void>()

function setSession(next: { token: string; user: Session['user'] } | null) {
  token = next?.token ?? null
  session = next ? { user: next.user } : null
  store.set(token)
  listeners.forEach((l) => l(session))
}

interface RequestInit2 {
  method?: string
  body?: unknown
  rawBody?: BodyInit
  headers?: Record<string, string>
  auth?: boolean
}

async function request<T>(path: string, init: RequestInit2 = {}): Promise<T> {
  const headers: Record<string, string> = { ...init.headers }
  if (token && init.auth !== false) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined = init.rawBody
  if (body === undefined && init.body !== undefined) {
    body = JSON.stringify(init.body)
    headers['Content-Type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetch(path, { method: init.method ?? (body === undefined ? 'GET' : 'POST'), headers, body })
  } catch {
    throw Object.assign(new Error('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'), { code: 'network' })
  }
  if (res.status === 501 || !res.headers.get('content-type')?.includes('application/json')) throw new ApiUnavailable()
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string; details?: string | null }
  if (!res.ok) {
    if (res.status === 401 && token && data.code === 'unauthenticated') setSession(null)
    throw Object.assign(new Error(data.error || 'Đã có lỗi xảy ra.'), { code: data.code, details: data.details })
  }
  return data
}

/** Gọi API máy chủ (tự gắn phiên đăng nhập). */
export const api = <T>(path: string, init: RequestInit2 = {}) => request<T>(path, init)

export const auth = {
  current: () => session,
  /** Nạp lại phiên đã lưu khi mở ứng dụng; trả về null nếu hết hạn. */
  async restore(): Promise<Session | null> {
    if (!token) return null
    try {
      const { user } = await request<{ user: Session['user'] }>('/api/auth/me')
      setSession({ token, user })
    } catch (e) {
      if (!(e instanceof ApiUnavailable) && (e as { code?: string }).code !== 'network') setSession(null)
      else throw e
    }
    return session
  },
  subscribe(cb: (s: Session | null) => void) {
    listeners.add(cb)
    return () => void listeners.delete(cb)
  },
  async signIn(email: string, password: string) {
    setSession(await request('/api/auth/login', { body: { email, password }, auth: false }))
  },
  async signUp(input: { email: string; password: string; full_name: string; invite?: string | null }) {
    setSession(await request('/api/auth/register', { body: input, auth: false }))
  },
  async signOut() {
    try {
      await request('/api/auth/logout', { method: 'POST' })
    } catch {
      /* đăng xuất cục bộ dù máy chủ không phản hồi */
    }
    setSession(null)
  },
  async changePassword(password: string) {
    await request('/api/auth/password', { body: { password } })
  },
  /** Gửi email đặt lại mật khẩu. Ném ApiUnavailable nếu máy chủ chưa cấu hình SMTP. */
  forgotPassword: (email: string) => request('/api/auth/forgot', { body: { email }, auth: false }),
  async resetPassword(resetToken: string, password: string) {
    setSession(await request('/api/auth/reset', { body: { token: resetToken, password }, auth: false }))
  },
  /** Ghi nhớ mã mời từ liên kết để nhận sau khi người đã có tài khoản đăng nhập. */
  rememberInvite(inviteToken: string | null) {
    if (!inviteToken) return
    try {
      sessionStorage.setItem(INVITE_KEY, inviteToken)
    } catch {
      /* bỏ qua */
    }
  },
  takeInvite(): string | null {
    try {
      const v = sessionStorage.getItem(INVITE_KEY)
      sessionStorage.removeItem(INVITE_KEY)
      return v
    } catch {
      return null
    }
  },
}

// ---------- Truy vấn dữ liệu ----------
type Filter = [string, string, unknown]
interface QueryRequest {
  table: string
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  select: string | null
  filters: Filter[]
  order: { col: string; asc: boolean; nullsFirst?: boolean }[]
  limit?: number
  values?: unknown
  single: 'one' | 'maybe' | null
}

async function send<T>(path: string, body: unknown): Promise<DbResult<T>> {
  try {
    const { data } = await request<{ data: T }>(path, { body })
    return { data, error: null }
  } catch (e) {
    if (e instanceof ApiUnavailable) return { data: null as T, error: { message: 'Máy chủ không phản hồi đúng định dạng.' } }
    const err = e as Error & { code?: string; details?: string | null }
    return { data: null as T, error: { message: err.message, code: err.code, details: err.details } }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class Query implements PromiseLike<DbResult<any>> {
  private req: QueryRequest
  constructor(table: string) {
    this.req = { table, action: 'select', select: '*', filters: [], order: [], single: null }
  }
  select(columns = '*') {
    this.req.select = columns
    return this
  }
  insert(values: unknown) {
    return this.write('insert', values)
  }
  upsert(values: unknown) {
    return this.write('upsert', values)
  }
  update(values: unknown) {
    return this.write('update', values)
  }
  delete() {
    return this.write('delete')
  }
  private write(action: QueryRequest['action'], values?: unknown) {
    this.req.action = action
    this.req.values = values
    this.req.select = null // chỉ trả dữ liệu khi gọi .select() sau đó
    return this
  }
  private filter(col: string, op: string, value: unknown) {
    this.req.filters.push([col, op, value])
    return this
  }
  eq(c: string, v: unknown) {
    return this.filter(c, 'eq', v)
  }
  neq(c: string, v: unknown) {
    return this.filter(c, 'neq', v)
  }
  gt(c: string, v: unknown) {
    return this.filter(c, 'gt', v)
  }
  gte(c: string, v: unknown) {
    return this.filter(c, 'gte', v)
  }
  lt(c: string, v: unknown) {
    return this.filter(c, 'lt', v)
  }
  lte(c: string, v: unknown) {
    return this.filter(c, 'lte', v)
  }
  is(c: string, v: null | boolean) {
    return this.filter(c, 'is', v)
  }
  in(c: string, v: unknown[]) {
    return this.filter(c, 'in', v)
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.req.order.push({ col, asc: opts.ascending !== false, nullsFirst: opts.nullsFirst })
    return this
  }
  limit(n: number) {
    this.req.limit = n
    return this
  }
  single() {
    this.req.single = 'one'
    return this
  }
  maybeSingle() {
    this.req.single = 'maybe'
    return this
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<R1 = DbResult<any>, R2 = never>(ok?: ((v: DbResult<any>) => R1 | PromiseLike<R1>) | null, bad?: ((r: unknown) => R2 | PromiseLike<R2>) | null) {
    return send('/api/db', this.req).then(ok, bad)
  }
}

export const STORAGE_BUCKET = 'task-files'

const client = {
  from: (table: string) => new Query(table),
  rpc: (fn: string, args: Record<string, unknown> = {}) => send('/api/rpc', { fn, args }),
  storage: {
    from: (_bucket: string) => ({
      async upload(path: string, file: Blob, opts: { contentType?: string } = {}): Promise<DbResult<null>> {
        try {
          await request(`/api/files/upload?path=${encodeURIComponent(path)}`, { rawBody: file, headers: { 'Content-Type': opts.contentType || 'application/octet-stream' } })
          return { data: null, error: null }
        } catch (e) {
          return { data: null, error: { message: (e as Error).message } }
        }
      },
      async remove(paths: string[]): Promise<DbResult<null>> {
        const r = await send('/api/files/remove', { paths })
        return { data: null, error: r.error }
      },
      async createSignedUrl(path: string, _seconds: number): Promise<DbResult<{ signedUrl: string }>> {
        try {
          const { url } = await request<{ url: string }>('/api/files/sign', { body: { path } })
          return { data: { signedUrl: url }, error: null }
        } catch (e) {
          return { data: null as never, error: { message: (e as Error).message } }
        }
      },
    }),
  },
}

/** Máy khách dữ liệu dùng trong toàn ứng dụng. */
export const db = () => client

/** Chuyển lỗi kỹ thuật thành thông báo tiếng Việt dễ hiểu. */
export function friendlyError(err: unknown): string {
  const msg =
    typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '')
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(msg)) return msg
  if (/row-level security|permission denied|42501/i.test(msg)) return 'Bạn không có quyền thực hiện thao tác này.'
  if (/duplicate key/i.test(msg)) return 'Dữ liệu đã tồn tại.'
  if (/failed to fetch|network/i.test(msg)) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'
  return msg || 'Đã có lỗi xảy ra.'
}

/** Tải bản sao lưu JSON về máy (quản trị viên). */
export async function downloadBackup(): Promise<void> {
  const res = await fetch('/api/admin/export', { headers: { Authorization: `Bearer ${token ?? ''}` } })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Không xuất được dữ liệu.')
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'du-lieu.json'
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}
