// Máy chủ ứng dụng: phục vụ SPA đã dựng + API (xác thực, dữ liệu, tệp, email, sao lưu) + việc chạy nền.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AuthError } from './auth.mjs'
import { exportBackup } from './backup.mjs'
import { clientIp, loadConfig, loadEnvFile } from './config.mjs'
import { FileError, MAX_FILE_BYTES } from './files.mjs'
import { execQuery, execRpc, QueryError } from './query.mjs'
import { createRateLimiter } from './rate-limit.mjs'
import { backupFileName, restoreFromData } from './restore.mjs'
import { createServices } from './services.mjs'
import { startWorkers } from './worker.mjs'

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const MAX_IMPORT_BYTES = 64 * 1024 * 1024
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
}
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

loadEnvFile()
const config = loadConfig()
const svc = await createServices(config)
await svc.ensureAdmin()
const { auth, db, files } = svc

const forgotLimit = createRateLimiter({ max: 5, windowMs: 15 * 60_000 })
const loginLimit = createRateLimiter({ max: 10, windowMs: 15 * 60_000 })
const loginIpLimit = createRateLimiter({ max: 30, windowMs: 15 * 60_000 })
const registerLimit = createRateLimiter({ max: 10, windowMs: 60 * 60_000 })
const ipLimit = createRateLimiter({ max: 60, windowMs: 60 * 60_000 })

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS })
  res.end(JSON.stringify(body))
}
const fail = (res, status, error, extra = {}) => json(res, status, { error, ...extra })
const tooFast = (res) => fail(res, 429, 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.')

async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw Object.assign(new Error('Nội dung quá lớn.'), { status: 413 })
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

async function readJson(req, limit = 1024 * 1024) {
  const raw = await readBody(req, limit)
  try {
    return JSON.parse(raw.toString('utf8') || '{}')
  } catch {
    throw Object.assign(new Error('Nội dung không phải JSON hợp lệ.'), { status: 400 })
  }
}

const ipOf = (req) => clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress, config.trustProxy)
const emailKey = (e) => String(e ?? '').trim().toLowerCase()
const bearer = (req) => /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? null
const baseUrl = (req) => config.appUrl || `${req.headers['x-forwarded-proto'] ?? 'http'}://${req.headers['x-forwarded-host'] ?? req.headers.host}`

/** Lỗi từ CSDL → phản hồi giữ nguyên mã SQLSTATE để giao diện dịch sang tiếng Việt. */
const dbError = (res, e) => fail(res, e.status ?? 400, e.message, { code: e.code, details: e.detail ?? e.details ?? null })

async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`
  const ip = ipOf(req)

  if (route === 'GET /api/status') return json(res, 200, { mail: svc.mailReady })

  // ---------- Không cần đăng nhập ----------
  if (route === 'POST /api/auth/login') {
    const b = await readJson(req, 4096)
    const key = `${ip}|${emailKey(b.email)}`
    // Chỉ đếm lần đăng nhập sai: nhiều người chung một IP (Wi-Fi văn phòng, mạng di động) không chặn nhau khi đăng nhập đúng
    if (loginIpLimit.blocked(ip) || loginLimit.blocked(key)) return tooFast(res)
    try {
      return json(res, 200, await auth.login(b.email, b.password))
    } catch (e) {
      if (e.status === 401) {
        loginIpLimit.hit(ip)
        loginLimit.hit(key)
      }
      throw e
    }
  }
  if (route === 'POST /api/auth/register') {
    if (!registerLimit(ip)) return tooFast(res)
    return json(res, 200, await auth.register(await readJson(req, 8192)))
  }
  if (route === 'POST /api/auth/forgot') {
    if (!svc.mailReady) return fail(res, 501, 'mail_not_configured')
    const email = emailKey((await readJson(req, 4096)).email)
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Email không hợp lệ.')
    if (!ipLimit(ip) || !forgotLimit(email)) return tooFast(res)
    try {
      await svc.sendPasswordReset(email)
    } catch (e) {
      console.error('[forgot]', e?.message ?? e)
      return fail(res, 502, 'Không gửi được email. Vui lòng thử lại sau.')
    }
    return json(res, 200, { ok: true }) // luôn trả như nhau để không lộ email nào có tài khoản
  }
  if (route === 'POST /api/auth/reset') {
    if (!ipLimit(ip)) return tooFast(res)
    const b = await readJson(req, 4096)
    return json(res, 200, await auth.resetPassword(b.token, b.password))
  }
  if (route === 'GET /api/files/download') {
    const q = url.searchParams
    const f = await files.resolveDownload(q.get('p') ?? '', q.get('e'), q.get('s'))
    const info = await stat(f.file).catch(() => null)
    if (!info) return fail(res, 404, 'Tệp không còn trên máy chủ.')
    res.writeHead(200, {
      'Content-Type': f.mime,
      'Content-Length': info.size,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'Cache-Control': 'private, no-store',
      ...SECURITY_HEADERS,
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    })
    return createReadStream(f.file).pipe(res)
  }

  // ---------- Cần đăng nhập ----------
  const token = bearer(req)
  const user = await auth.userFromToken(token)
  if (!user) return fail(res, 401, 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', { code: 'unauthenticated' })

  if (route === 'GET /api/auth/me') return json(res, 200, { user })
  if (route === 'POST /api/auth/logout') {
    await auth.logout(token)
    return json(res, 200, { ok: true })
  }
  if (route === 'POST /api/auth/password') {
    await auth.changePassword(user.id, token, (await readJson(req, 4096)).password)
    return json(res, 200, { ok: true })
  }

  if (route === 'POST /api/db') {
    const b = await readJson(req)
    try {
      return json(res, 200, { data: await db.asUser(user.id, (c) => execQuery(c, b)) })
    } catch (e) {
      return dbError(res, e)
    }
  }

  if (route === 'POST /api/rpc') {
    const b = await readJson(req)
    try {
      return json(res, 200, { data: await db.asUser(user.id, (c) => execRpc(c, b.fn, b.args)) })
    } catch (e) {
      return dbError(res, e)
    }
  }

  if (route === 'POST /api/files/upload') {
    const path = url.searchParams.get('path') ?? ''
    await files.upload(user.id, path, await readBody(req, MAX_FILE_BYTES + 1024))
    return json(res, 200, { ok: true })
  }
  if (route === 'POST /api/files/sign') return json(res, 200, { url: await files.sign(user.id, String((await readJson(req, 4096)).path ?? '')) })
  if (route === 'POST /api/files/remove') return json(res, 200, { removed: await files.remove(user.id, (await readJson(req, 65536)).paths ?? []) })

  // ---------- Chỉ quản trị viên ----------
  if (!route.includes('/admin/') && route !== 'POST /api/invitations/send') return fail(res, 404, 'Không tìm thấy.')
  const admin = await svc.requireAdmin(user.id)
  if (!admin) return fail(res, 403, 'Chỉ quản trị viên được thực hiện thao tác này.')

  if (route === 'POST /api/invitations/send') {
    if (!svc.mailReady) return fail(res, 501, 'mail_not_configured')
    const email = String((await readJson(req, 4096)).email ?? '').trim().toLowerCase()
    try {
      await svc.sendInvitation(email, admin.full_name)
    } catch (e) {
      return fail(res, 400, e.message)
    }
    return json(res, 200, { ok: true })
  }

  if (route === 'POST /api/admin/reset-link') {
    const r = await svc.adminResetLink(String((await readJson(req, 4096)).user_id ?? ''), baseUrl(req))
    return r ? json(res, 200, r) : fail(res, 404, 'Không tìm thấy tài khoản.')
  }

  if (route === 'GET /api/admin/export') {
    const body = JSON.stringify(await exportBackup(db), null, 2)
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${backupFileName()}"`,
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
    })
    return res.end(body)
  }

  if (route === 'POST /api/admin/import') {
    const mode = url.searchParams.get('mode') === 'replace' ? 'replace' : 'merge'
    const raw = await readJson(req, MAX_IMPORT_BYTES)
    try {
      const result = await restoreFromData(svc, raw, { mode, notify: url.searchParams.get('notify') === '1' })
      console.log(`[import] ${admin.id} chế độ ${mode}:`, JSON.stringify(result.counts))
      return json(res, 200, result)
    } catch (e) {
      console.error('[import]', e?.message ?? e)
      return fail(res, 400, e?.message ?? 'Nhập dữ liệu thất bại.')
    }
  }

  return fail(res, 404, 'Không tìm thấy.')
}

async function serveStatic(req, res, url) {
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return fail(res, 400, 'Đường dẫn không hợp lệ.')
  }
  let file = resolve(join(DIST, normalize(pathname)))
  if (file !== DIST && !file.startsWith(DIST + sep)) return fail(res, 403, 'Cấm truy cập.')
  let info = await stat(file).catch(() => null)
  if (info?.isDirectory()) info = null
  if (!info) {
    if (extname(url.pathname) !== '') return fail(res, 404, 'Không tìm thấy.')
    file = join(DIST, 'index.html') // SPA: mọi đường dẫn khác trả về index.html
    info = await stat(file).catch(() => null)
    if (!info) return fail(res, 503, 'Chưa có bản dựng giao diện (chạy npm run build).')
  }
  const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': cache, ...SECURITY_HEADERS })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/healthz') return json(res, 200, { ok: true })
    if (url.pathname.startsWith('/api/')) return await api(req, res, url)
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Phương thức không hỗ trợ.')
    return await serveStatic(req, res, url)
  } catch (e) {
    const known = e instanceof AuthError || e instanceof FileError || e instanceof QueryError || e.status
    if (!res.headersSent) fail(res, e.status ?? 500, known ? e.message : 'Lỗi máy chủ.', e.code ? { code: e.code } : {})
    else res.end()
    if (!known) console.error('[server]', e)
  }
})

server.listen(config.port, '0.0.0.0', () => {
  console.log(`Trung tâm điều hành đang chạy ở cổng ${config.port} · dữ liệu: ${config.dataDir} · email: ${svc.mailReady ? 'bật' : 'tắt'}`)
  stopWorkers = startWorkers(svc)
})

let stopWorkers = () => {}
let stopping = false
/**
 * Tắt có thứ tự: ngừng nhận yêu cầu và việc nền mới, rồi đóng CSDL SAU KHI các giao dịch đang chạy (nhập dữ liệu,
 * việc định kỳ...) hoàn tất — svc.close() xếp hàng sau chúng trên khóa CSDL — cuối cùng mới nhả khóa thư mục dữ liệu.
 */
async function shutdown(sig) {
  if (stopping) return
  stopping = true
  console.log(`Nhận ${sig}, đang đóng CSDL…`)
  stopWorkers()
  server.close()
  server.closeIdleConnections()
  const force = setTimeout(() => {
    console.error('Quá 25 giây chưa đóng xong CSDL — buộc thoát.')
    process.exit(1)
  }, 25_000)
  force.unref()
  try {
    await svc.close()
  } finally {
    process.exit(0)
  }
}
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => void shutdown(sig))
