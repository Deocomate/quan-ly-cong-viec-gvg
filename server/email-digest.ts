// Phần thuần của việc gửi email thông báo (không phụ thuộc Deno) — có kiểm thử bằng Vitest.

export interface QueueItem {
  id: string
  email: string
  full_name: string
  title: string
  body: string | null
  link: string | null
  task_id: string | null
  created_at: string
}

export interface Digest {
  to: string
  subject: string
  html: string
  text: string
  ids: string[]
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const timeVN = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(new Date(iso))

export function itemUrl(item: QueueItem, appUrl: string): string {
  const base = appUrl.replace(/\/+$/, '')
  if (item.task_id) return `${base}/cong-viec/${item.task_id}`
  if (item.link?.startsWith('/')) return base + item.link
  return `${base}/thong-bao`
}

/** Gộp thông báo chưa gửi thành 1 email cho mỗi người */
export function buildDigests(items: QueueItem[], appUrl: string): Digest[] {
  const byUser = new Map<string, QueueItem[]>()
  for (const it of items) byUser.set(it.email, [...(byUser.get(it.email) ?? []), it])
  return [...byUser.entries()].map(([email, list]) => {
    const name = list[0].full_name
    const subject = list.length === 1 ? list[0].title : `Bạn có ${list.length} thông báo mới`
    const rows = list
      .map(
        (it) =>
          `<tr><td style="padding:10px 0;border-bottom:1px solid #e8e2da"><a href="${esc(itemUrl(it, appUrl))}" style="color:#2b2724;font-weight:600;text-decoration:none">${esc(it.title)}</a>` +
          (it.body ? `<div style="color:#5c544d;font-size:14px">${esc(it.body)}</div>` : '') +
          `<div style="color:#8a8178;font-size:12px">${esc(timeVN(it.created_at))}</div></td></tr>`,
      )
      .join('')
    const html =
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#2b2724">` +
      `<p>Chào ${esc(name)},</p><table style="width:100%;border-collapse:collapse">${rows}</table>` +
      `<p style="margin-top:20px"><a href="${esc(appUrl.replace(/\/+$/, ''))}/thong-bao" style="background:#2b2724;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none">Mở Trung tâm điều hành</a></p>` +
      `<p style="color:#8a8178;font-size:12px">Bạn nhận email này vì đã bật "Nhận thông báo qua email" trong phần Cài đặt.</p></div>`
    const text =
      `Chào ${name},\n\n` + list.map((it) => `- ${it.title}${it.body ? `: ${it.body}` : ''} (${timeVN(it.created_at)})\n  ${itemUrl(it, appUrl)}`).join('\n') + `\n\nTắt email trong phần Cài đặt của ứng dụng.`
    return { to: email, subject, html, text, ids: list.map((i) => i.id) }
  })
}

export interface Deps {
  loadQueue: () => Promise<QueueItem[]>
  send: (d: Digest) => Promise<void>
  markSent: (ids: string[]) => Promise<void>
  saveStatus: (s: { last_run_at: string; sent: number; failed: number; error: string | null }) => Promise<void>
  appUrl: string
  now?: () => Date
}

/** Gửi từng email; email lỗi không được đánh dấu để lần chạy sau thử lại */
export async function processQueue(deps: Deps) {
  const digests = buildDigests(await deps.loadQueue(), deps.appUrl)
  let sent = 0
  let failed = 0
  let lastError: string | null = null
  for (const d of digests) {
    try {
      await deps.send(d)
      await deps.markSent(d.ids)
      sent++
    } catch (e) {
      failed++
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  const status = { last_run_at: (deps.now?.() ?? new Date()).toISOString(), sent, failed, error: lastError }
  await deps.saveStatus(status)
  return status
}
