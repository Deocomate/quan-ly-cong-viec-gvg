// Đọc cấu hình từ biến môi trường (đặt trong Coolify). Chỉ đọc lúc gọi để dễ kiểm thử.
import { join } from 'node:path'

/** Nạp `.env` ở thư mục làm việc nếu có (máy chủ và dòng lệnh dùng chung); biến đã đặt sẵn được ưu tiên. */
export function loadEnvFile(file = '.env') {
  try {
    process.loadEnvFile(file)
  } catch {
    // không có .env thì dùng biến môi trường hiện có
  }
}

export function loadConfig(env = process.env) {
  const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d)
  const smtpHost = env.SMTP_HOST?.trim()
  const dataDir = env.DATA_DIR?.trim() || (env.NODE_ENV === 'production' ? '/data' : './.data')
  return {
    port: num(env.PORT, 3000),
    appUrl: env.APP_URL?.trim().replace(/\/+$/, '') || '',
    dataDir,
    dbDir: join(dataDir, 'db'),
    filesDir: join(dataDir, 'files'),
    backupDir: join(dataDir, 'backups'),
    admin: env.ADMIN_EMAIL?.trim() ? { email: env.ADMIN_EMAIL.trim().toLowerCase(), password: env.ADMIN_PASSWORD ?? '', name: env.ADMIN_NAME?.trim() || '' } : null,
    smtp: smtpHost
      ? {
          host: smtpHost,
          port: num(env.SMTP_PORT, 587),
          secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : num(env.SMTP_PORT, 587) === 465,
          user: env.SMTP_USER?.trim() || '',
          pass: env.SMTP_PASS || '',
          from: env.EMAIL_FROM?.trim() || '',
        }
      : null,
    emailIntervalMin: Math.max(1, num(env.EMAIL_INTERVAL_MIN, 10)),
    runScheduledJobs: env.RUN_SCHEDULED_JOBS !== '0',
    // Số proxy tin cậy đứng trước ứng dụng (Coolify/Traefik = 1; thêm Cloudflare = 2). 0 = dùng địa chỉ kết nối trực tiếp.
    trustProxy: Math.max(0, Math.floor(num(env.TRUST_PROXY, env.NODE_ENV === 'production' ? 1 : 0))),
  }
}

/**
 * Địa chỉ IP thật của người dùng. X-Forwarded-For do người dùng tự gửi được phần đầu, mỗi proxy nối thêm một địa chỉ vào
 * cuối — nên chỉ tin phần tử thứ `trustProxy` tính từ cuối (địa chỉ mà proxy tin cậy ngoài cùng nhìn thấy).
 */
export function clientIp(forwardedFor, remoteAddress, trustProxy) {
  const chain = String(forwardedFor ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  if (trustProxy > 0 && chain.length) return chain[Math.max(0, chain.length - trustProxy)]
  return String(remoteAddress ?? '')
}

export const canSendMail = (c) => Boolean(c.smtp?.from && c.appUrl)
