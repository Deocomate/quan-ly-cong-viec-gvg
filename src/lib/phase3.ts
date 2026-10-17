// Công thức Giai đoạn 3: mục tiêu, lịch nội dung, xuất báo cáo. Hàm thuần, có kiểm thử.
import type { ContentApproval, ContentItem, ContentPlatform, ContentStage, Goal, Task } from './types'
import { isDone } from './metrics'
import { vnDateKey, vnStartOfDateKey } from './dates'

// ---------- Mục tiêu ----------
export const GOAL_TYPE_LABEL = { cong_viec: 'Mục tiêu công việc', ket_qua_kinh_doanh: 'Kết quả kinh doanh' } as const
export const GOAL_METRIC_LABEL = {
  thu_cong: 'Nhập kết quả thực tế',
  so_viec: 'Tự tính: số việc liên kết đã hoàn thành',
  trong_so: 'Tự tính: tổng trọng số việc liên kết đã hoàn thành',
} as const

/** Kết quả thực tế: nhập tay, hoặc tự tính từ việc liên kết đã được duyệt hoàn thành (bỏ việc đã hủy). */
export function goalActual(goal: Goal, tasksById: Map<string, Task>): number {
  if (goal.metric === 'thu_cong') return Number(goal.actual_value)
  const linked = (goal.goal_tasks ?? []).map((l) => tasksById.get(l.task_id)).filter((t): t is Task => Boolean(t) && t!.status !== 'da_huy')
  const done = linked.filter(isDone)
  return goal.metric === 'so_viec' ? done.length : done.reduce((a, t) => a + t.weight, 0)
}

/** % đạt (không giới hạn 100 để thấy vượt chỉ tiêu) */
export const goalPercent = (actual: number, target: number) => (target > 0 ? Math.round((actual / target) * 100) : 0)

/** % thời gian đã trôi qua của kỳ (0–100), dùng để so tiến độ kỳ vọng */
export function periodElapsed(goal: Pick<Goal, 'period_start' | 'period_end'>, now = new Date()): number {
  const from = vnStartOfDateKey(goal.period_start).getTime()
  const to = vnStartOfDateKey(goal.period_end).getTime() + 86_400_000
  if (now.getTime() <= from) return 0
  if (now.getTime() >= to) return 100
  return Math.round(((now.getTime() - from) / (to - from)) * 100)
}

export type GoalHealth = 'dat' | 'dung_tien_do' | 'cham' | 'chua_dat' | 'chua_bat_dau'
export const GOAL_HEALTH: Record<GoalHealth, { label: string; cls: string }> = {
  dat: { label: 'Đã đạt', cls: 'bg-ok-soft text-ok' },
  dung_tien_do: { label: 'Đúng tiến độ', cls: 'bg-info-soft text-info' },
  cham: { label: 'Chậm tiến độ', cls: 'bg-warn-soft text-warn' },
  chua_dat: { label: 'Không đạt', cls: 'bg-danger-soft text-danger' },
  chua_bat_dau: { label: 'Chưa tới kỳ', cls: 'bg-sunken text-ink-muted' },
}

/** Đánh giá: so % đạt với % thời gian đã qua (cho phép chậm 10 điểm) */
export function goalHealth(percent: number, elapsed: number): GoalHealth {
  if (percent >= 100) return 'dat'
  if (elapsed <= 0) return 'chua_bat_dau'
  if (elapsed >= 100) return 'chua_dat'
  return percent + 10 >= elapsed ? 'dung_tien_do' : 'cham'
}

/** Kỳ tháng/quý chứa ngày `key` (YYYY-MM-DD) */
export function periodBounds(type: 'thang' | 'quy', key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number)
  const startMonth = type === 'thang' ? m : Math.floor((m - 1) / 3) * 3 + 1
  const endMonth = type === 'thang' ? m : startMonth + 2
  const last = new Date(Date.UTC(y, endMonth, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return { start: `${y}-${pad(startMonth)}-01`, end: `${y}-${pad(endMonth)}-${pad(last)}` }
}

export const periodLabel = (g: Pick<Goal, 'period_type' | 'period_start'>) => {
  const [y, m] = g.period_start.split('-').map(Number)
  return g.period_type === 'thang' ? `Tháng ${m}/${y}` : `Quý ${Math.floor((m - 1) / 3) + 1}/${y}`
}

// ---------- Lịch nội dung ----------
export const PLATFORM_LABEL: Record<ContentPlatform, string> = {
  facebook: 'Facebook',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  website: 'Website',
  shopee: 'Shopee',
  zalo: 'Zalo',
  khac: 'Khác',
}
export const STAGE_LABEL: Record<ContentStage, string> = { chua_bat_dau: 'Chưa bắt đầu', dang_lam: 'Đang làm', xong: 'Xong', khong_can: 'Không cần' }
export const STAGE_STYLE: Record<ContentStage, string> = {
  chua_bat_dau: 'bg-sunken text-ink-muted',
  dang_lam: 'bg-info-soft text-info',
  xong: 'bg-ok-soft text-ok',
  khong_can: 'bg-transparent text-ink-muted line-through',
}
export const APPROVAL_LABEL: Record<ContentApproval, string> = { chua_bat_dau: 'Chưa gửi duyệt', cho_duyet: 'Chờ duyệt', da_duyet: 'Đã duyệt', can_sua: 'Cần sửa' }
export const APPROVAL_STYLE: Record<ContentApproval, string> = {
  chua_bat_dau: 'bg-sunken text-ink-soft',
  cho_duyet: 'bg-violet-soft text-violet',
  da_duyet: 'bg-ok-soft text-ok',
  can_sua: 'bg-warn-soft text-warn',
}

export type ContentState = 'da_dang' | 'san_sang' | 'dang_san_xuat' | 'tre' | 'chua_len_lich'
export const CONTENT_STATE_LABEL: Record<ContentState, string> = {
  da_dang: 'Đã đăng',
  san_sang: 'Sẵn sàng đăng',
  dang_san_xuat: 'Đang sản xuất',
  tre: 'Trễ lịch đăng',
  chua_len_lich: 'Chưa có ngày đăng',
}

/** Trạng thái tổng của một nội dung. Trễ = qua ngày đăng mà chưa đăng. */
export function contentState(c: ContentItem, now = new Date()): ContentState {
  if (c.published_at) return 'da_dang'
  if (!c.publish_date) return 'chua_len_lich'
  if (c.publish_date < vnDateKey(now)) return 'tre'
  const stagesDone = [c.script_status, c.filming_status, c.editing_status].every((s) => s === 'xong' || s === 'khong_can')
  return stagesDone && c.approval_status === 'da_duyet' ? 'san_sang' : 'dang_san_xuat'
}

/** % sản xuất: các bước cần làm đã xong + duyệt */
export function contentProgress(c: ContentItem): number {
  const stages = [c.script_status, c.filming_status, c.editing_status].filter((s) => s !== 'khong_can')
  const steps = stages.length + 1
  const done = stages.filter((s) => s === 'xong').length + (c.approval_status === 'da_duyet' ? 1 : 0)
  return Math.round((done / steps) * 100)
}

export interface ContentSummary {
  planned: number
  published: number
  late: number
  waiting: number
  views: number
  engagements: number
  leads: number
  engagementRate: number | null
}

/** Tổng hợp nội dung có ngày đăng (dự kiến) trong [fromKey, toKey] */
export function contentSummary(items: ContentItem[], fromKey: string, toKey: string, now = new Date()): ContentSummary {
  const inPeriod = items.filter((c) => c.publish_date && c.publish_date >= fromKey && c.publish_date <= toKey)
  const published = inPeriod.filter((c) => c.published_at)
  const views = published.reduce((a, c) => a + (c.views ?? 0), 0)
  const engagements = published.reduce((a, c) => a + (c.engagements ?? 0), 0)
  return {
    planned: inPeriod.length,
    published: published.length,
    late: inPeriod.filter((c) => contentState(c, now) === 'tre').length,
    waiting: inPeriod.filter((c) => c.approval_status === 'cho_duyet').length,
    views,
    engagements,
    leads: published.reduce((a, c) => a + (c.leads ?? 0), 0),
    engagementRate: views > 0 ? Math.round((engagements / views) * 1000) / 10 : null,
  }
}

// ---------- Xuất CSV ----------
export type Cell = string | number | null | undefined

const csvCell = (v: Cell) => {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV có BOM UTF-8 để Excel mở đúng tiếng Việt */
export const toCsv = (rows: Cell[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadCsv = (rows: Cell[][], fileName: string) => downloadBlob(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), fileName)

export interface Sheet {
  name: string
  rows: Cell[][]
}

/** Xuất Excel nhiều trang tính; thư viện chỉ tải khi bấm nút */
export async function downloadXlsx(sheets: Sheet[], fileName: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const data = sheets.map((s) => ({
    sheet: s.name.slice(0, 31),
    stickyRowsCount: 1,
    columns: (s.rows[0] ?? []).map((_, i) => ({ width: Math.min(48, Math.max(10, ...s.rows.map((r) => String(r[i] ?? '').length + 2))) })),
    data: s.rows.map((r, ri) => r.map((v) => (v == null || v === '' ? null : ri === 0 ? { value: String(v), fontWeight: 'bold' as const } : v))),
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await writeExcelFile(data as any).toBlob()
  downloadBlob(blob, fileName)
}
