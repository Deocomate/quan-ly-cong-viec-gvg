// Xác thực tự quản: mật khẩu băm scrypt, phiên mờ (token ngẫu nhiên, chỉ lưu băm SHA-256), mã đặt lại mật khẩu dùng một lần.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb)
const SESSION_DAYS = 30
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const newToken = () => randomBytes(32).toString('base64url')
export const MIN_PASSWORD = 8

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const [alg, salt, key] = String(stored ?? '').split('$')
  if (alg !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64')
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(expected, actual)
}

export const randomPasswordHash = () => hashPassword(randomBytes(24).toString('base64url'))

const normEmail = (e) => String(e ?? '').trim().toLowerCase()
const checkPassword = (p) => {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) throw new AuthError(`Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`)
}

export function createAuth(db) {
  const startSession = async (c, userId) => {
    const token = newToken()
    await c.query(`insert into app_private.sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`, [sha256(token), userId, SESSION_DAYS])
    return token
  }

  return {
    /** Trả về { id, email } của phiên hợp lệ, hoặc null. Tự gia hạn phiên sắp hết. */
    async userFromToken(token) {
      if (!token) return null
      return db.run(async (c) => {
        const { rows } = await c.query(
          `select u.id, u.email, s.expires_at from app_private.sessions s join auth.users u on u.id = s.user_id
           where s.token_hash = $1 and s.expires_at > now()`,
          [sha256(token)],
        )
        const row = rows[0]
        if (!row) return null
        if (new Date(row.expires_at).getTime() - Date.now() < (SESSION_DAYS - 1) * 86_400_000) {
          await c.query(`update app_private.sessions set expires_at = now() + make_interval(days => $2) where token_hash = $1`, [sha256(token), SESSION_DAYS])
        }
        return { id: row.id, email: row.email }
      })
    },

    async login(emailRaw, password) {
      const email = normEmail(emailRaw)
      return db.run(async (c) => {
        const { rows } = await c.query('select id, email, password_hash from auth.users where email = $1', [email])
        const u = rows[0]
        const ok = u ? await verifyPassword(String(password ?? ''), u.password_hash) : (await verifyPassword('x', 'scrypt$AA==$AA=='), false)
        if (!ok) throw new AuthError('Email hoặc mật khẩu không đúng.', 401)
        return { token: await startSession(c, u.id), user: { id: u.id, email: u.email } }
      })
    },

    /**
     * Đăng ký. Email đã được mời phải kèm đúng mã trong liên kết mời; email chưa được mời vẫn tạo được tài khoản
     * nhưng ở trạng thái chưa kích hoạt (xem trigger handle_new_user).
     */
    async register({ email: emailRaw, password, full_name, invite }) {
      const email = normEmail(emailRaw)
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new AuthError('Email không hợp lệ.')
      checkPassword(password)
      const name = String(full_name ?? '').trim()
      if (!name) throw new AuthError('Vui lòng nhập họ tên.')
      const hash = await hashPassword(password)
      return db.tx(async (c) => {
        if ((await c.query('select 1 from auth.users where email = $1', [email])).rows.length) {
          throw new AuthError(
            invite
              ? 'Email này đã có tài khoản. Hãy đăng nhập (hoặc dùng "Quên mật khẩu") — lời mời sẽ được nhận tự động sau khi đăng nhập.'
              : 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu".',
          )
        }
        const inv = (await c.query('select token from public.invitations where email = $1 and accepted_at is null', [email])).rows[0]
        if (inv && inv.token !== invite) throw new AuthError('Email này đã được mời. Hãy mở đúng liên kết trong thư mời (hoặc nhờ quản trị viên gửi lại).', 403)
        const { rows } = await c.query(`insert into auth.users (email, raw_user_meta_data, password_hash) values ($1, $2::jsonb, $3) returning id`, [email, JSON.stringify({ full_name: name }), hash])
        return { token: await startSession(c, rows[0].id), user: { id: rows[0].id, email } }
      })
    },

    async logout(token) {
      if (token) await db.run((c) => c.query('delete from app_private.sessions where token_hash = $1', [sha256(token)]))
    },

    /** Đổi mật khẩu khi đã đăng nhập; các phiên khác bị đăng xuất, phiên hiện tại giữ nguyên. */
    async changePassword(userId, currentToken, password) {
      checkPassword(password)
      const hash = await hashPassword(password)
      await db.tx(async (c) => {
        await c.query('update auth.users set password_hash = $2 where id = $1', [userId, hash])
        await c.query('delete from app_private.sessions where user_id = $1 and token_hash <> $2', [userId, sha256(currentToken ?? '')])
      })
    },

    /** Tạo mã đặt lại mật khẩu dùng một lần cho email đã có tài khoản; trả về { token, userId } hoặc null. */
    async createResetToken(emailRaw, ttlMs = 60 * 60_000) {
      return db.tx(async (c) => {
        const u = (await c.query('select id from auth.users where email = $1', [normEmail(emailRaw)])).rows[0]
        if (!u) return null
        const token = newToken()
        await c.query('delete from app_private.reset_tokens where user_id = $1', [u.id])
        await c.query(`insert into app_private.reset_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(secs => $3))`, [sha256(token), u.id, ttlMs / 1000])
        return { token, userId: u.id }
      })
    },

    /** Dùng mã đặt lại: đặt mật khẩu mới, hủy mọi phiên cũ và đăng nhập luôn. */
    async resetPassword(token, password) {
      checkPassword(password)
      const hash = await hashPassword(password)
      return db.tx(async (c) => {
        const { rows } = await c.query(
          `delete from app_private.reset_tokens where token_hash = $1 and expires_at > now() returning user_id`,
          [sha256(String(token ?? ''))],
        )
        if (!rows[0]) throw new AuthError('Liên kết đặt lại mật khẩu đã hết hạn hoặc đã được dùng.', 400)
        const id = rows[0].user_id
        await c.query('update auth.users set password_hash = $2 where id = $1', [id, hash])
        await c.query('delete from app_private.sessions where user_id = $1', [id])
        const email = (await c.query('select email from auth.users where id = $1', [id])).rows[0].email
        return { token: await startSession(c, id), user: { id, email } }
      })
    },

    /** Đặt mật khẩu trực tiếp (dòng lệnh / tạo quản trị viên đầu tiên). Tạo tài khoản nếu chưa có. */
    async upsertUser(c, { email: emailRaw, password, full_name }) {
      const email = normEmail(emailRaw)
      checkPassword(password)
      const hash = await hashPassword(password)
      const existing = (await c.query('select id from auth.users where email = $1', [email])).rows[0]
      if (existing) {
        await c.query('update auth.users set password_hash = $2 where id = $1', [existing.id, hash])
        await c.query('delete from app_private.sessions where user_id = $1', [existing.id])
        return existing.id
      }
      const { rows } = await c.query(`insert into auth.users (email, raw_user_meta_data, password_hash) values ($1, $2::jsonb, $3) returning id`, [email, JSON.stringify({ full_name: full_name || email.split('@')[0] }), hash])
      return rows[0].id
    },
  }
}
