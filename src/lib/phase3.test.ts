import { describe, expect, it } from 'vitest'
import { contentProgress, contentState, contentSummary, goalActual, goalHealth, goalPercent, periodBounds, periodElapsed, periodLabel, toCsv } from './phase3'
import type { ContentItem, Goal, Task } from './types'

const NOW = new Date('2026-10-15T08:00:00+07:00')

const goal = (p: Partial<Goal>): Goal => ({
  id: 'g', brand_id: 'b', name: 'G', description: null, goal_type: 'cong_viec', metric: 'so_viec', period_type: 'thang',
  period_start: '2026-10-01', period_end: '2026-10-31', target_value: 10, actual_value: 0, unit: null, is_demo: false,
  created_at: '', updated_at: '', ...p,
})
const t = (id: string, status: Task['status'], weight = 1) => ({ id, status, weight }) as Task

const content = (p: Partial<ContentItem>): ContentItem => ({
  id: 'c', brand_id: 'b', task_id: null, platform: 'tiktok', topic: 'x', content_type: null, script_status: 'chua_bat_dau',
  filming_status: 'chua_bat_dau', editing_status: 'chua_bat_dau', approval_status: 'chua_bat_dau', approval_note: null,
  publish_date: null, published_at: null, responsible_id: null, content_url: null, views: null, engagements: null, leads: null,
  notes: null, is_demo: false, created_at: '', updated_at: '', ...p,
})

describe('mục tiêu', () => {
  const tasks = new Map([['a', t('a', 'hoan_thanh', 3)], ['b', t('b', 'hoan_thanh', 2)], ['c', t('c', 'cho_duyet', 5)], ['d', t('d', 'da_huy', 5)]])
  const links = ['a', 'b', 'c', 'd', 'khong-thay'].map((task_id) => ({ task_id }))
  it('tự tính số việc / trọng số đã hoàn thành, bỏ việc hủy và việc chưa duyệt', () => {
    expect(goalActual(goal({ metric: 'so_viec', goal_tasks: links }), tasks)).toBe(2)
    expect(goalActual(goal({ metric: 'trong_so', goal_tasks: links }), tasks)).toBe(5)
  })
  it('nhập tay dùng actual_value', () => {
    expect(goalActual(goal({ metric: 'thu_cong', actual_value: 74 }), tasks)).toBe(74)
  })
  it('% đạt và đánh giá theo thời gian đã qua', () => {
    expect(goalPercent(74, 120)).toBe(62)
    expect(goalPercent(130, 100)).toBe(130)
    const el = periodElapsed(goal({}), NOW)
    expect(el).toBeGreaterThan(40)
    expect(el).toBeLessThan(50)
    expect(goalHealth(62, el)).toBe('dung_tien_do')
    expect(goalHealth(20, el)).toBe('cham')
    expect(goalHealth(100, 10)).toBe('dat')
    expect(goalHealth(80, 100)).toBe('chua_dat')
    expect(goalHealth(0, 0)).toBe('chua_bat_dau')
  })
  it('kỳ tháng / quý', () => {
    expect(periodBounds('thang', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(periodBounds('quy', '2026-11-03')).toEqual({ start: '2026-10-01', end: '2026-12-31' })
    expect(periodLabel({ period_type: 'quy', period_start: '2026-10-01' })).toBe('Quý 4/2026')
  })
})

describe('lịch nội dung', () => {
  it('trạng thái tổng', () => {
    expect(contentState(content({ published_at: '2026-10-01T00:00:00Z', publish_date: '2026-10-01' }), NOW)).toBe('da_dang')
    expect(contentState(content({ publish_date: '2026-10-14' }), NOW)).toBe('tre')
    expect(contentState(content({ publish_date: '2026-10-15' }), NOW)).toBe('dang_san_xuat')
    expect(contentState(content({ publish_date: '2026-10-16', script_status: 'xong', filming_status: 'khong_can', editing_status: 'xong', approval_status: 'da_duyet' }), NOW)).toBe('san_sang')
    expect(contentState(content({}), NOW)).toBe('chua_len_lich')
  })
  it('% sản xuất bỏ qua bước "không cần"', () => {
    expect(contentProgress(content({ script_status: 'xong', filming_status: 'khong_can', editing_status: 'dang_lam' }))).toBe(33)
    expect(contentProgress(content({ script_status: 'xong', filming_status: 'xong', editing_status: 'xong', approval_status: 'da_duyet' }))).toBe(100)
  })
  it('tổng hợp chỉ tính số liệu của bài đã đăng trong kỳ', () => {
    const s = contentSummary(
      [
        content({ publish_date: '2026-10-02', published_at: '2026-10-02T12:00:00Z', views: 1000, engagements: 50, leads: 3 }),
        content({ publish_date: '2026-10-10', approval_status: 'cho_duyet' }),
        content({ publish_date: '2026-10-20', views: 999 }),
        content({ publish_date: '2026-09-30', published_at: '2026-09-30T12:00:00Z', views: 5000 }),
      ],
      '2026-10-01',
      '2026-10-31',
      NOW,
    )
    expect(s).toMatchObject({ planned: 3, published: 1, late: 1, waiting: 1, views: 1000, engagements: 50, leads: 3, engagementRate: 5 })
  })
})

describe('CSV', () => {
  it('có BOM, thoát dấu phẩy và ngoặc kép', () => {
    expect(toCsv([['Tên', 'Ghi chú'], ['Minh Anh', 'a, "b"'], [null, 3]])).toBe('﻿Tên,Ghi chú\r\nMinh Anh,"a, ""b"""\r\n,3')
  })
})
