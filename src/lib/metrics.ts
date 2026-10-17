/**
 * Công thức thống kê. Mọi số liệu được tính từ bản ghi thật trong CSDL (đã lọc
 * theo quyền bởi RLS). Quy tắc chi tiết: docs/06-cong-thuc-kpi.md
 */
import { addDays, inRange, vnDateKey, vnStartOfDateKey, type Range } from './dates'
import type { Task } from './types'

export const CLOSED: Task['status'][] = ['hoan_thanh', 'da_huy']

export const isCanceled = (t: Task) => t.status === 'da_huy'
export const isDone = (t: Task) => t.status === 'hoan_thanh'
export const isOpen = (t: Task) => !CLOSED.includes(t.status)

/** Người liên quan tới việc: người được giao + người phụ trách chính */
export function taskPeople(t: Task): string[] {
  const ids = new Set((t.task_assignments ?? []).map((a) => a.user_id))
  if (t.primary_owner_id) ids.add(t.primary_owner_id)
  return [...ids]
}

export const isAssignedTo = (t: Task, userId: string) => taskPeople(t).includes(userId)

/**
 * Quá hạn (trách nhiệm nhân viên): còn mở, đã qua hạn, và KHÔNG ở trạng thái
 * "Chờ duyệt" (đã nộp, đang chờ quản lý) hoặc "Tạm dừng" (quyết định của quản lý).
 */
export function isOverdue(t: Task, now = new Date()): boolean {
  if (!t.due_at || !isOpen(t)) return false
  if (t.status === 'cho_duyet' || t.status === 'tam_dung') return false
  return new Date(t.due_at).getTime() < now.getTime()
}

export function overdueDays(t: Task, now = new Date()): number {
  if (!isOverdue(t, now) || !t.due_at) return 0
  return Math.max(1, Math.ceil((now.getTime() - new Date(t.due_at).getTime()) / 86_400_000))
}

/** Hoàn thành đúng hạn: thời điểm nhân viên nộp (completed_at) ≤ hạn chót. */
export function isOnTime(t: Task): boolean | null {
  if (!isDone(t) || !t.completed_at) return null
  if (!t.due_at) return null // không có hạn → không tính vào tỷ lệ đúng hạn
  return new Date(t.completed_at).getTime() <= new Date(t.due_at).getTime()
}

/** Tiến độ hiệu lực của một việc (0–100) */
export const effectiveProgress = (t: Task) => (isDone(t) ? 100 : Math.min(t.progress, 99))

/** Tiến độ có trọng số của một tập việc (bỏ việc đã hủy) */
export function weightedProgress(tasks: Task[]): number {
  const live = tasks.filter((t) => !isCanceled(t))
  const total = live.reduce((s, t) => s + t.weight, 0)
  if (total === 0) return 0
  return Math.round(live.reduce((s, t) => s + t.weight * effectiveProgress(t), 0) / total)
}

export const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 100) : null)

export interface Summary {
  active: number
  completed: number
  inProgress: number
  overdue: number
  awaitingApproval: number
  onTimeRate: number | null
  completedWithDue: number
}

/**
 * Thẻ tổng quan.
 * - active / inProgress / overdue / awaitingApproval: trạng thái HIỆN TẠI.
 * - completed / onTimeRate: việc hoàn thành có completed_at trong khoảng thời gian chọn.
 */
export function summarize(tasks: Task[], range: Range, now = new Date()): Summary {
  const live = tasks.filter((t) => !isCanceled(t))
  const completed = live.filter((t) => isDone(t) && inRange(t.completed_at, range))
  const withDue = completed.filter((t) => t.due_at)
  return {
    active: live.filter(isOpen).length,
    completed: completed.length,
    inProgress: live.filter((t) => t.status === 'dang_thuc_hien').length,
    overdue: live.filter((t) => isOverdue(t, now)).length,
    awaitingApproval: live.filter((t) => t.status === 'cho_duyet').length,
    onTimeRate: pct(withDue.filter((t) => isOnTime(t)).length, withDue.length),
    completedWithDue: withDue.length,
  }
}

export interface BrandStat {
  total: number
  completed: number
  overdue: number
  open: number
  progress: number
}

export function brandStat(tasks: Task[], now = new Date()): BrandStat {
  const live = tasks.filter((t) => !isCanceled(t))
  return {
    total: live.length,
    completed: live.filter(isDone).length,
    overdue: live.filter((t) => isOverdue(t, now)).length,
    open: live.filter(isOpen).length,
    progress: weightedProgress(live),
  }
}

/** Số việc hoàn thành mỗi ngày trong khoảng (tối đa 31 cột, theo ngày giờ VN) */
export function dailyCompletions(tasks: Task[], range: Range): { key: string; count: number }[] {
  const days: { key: string; count: number }[] = []
  let cursor = range.from
  while (cursor < range.to && days.length < 31) {
    days.push({ key: vnDateKey(cursor), count: 0 })
    cursor = addDays(cursor, 1)
  }
  const idx = new Map(days.map((d, i) => [d.key, i]))
  for (const t of tasks) {
    if (!isDone(t) || !t.completed_at || !inRange(t.completed_at, range)) continue
    const i = idx.get(vnDateKey(t.completed_at))
    if (i !== undefined) days[i].count++
  }
  return days
}

export interface EmployeeStat {
  userId: string
  dueInPeriod: number
  completedOfDue: number
  completionRate: number | null
  onTimeOfCompleted: number | null
  onTimeOfDue: number | null
  weightDue: number
  weightDone: number
  weightedRate: number | null
  qualityAvg: number | null
  qualityCount: number
  revisions: number
  overdueNow: number
  maxOverdueDays: number
  activeNow: number
  activeHours: number
  noDueOpen: number
  activeByBrand: Record<string, number>
}

/**
 * KPI nhân viên trong khoảng thời gian. "Việc đến hạn trong kỳ" = việc được giao,
 * không hủy, có hạn chót nằm trong kỳ VÀ (đã tới hạn tính đến hiện tại HOẶC đã hoàn thành).
 * Việc chưa tới hạn không kéo tỷ lệ xuống. Việc không có hạn chót không tính vào tỷ lệ
 * mà được hiển thị riêng (noDueOpen).
 */
export function employeeStat(tasks: Task[], userId: string, range: Range, now = new Date()): EmployeeStat {
  return statOf(tasks.filter((t) => isAssignedTo(t, userId)), userId, range, now)
}

/** Cùng công thức cho một nhóm việc bất kỳ (cả đội, một thương hiệu) — dùng cho báo cáo */
export const groupStat = (tasks: Task[], range: Range, now = new Date()): EmployeeStat => statOf(tasks, '', range, now)

function statOf(list: Task[], userId: string, range: Range, now: Date): EmployeeStat {
  const mine = list.filter((t) => !isCanceled(t))
  // Chỉ tính việc đã tới hạn (hạn ≤ hiện tại) hoặc đã xong sớm — việc còn hạn chưa bị tính là "chưa hoàn thành"
  const due = mine.filter((t) => inRange(t.due_at, range) && (isDone(t) || new Date(t.due_at!).getTime() <= now.getTime()))
  const done = due.filter(isDone)
  const onTime = done.filter((t) => isOnTime(t) === true)
  const rated = done.filter((t) => t.quality_score != null)
  const open = mine.filter(isOpen)
  const overdue = open.filter((t) => isOverdue(t, now))
  const weightDue = due.reduce((s, t) => s + t.weight, 0)
  const weightDone = done.reduce((s, t) => s + t.weight, 0)
  const activeByBrand: Record<string, number> = {}
  for (const t of open) activeByBrand[t.brand_id] = (activeByBrand[t.brand_id] ?? 0) + 1
  return {
    userId,
    dueInPeriod: due.length,
    completedOfDue: done.length,
    completionRate: pct(done.length, due.length),
    onTimeOfCompleted: pct(onTime.length, done.length),
    onTimeOfDue: pct(onTime.length, due.length),
    weightDue,
    weightDone,
    weightedRate: pct(weightDone, weightDue),
    qualityAvg: rated.length ? Math.round((rated.reduce((s, t) => s + (t.quality_score ?? 0), 0) / rated.length) * 10) / 10 : null,
    qualityCount: rated.length,
    revisions: due.reduce((s, t) => s + t.revision_count, 0),
    overdueNow: overdue.length,
    maxOverdueDays: overdue.reduce((m, t) => Math.max(m, overdueDays(t, now)), 0),
    activeNow: open.length,
    activeHours: open.reduce((s, t) => s + Number(t.estimated_hours ?? 0), 0),
    noDueOpen: open.filter((t) => !t.due_at).length,
    activeByBrand,
  }
}

export type MyBucket =
  | 'hom_nay'
  | 'sap_den_han'
  | 'dang_thuc_hien'
  | 'cho_duyet'
  | 'can_chinh_sua'
  | 'qua_han'
  | 'da_hoan_thanh'
  | 'khac'

/** Phân nhóm "Công việc của tôi" — mỗi việc chỉ thuộc 1 nhóm, ưu tiên theo thứ tự dưới. */
export function myBucket(t: Task, now = new Date()): MyBucket {
  if (isDone(t)) return 'da_hoan_thanh'
  if (t.status === 'cho_duyet') return 'cho_duyet'
  if (t.status === 'can_chinh_sua') return 'can_chinh_sua'
  if (isOverdue(t, now)) return 'qua_han'
  if (t.due_at) {
    const todayKey = vnDateKey(now)
    const dueKey = vnDateKey(t.due_at)
    if (dueKey === todayKey) return 'hom_nay'
    const in3 = addDays(vnStartOfDateKey(todayKey), 4)
    if (new Date(t.due_at) < in3 && t.status !== 'tam_dung') return 'sap_den_han'
  }
  if (t.status === 'dang_thuc_hien' || t.status === 'cho_phan_hoi') return 'dang_thuc_hien'
  return 'khac'
}

export const inRangeCompleted = (t: Task, r: Range) => isDone(t) && inRange(t.completed_at, r)

export interface TrendPoint {
  key: string
  from: Date
  completionRate: number | null
  onTimeOfDue: number | null
  weightedRate: number | null
  completed: number
  due: number
}

/** Xu hướng theo tuần (Thứ 2 → Chủ nhật), `weeks` tuần gần nhất tính cả tuần hiện tại */
export function weeklyTrend(tasks: Task[], userId: string | null, weeks = 8, now = new Date()): TrendPoint[] {
  const today = vnStartOfDateKey(vnDateKey(now))
  const wd = new Date(today.getTime() + 7 * 3600_000).getUTCDay() || 7
  const thisMonday = addDays(today, -(wd - 1))
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(thisMonday, -7 * (weeks - 1 - i))
    const r = { from, to: addDays(from, 7) }
    const s = userId ? employeeStat(tasks, userId, r, now) : groupStat(tasks, r, now)
    return {
      key: vnDateKey(from),
      from,
      completionRate: s.completionRate,
      onTimeOfDue: s.onTimeOfDue,
      weightedRate: s.weightedRate,
      completed: s.completedOfDue,
      due: s.dueInPeriod,
    }
  })
}

export interface KpiWeights {
  completion: number
  on_time: number
  weighted: number
  quality: number
  show_combined: boolean
}

export const DEFAULT_KPI_WEIGHTS: KpiWeights = { completion: 30, on_time: 30, weighted: 25, quality: 15, show_combined: false }

/**
 * Điểm tổng hợp THAM KHẢO (chỉ hiện khi quản trị viên bật). Chỉ số nào chưa có dữ liệu
 * thì bỏ khỏi cả tử và mẫu, để không phạt oan. Chất lượng 1–5 quy đổi về 0–100.
 */
export function combinedScore(s: EmployeeStat, w: KpiWeights): number | null {
  const parts: [number | null, number][] = [
    [s.completionRate, w.completion],
    [s.onTimeOfDue, w.on_time],
    [s.weightedRate, w.weighted],
    [s.qualityAvg == null ? null : (s.qualityAvg / 5) * 100, w.quality],
  ]
  const used = parts.filter(([v, wt]) => v != null && wt > 0) as [number, number][]
  const total = used.reduce((a, [, wt]) => a + wt, 0)
  if (!total) return null
  return Math.round(used.reduce((a, [v, wt]) => a + v * wt, 0) / total)
}

/** Giờ ước tính của việc đang mở theo thương hiệu cho một người */
export function openHoursByBrand(tasks: Task[], userId: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of tasks) {
    if (!isOpen(t) || isCanceled(t) || !isAssignedTo(t, userId)) continue
    out[t.brand_id] = (out[t.brand_id] ?? 0) + Number(t.estimated_hours ?? 0)
  }
  return out
}
