import { describe, expect, it, vi } from 'vitest'
import { buildDigests, itemUrl, processQueue, type QueueItem } from './email-digest'

const item = (p: Partial<QueueItem>): QueueItem => ({
  id: 'n1', email: 'anh@example.com', full_name: 'Minh Anh', title: 'Bạn được giao việc mới', body: 'Quay video <TikTok>',
  link: null, task_id: 't1', created_at: '2026-10-15T01:00:00Z', ...p,
})

describe('email thông báo', () => {
  it('đường dẫn trỏ đúng trang trong ứng dụng', () => {
    expect(itemUrl(item({}), 'https://app.vn/')).toBe('https://app.vn/cong-viec/t1')
    expect(itemUrl(item({ task_id: null, link: '/lich-noi-dung?id=c1' }), 'https://app.vn')).toBe('https://app.vn/lich-noi-dung?id=c1')
    expect(itemUrl(item({ task_id: null, link: 'https://evil.com' }), 'https://app.vn')).toBe('https://app.vn/thong-bao')
  })
  it('gộp mỗi người 1 email, thoát ký tự HTML, giờ VN', () => {
    const d = buildDigests([item({}), item({ id: 'n2', title: 'Sắp đến hạn' }), item({ id: 'n3', email: 'bao@example.com', full_name: 'Bảo' })], 'https://app.vn')
    expect(d).toHaveLength(2)
    expect(d[0].subject).toBe('Bạn có 2 thông báo mới')
    expect(d[0].ids).toEqual(['n1', 'n2'])
    expect(d[0].html).toContain('Quay video &lt;TikTok&gt;')
    expect(d[0].text).toContain('08:00')
    expect(d[1].subject).toBe('Bạn được giao việc mới')
  })
  it('email lỗi không bị đánh dấu đã gửi, trạng thái ghi lại lỗi', async () => {
    const marked: string[][] = []
    const saveStatus = vi.fn(async () => {})
    const r = await processQueue({
      appUrl: 'https://app.vn',
      loadQueue: async () => [item({}), item({ id: 'n3', email: 'bao@example.com' })],
      send: async (d) => {
        if (d.to === 'bao@example.com') throw new Error('Resend 422')
      },
      markSent: async (ids) => {
        marked.push(ids)
      },
      saveStatus,
      now: () => new Date('2026-10-15T00:00:00Z'),
    })
    expect(r).toEqual({ last_run_at: '2026-10-15T00:00:00.000Z', sent: 1, failed: 1, error: 'Resend 422' })
    expect(marked).toEqual([['n1']])
    expect(saveStatus).toHaveBeenCalledOnce()
  })
})
