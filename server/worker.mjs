// Việc chạy nền trong cùng tiến trình: gửi email thông báo và chạy việc định kỳ (lặp lại, nhắc hạn).
import { processQueue } from './email-digest.ts'

function every(ms, name, fn) {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await fn()
    } catch (e) {
      console.error(`[${name}]`, e?.message ?? e)
    } finally {
      running = false
    }
  }
  const first = setTimeout(tick, 15_000).unref()
  const repeat = setInterval(tick, ms).unref()
  return {
    stop() {
      clearTimeout(first)
      clearInterval(repeat)
    },
  }
}

/** Khởi động việc nền; trả về hàm dừng tất cả (gọi khi tắt máy chủ). */
export function startWorkers(svc) {
  const { db, config, mailer } = svc
  const timers = []
  if (mailer) {
    timers.push(every(config.emailIntervalMin * 60_000, 'email', async () => {
      const r = await processQueue({
        appUrl: config.appUrl,
        loadQueue: async () => (await db.run((c) => c.query('select * from public.email_queue(300)'))).rows,
        send: (d) => mailer({ to: d.to, subject: d.subject, html: d.html, text: d.text }),
        markSent: (ids) => db.run((c) => c.query('update public.notifications set emailed_at = now() where id = any($1::uuid[])', [ids])),
        saveStatus: (s) =>
          db.run((c) =>
            c.query(
              `insert into public.app_settings (key, value) values ('email_status', $1::text::jsonb)
               on conflict (key) do update set value = excluded.value, updated_at = now()`,
              [JSON.stringify(s)],
            ),
          ),
      })
      if (r.sent || r.failed) console.log(`[email] đã gửi ${r.sent}, lỗi ${r.failed}`)
    }))
    console.log(`[email] bật, chạy mỗi ${config.emailIntervalMin} phút`)
  } else {
    console.log('[email] tắt: thiếu SMTP_HOST, EMAIL_FROM hoặc APP_URL')
  }
  if (config.runScheduledJobs) {
    timers.push(every(60 * 60_000, 'jobs', () => db.run((c) => c.query('select public.run_scheduled_jobs()'))))
  }
  return () => timers.forEach((t) => t.stop())
}
