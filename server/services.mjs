// Gắn kết các phần của máy chủ: CSDL nhúng, xác thực, tệp, SMTP.
import { createAuth, randomPasswordHash } from './auth.mjs'
import { canSendMail } from './config.mjs'
import { openDb } from './db.mjs'
import { acquireDataLock } from './data-lock.mjs'
import { createFiles } from './files.mjs'
import { createMailer } from './mailer.mjs'
import { invitationMail, resetPasswordMail, restoredAccountMail } from './mail-templates.mjs'

export async function createServices(config) {
  const releaseLock = await acquireDataLock(config.dataDir)
  const db = await openDb(config.dbDir)
  const auth = createAuth(db)
  const files = createFiles(db, config.filesDir)
  const mailer = canSendMail(config) ? createMailer(config) : null

  const resetUrl = (base, token) => `${base}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`

  const svc = {
    config,
    db,
    auth,
    files,
    mailer,
    mailReady: Boolean(mailer),

    /** Hồ sơ quản trị viên đang hoạt động của người dùng đã xác thực, hoặc null. */
    async requireAdmin(userId) {
      const p = (await db.run((c) => c.query('select id, full_name from public.profiles where id = $1 and role = $2 and is_active', [userId, 'admin']))).rows[0]
      return p ?? null
    },

    /** Gửi thư đặt lại mật khẩu nếu email thuộc một tài khoản đang hoạt động. Im lặng nếu không có. */
    async sendPasswordReset(email) {
      // Tra theo tài khoản đăng nhập (nguồn gốc của email), rồi mới xem hồ sơ có đang hoạt động.
      const p = (
        await db.run((c) => c.query('select p.full_name, p.is_active from auth.users u join public.profiles p on p.id = u.id where u.email = $1', [email]))
      ).rows[0]
      if (!p?.is_active) return false
      const t = await auth.createResetToken(email)
      if (!t) return false
      await mailer({ to: email, ...resetPasswordMail({ name: p.full_name, url: resetUrl(config.appUrl, t.token) }) })
      return true
    },

    /** Liên kết đặt lại mật khẩu 24 giờ cho một nhân viên — quản trị viên chuyển tay khi chưa có SMTP. */
    async adminResetLink(userId, baseUrl) {
      const u = (await db.run((c) => c.query('select email from auth.users where id = $1', [userId]))).rows[0]
      if (!u) return null
      const t = await auth.createResetToken(u.email, 24 * 3_600_000)
      return { email: u.email, url: resetUrl(baseUrl, t.token) }
    },

    /** Gửi (hoặc gửi lại) thư mời cho lời mời chưa được chấp nhận. */
    async sendInvitation(email, inviterName) {
      const inv = (await db.run((c) => c.query('select full_name, token, accepted_at from public.invitations where email = $1', [email]))).rows[0]
      if (!inv) throw new Error('Không tìm thấy lời mời cho email này.')
      if (inv.accepted_at) throw new Error('Người này đã đăng ký tài khoản.')
      const url = `${config.appUrl}/dang-ky?email=${encodeURIComponent(email)}&invite=${encodeURIComponent(inv.token)}`
      await mailer({ to: email, ...invitationMail({ name: inv.full_name, inviter: inviterName, url }) })
    },

    /** Tạo tài khoản đăng nhập còn thiếu khi khôi phục (mật khẩu ngẫu nhiên; người dùng đặt lại qua email). */
    async provisionUser(client, { email, full_name }) {
      const { rows } = await client.query(`insert into auth.users (email, raw_user_meta_data, password_hash) values ($1, $2::jsonb, $3) returning id`, [
        email,
        JSON.stringify({ full_name }),
        await randomPasswordHash(),
      ])
      return rows[0].id
    },

    /** Gửi thư đặt mật khẩu (hiệu lực 7 ngày) cho các tài khoản vừa được tạo lại. */
    async sendRestoredAccountMails(users) {
      let sent = 0
      let failed = 0
      for (const u of users) {
        try {
          const t = await auth.createResetToken(u.email, 7 * 24 * 3_600_000)
          await mailer({ to: u.email, ...restoredAccountMail({ name: u.full_name, url: resetUrl(config.appUrl, t.token) }) })
          sent++
        } catch (e) {
          failed++
          console.error(`[mail] ${u.email}:`, e.message)
        }
      }
      return { sent, failed }
    },

    /** Tạo (hoặc cập nhật mật khẩu) tài khoản quản trị viên theo ADMIN_EMAIL / ADMIN_PASSWORD nếu chưa có quản trị viên nào. */
    async ensureAdmin() {
      const { admin } = config
      if (!admin) return
      const has = (await db.run((c) => c.query(`select 1 from public.profiles where role = 'admin' and is_active`))).rows.length
      if (has) return
      if (admin.password.length < 8) return console.warn('[admin] Chưa có quản trị viên: đặt ADMIN_PASSWORD (ít nhất 8 ký tự) để tạo tài khoản đầu tiên.')
      await db.tx(async (c) => {
        await auth.upsertUser(c, { email: admin.email, password: admin.password, full_name: admin.name })
        await c.query('select public.bootstrap_admin($1)', [admin.email])
      })
      console.log(`[admin] Đã tạo quản trị viên ${admin.email}`)
    },

    async close() {
      await db.close().catch(() => {})
      await releaseLock()
    },
  }
  return svc
}
