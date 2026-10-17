import nodemailer from 'nodemailer'

/** Trả về hàm gửi thư `(mail) => Promise<void>` theo cấu hình SMTP, hoặc null nếu chưa cấu hình. */
export function createMailer(config) {
  if (!config.smtp?.from) return null
  const { host, port, secure, user, pass, from } = config.smtp
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  })
  return async ({ to, subject, html, text }) => {
    await transport.sendMail({ from, to, subject, html, text })
  }
}
