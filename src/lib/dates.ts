/**
 * Tiện ích ngày giờ theo múi giờ Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè,
 * nên phép cộng lệch cố định là chính xác).
 */
export const TZ = 'Asia/Ho_Chi_Minh'
const OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface Range {
  from: Date // bao gồm
  to: Date // không bao gồm
}

export type PresetKey = 'today' | 'week' | 'month' | 'custom'

/** 'YYYY-MM-DD' theo giờ Việt Nam */
export function vnDateKey(d: Date | string): string {
  const t = new Date(typeof d === 'string' ? d : d.getTime()).getTime() + OFFSET_MS
  return new Date(t).toISOString().slice(0, 10)
}

/** Thời điểm 00:00 (giờ VN) của ngày 'YYYY-MM-DD' */
export function vnStartOfDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - OFFSET_MS)
}

export function vnStartOfDay(d: Date): Date {
  return vnStartOfDateKey(vnDateKey(d))
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

/** Thứ trong tuần theo giờ VN: 1 = Thứ 2 ... 7 = Chủ nhật */
export function vnWeekday(d: Date): number {
  const wd = new Date(d.getTime() + OFFSET_MS).getUTCDay()
  return wd === 0 ? 7 : wd
}

export function presetRange(preset: Exclude<PresetKey, 'custom'>, now = new Date()): Range {
  const today = vnStartOfDay(now)
  if (preset === 'today') return { from: today, to: addDays(today, 1) }
  if (preset === 'week') {
    const monday = addDays(today, -(vnWeekday(now) - 1))
    return { from: monday, to: addDays(monday, 7) }
  }
  const key = vnDateKey(now)
  const [y, m] = key.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, 1) - OFFSET_MS)
  const to = new Date(Date.UTC(y, m, 1) - OFFSET_MS)
  return { from, to }
}

/** Khoảng tùy chọn từ 2 ngày 'YYYY-MM-DD' (bao gồm cả ngày cuối) */
export function customRange(fromKey: string, toKey: string): Range {
  const from = vnStartOfDateKey(fromKey)
  const to = addDays(vnStartOfDateKey(toKey), 1)
  return to > from ? { from, to } : { from: to, to: addDays(from, 1) }
}

export function inRange(iso: string | null | undefined, r: Range): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t >= r.from.getTime() && t < r.to.getTime()
}

/** Hạn chót từ ô chọn ngày: 23:59:59 giờ VN của ngày đó */
export function dueAtFromDateKey(key: string): string {
  return new Date(vnStartOfDateKey(key).getTime() + DAY_MS - 1000).toISOString()
}

export function dateKeyFromIso(iso: string | null | undefined): string {
  return iso ? vnDateKey(iso) : ''
}

const dateFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const weekdayFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, weekday: 'short' })
const longFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const fmtDate = (d: string | Date | null | undefined) => (d ? dateFmt.format(new Date(d)) : '—')
export const fmtShort = (d: string | Date | null | undefined) => (d ? shortFmt.format(new Date(d)) : '—')
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : '—')
export const fmtWeekday = (d: Date) => weekdayFmt.format(d)
export const fmtLong = (d: Date) => longFmt.format(d)
/** Ngày dạng 'YYYY-MM-DD' (cột date) → dd/mm/yyyy */
export const fmtDateKey = (key: string | null | undefined) => (key ? key.split('-').reverse().join('/') : '—')

/** Mô tả tương đối hạn chót: "Hôm nay", "Còn 3 ngày", "Trễ 2 ngày" */
export function relativeDue(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'Không có hạn'
  const diff = Math.round(
    (vnStartOfDateKey(vnDateKey(iso)).getTime() - vnStartOfDay(now).getTime()) / DAY_MS,
  )
  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return 'Ngày mai'
  if (diff > 1) return `Còn ${diff} ngày`
  return `Trễ ${-diff} ngày`
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS)
}
