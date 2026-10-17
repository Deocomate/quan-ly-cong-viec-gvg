import { describe, expect, it } from 'vitest'
import { customRange, dueAtFromDateKey, presetRange, relativeDue, vnDateKey } from './dates'
import { brandStat, combinedScore, dailyCompletions, DEFAULT_KPI_WEIGHTS, employeeStat, isOverdue, myBucket, summarize, weeklyTrend, weightedProgress } from './metrics'
import type { Task } from './types'

const NOW = new Date('2026-10-15T08:00:00+07:00') // Thứ Năm

let seq = 0
function task(p: Partial<Task>): Task {
  seq++
  return {
    id: `t${seq}`,
    brand_id: 'b1',
    project_id: null,
    title: `Việc ${seq}`,
    description: null,
    primary_owner_id: 'u1',
    created_by: 'admin',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    start_date: null,
    due_at: null,
    original_due_at: null,
    priority: 'trung_binh',
    weight: 1,
    estimated_hours: 2,
    status: 'dang_thuc_hien',
    progress: 0,
    requires_approval: true,
    is_blocked: false,
    blocker_note: null,
    links: [],
    completion_evidence: null,
    first_submitted_at: null,
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    completed_at: null,
    quality_score: null,
    revision_count: 0,
    is_demo: false,
    task_assignments: [{ user_id: 'u1' }],
    ...p,
  }
}

describe('ngày giờ Việt Nam', () => {
  it('lấy ngày theo giờ VN, không theo UTC', () => {
    expect(vnDateKey('2026-10-14T18:30:00Z')).toBe('2026-10-15') // 01:30 sáng 15/10 giờ VN
  })
  it('tuần bắt đầu từ Thứ Hai', () => {
    const w = presetRange('week', NOW)
    expect(vnDateKey(w.from)).toBe('2026-10-12')
    expect(vnDateKey(new Date(w.to.getTime() - 1))).toBe('2026-10-18')
  })
  it('tháng và khoảng tùy chọn', () => {
    const m = presetRange('month', NOW)
    expect(m.from.toISOString()).toBe('2026-09-30T17:00:00.000Z')
    expect(m.to.toISOString()).toBe('2026-10-31T17:00:00.000Z')
    const c = customRange('2026-10-01', '2026-10-03')
    expect(c.to.getTime() - c.from.getTime()).toBe(3 * 86_400_000)
  })
  it('hạn chót là cuối ngày giờ VN', () => {
    expect(dueAtFromDateKey('2026-10-20')).toBe('2026-10-20T16:59:59.000Z')
    expect(relativeDue(dueAtFromDateKey('2026-10-15'), NOW)).toBe('Hôm nay')
    expect(relativeDue(dueAtFromDateKey('2026-10-13'), NOW)).toBe('Trễ 2 ngày')
  })
})

describe('quá hạn công bằng', () => {
  it('việc đã nộp chờ duyệt không tính quá hạn cho nhân viên', () => {
    const t = task({ status: 'cho_duyet', due_at: '2026-10-10T16:59:59Z', submitted_at: '2026-10-09T10:00:00Z' })
    expect(isOverdue(t, NOW)).toBe(false)
  })
  it('việc tạm dừng, hủy, không có hạn không quá hạn', () => {
    expect(isOverdue(task({ status: 'tam_dung', due_at: '2026-10-01T00:00:00Z' }), NOW)).toBe(false)
    expect(isOverdue(task({ status: 'da_huy', due_at: '2026-10-01T00:00:00Z' }), NOW)).toBe(false)
    expect(isOverdue(task({ due_at: null }), NOW)).toBe(false)
    expect(isOverdue(task({ due_at: '2026-10-01T00:00:00Z' }), NOW)).toBe(true)
  })
})

describe('KPI nhân viên', () => {
  const range = presetRange('month', NOW)
  const tasks = [
    // đúng hạn: nộp 9/10, duyệt muộn 12/10 (quản lý duyệt chậm không tính là trễ)
    task({ status: 'hoan_thanh', weight: 3, due_at: '2026-10-10T16:59:59Z', submitted_at: '2026-10-09T03:00:00Z', completed_at: '2026-10-09T03:00:00Z', approved_at: '2026-10-12T03:00:00Z', quality_score: 5 }),
    // trễ hạn
    task({ status: 'hoan_thanh', weight: 1, due_at: '2026-10-05T16:59:59Z', completed_at: '2026-10-07T03:00:00Z', quality_score: 3, revision_count: 1 }),
    // chưa xong, đến hạn trong kỳ
    task({ status: 'dang_thuc_hien', weight: 2, due_at: '2026-10-12T16:59:59Z' }),
    // chưa đến hạn trong kỳ
    task({ status: 'chua_bat_dau', weight: 5, due_at: '2026-10-28T16:59:59Z' }),
    // hủy → loại
    task({ status: 'da_huy', weight: 5, due_at: '2026-10-08T16:59:59Z' }),
    // xong sớm dù hạn cuối tháng → được tính
    task({ status: 'hoan_thanh', weight: 2, due_at: '2026-10-30T16:59:59Z', completed_at: '2026-10-14T03:00:00Z', primary_owner_id: 'u3', task_assignments: [{ user_id: 'u3' }] }),
    // không có hạn
    task({ status: 'dang_thuc_hien', weight: 1, due_at: null }),
    // việc của người khác
    task({ status: 'hoan_thanh', primary_owner_id: 'u2', task_assignments: [{ user_id: 'u2' }], due_at: '2026-10-05T16:59:59Z', completed_at: '2026-10-04T00:00:00Z' }),
  ]
  const s = employeeStat(tasks, 'u1', range, NOW)

  it('tỷ lệ hoàn thành = đã duyệt / đã tới hạn trong kỳ (bỏ việc hủy, việc chưa tới hạn)', () => {
    // việc hạn 28/10 chưa tới hạn → chưa tính
    expect(s.dueInPeriod).toBe(3)
    expect(s.completedOfDue).toBe(2)
    expect(s.completionRate).toBe(67)
  })
  it('đúng hạn tính theo thời điểm nhân viên nộp', () => {
    expect(s.onTimeOfCompleted).toBe(50)
    expect(s.onTimeOfDue).toBe(33)
  })
  it('năng suất có trọng số', () => {
    expect(s.weightDue).toBe(6)
    expect(s.weightDone).toBe(4)
    expect(s.weightedRate).toBe(67)
  })
  it('chất lượng, sửa lại, quá hạn, khối lượng', () => {
    expect(s.qualityAvg).toBe(4)
    expect(s.revisions).toBe(1)
    expect(s.overdueNow).toBe(1)
    expect(s.maxOverdueDays).toBe(3)
    expect(s.activeNow).toBe(3)
    expect(s.activeHours).toBe(6)
    expect(s.noDueOpen).toBe(1)
  })
  it('tổng quan và tiến độ có trọng số', () => {
    const sum = summarize(tasks, range, NOW)
    expect(employeeStat(tasks, 'u3', range, NOW).completionRate).toBe(100)
    expect(sum.completed).toBe(4)
    expect(sum.active).toBe(3)
    expect(sum.overdue).toBe(1)
    expect(sum.onTimeRate).toBe(75)
    expect(weightedProgress([task({ weight: 1, status: 'hoan_thanh' }), task({ weight: 3, progress: 0 })])).toBe(25)
    expect(brandStat(tasks, NOW).total).toBe(7)
  })
  it('biểu đồ hoàn thành theo ngày', () => {
    const days = dailyCompletions(tasks, presetRange('week', NOW))
    expect(days).toHaveLength(7)
    expect(days.reduce((a, d) => a + d.count, 0)).toBe(1)
    const m = dailyCompletions(tasks, range)
    expect(m.find((d) => d.key === '2026-10-09')?.count).toBe(1)
  })
})

describe('nhóm Công việc của tôi', () => {
  it('phân nhóm đúng', () => {
    expect(myBucket(task({ due_at: dueAtFromDateKey('2026-10-15') }), NOW)).toBe('hom_nay')
    expect(myBucket(task({ due_at: dueAtFromDateKey('2026-10-17') }), NOW)).toBe('sap_den_han')
    expect(myBucket(task({ due_at: dueAtFromDateKey('2026-10-13') }), NOW)).toBe('qua_han')
    expect(myBucket(task({ status: 'can_chinh_sua', due_at: dueAtFromDateKey('2026-10-13') }), NOW)).toBe('can_chinh_sua')
    expect(myBucket(task({ due_at: null }), NOW)).toBe('dang_thuc_hien')
  })
})

describe('Giai đoạn 2: xu hướng, điểm tổng hợp', () => {
  it('xu hướng 8 tuần, tuần cuối là tuần hiện tại', () => {
    const t = [
      task({ status: 'hoan_thanh', due_at: '2026-10-13T16:59:59Z', completed_at: '2026-10-13T03:00:00Z' }),
      task({ status: 'dang_thuc_hien', due_at: '2026-10-06T16:59:59Z' }),
    ]
    const tr = weeklyTrend(t, 'u1', 8, NOW)
    expect(tr).toHaveLength(8)
    expect(tr[7].key).toBe('2026-10-12')
    expect(tr[7].completionRate).toBe(100)
    expect(tr[6].completionRate).toBe(0)
    expect(tr[0].completionRate).toBeNull()
  })
  it('điểm tổng hợp bỏ chỉ số chưa có dữ liệu', () => {
    const base = employeeStat([], 'u1', presetRange('month', NOW), NOW)
    expect(combinedScore(base, DEFAULT_KPI_WEIGHTS)).toBeNull()
    const s = { ...base, completionRate: 80, onTimeOfDue: 60, weightedRate: 100, qualityAvg: null }
    expect(combinedScore(s, DEFAULT_KPI_WEIGHTS)).toBe(Math.round((80 * 30 + 60 * 30 + 100 * 25) / 85))
  })
})
