import clsx from 'clsx'
import { ArrowLeft, FileDown, FileSpreadsheet, Printer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Avatar, Badge, Button, DemoTag, ErrorBox, fmtNum, fmtPct, Loading, PageHeader, StatCard, useToast } from '../components/ui'
import { useAuth, useMe } from '../contexts/AuthContext'
import { useContent, useLookups, useTasks } from '../hooks/queries'
import { BRAND_STYLE, PRIORITY_LABEL, STATUS_LABEL } from '../lib/constants'
import { customRange, fmtDate, fmtDateTime, fmtShort, inRange, vnDateKey, type Range } from '../lib/dates'
import {
  dailyCompletions,
  employeeStat,
  groupStat,
  isDone,
  isOnTime,
  isOverdue,
  overdueDays,
  summarize,
  taskPeople,
  weeklyTrend,
  type EmployeeStat,
} from '../lib/metrics'
import { contentSummary, downloadCsv, downloadXlsx, GOAL_HEALTH, GOAL_TYPE_LABEL, PLATFORM_LABEL, periodLabel, type Cell, type Sheet } from '../lib/phase3'
import type { Task } from '../lib/types'
import { PeriodPicker, usePeriodFilter } from './DashboardPage'
import { useGoalRows } from './GoalsPage'

const lastKey = (r: Range) => vnDateKey(new Date(r.to.getTime() - 1))
const qualityText = (s: EmployeeStat) => (s.qualityAvg != null ? `${s.qualityAvg}/5` : '—')

/** Việc thuộc kỳ báo cáo: có hạn trong kỳ hoặc hoàn thành trong kỳ (bỏ việc hủy) */
const tasksInPeriod = (tasks: Task[], r: Range) => tasks.filter((t) => t.status !== 'da_huy' && (inRange(t.due_at, r) || (isDone(t) && inRange(t.completed_at, r))))

function Section({ title, children, onCsv, className }: { title: string; children: ReactNode; onCsv?: () => void; className?: string }) {
  return (
    <section className={clsx('card mt-6 p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {onCsv && (
          <Button size="sm" variant="ghost" className="no-print" icon={<FileDown className="size-3.5" />} onClick={onCsv}>
            CSV
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

function Table({ head, rows, align }: { head: string[]; rows: ReactNode[][]; align?: ('l' | 'r')[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-line text-xs text-ink-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={clsx('px-2 py-2 font-medium', align?.[i] === 'r' ? 'text-right' : 'text-left')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={clsx('num px-2 py-2', align?.[j] === 'r' && 'text-right')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReportsPage() {
  const tasksQ = useTasks()
  const contentQ = useContent()
  const { brands, brandById, profiles, profileById, projectById, isLoading } = useLookups()
  const goals = useGoalRows()
  const period = usePeriodFilter('month')
  const [brandId, setBrandId] = useState('')
  const [exporting, setExporting] = useState(false)
  const toast = useToast()

  if (tasksQ.isLoading || contentQ.isLoading || isLoading || goals.isLoading) return <Loading />
  if (tasksQ.error) return <ErrorBox error={tasksQ.error} onRetry={() => tasksQ.refetch()} />

  const now = new Date()
  const r = period.range
  const fromKey = vnDateKey(r.from)
  const toKey = lastKey(r)
  const all = (tasksQ.data ?? []).filter((t) => !brandId || t.brand_id === brandId)
  const content = (contentQ.data ?? []).filter((c) => !brandId || c.brand_id === brandId)
  const shownBrands = brands.filter((b) => !brandId || b.id === brandId)
  const sum = summarize(all, r, now)
  const team = groupStat(all, r, now)
  const staff = profiles.filter((p) => p.is_active && p.role === 'employee')
  const empStats = staff.map((p) => ({ p, s: employeeStat(all, p.id, r, now) }))
  const brandRows = shownBrands.map((b) => {
    const bt = all.filter((t) => t.brand_id === b.id)
    return { b, s: groupStat(bt, r, now), done: bt.filter((t) => isDone(t) && inRange(t.completed_at, r)).length, open: bt.filter((t) => !['hoan_thanh', 'da_huy'].includes(t.status)).length }
  })
  const trend = weeklyTrend(all, null, 8, now).map((t) => ({ ...t, label: fmtShort(t.from) }))
  const daily = dailyCompletions(all, r).map((d) => ({ ...d, label: d.key.slice(8) + '/' + d.key.slice(5, 7) }))
  const contentRows = shownBrands.map((b) => ({ b, s: contentSummary(content.filter((c) => c.brand_id === b.id), fromKey, toKey, now) }))
  const goalRows = goals.rows.filter((g) => g.goal.period_start <= toKey && g.goal.period_end >= fromKey && (!brandId || g.goal.brand_id === brandId))
  const periodTasks = tasksInPeriod(all, r)
  const fileBase = `bao-cao_${fromKey}_${toKey}${brandId ? '_' + brandById.get(brandId)?.slug : ''}`

  // ---------- Dữ liệu xuất ----------
  const sheetSummary: Cell[][] = [
    ['Chỉ số', 'Giá trị'],
    ['Kỳ báo cáo', `${fmtDate(r.from)} – ${fmtDate(new Date(r.to.getTime() - 1))}`],
    ['Thương hiệu', brandId ? brandById.get(brandId)?.name : 'Tất cả'],
    ['Việc đang mở (hiện tại)', sum.active],
    ['Hoàn thành trong kỳ', sum.completed],
    ['Đúng hạn (trong số việc xong có hạn, %)', sum.onTimeRate],
    ['Việc đến hạn trong kỳ', team.dueInPeriod],
    ['Tỷ lệ hoàn thành việc đến hạn (%)', team.completionRate],
    ['Đúng hạn trên việc đến hạn (%)', team.onTimeOfDue],
    ['Khối lượng có trọng số (%)', team.weightedRate],
    ['Quá hạn (hiện tại)', sum.overdue],
    ['Chờ duyệt (hiện tại)', sum.awaitingApproval],
    ['Xuất lúc', fmtDateTime(now)],
  ]
  const sheetBrands: Cell[][] = [
    ['Thương hiệu', 'Hoàn thành trong kỳ', 'Việc đến hạn', 'Hoàn thành việc đến hạn (%)', 'Đúng hạn (%)', 'Trọng số (%)', 'Quá hạn hiện tại', 'Đang mở'],
    ...brandRows.map(({ b, s, done, open }) => [b.name, done, s.dueInPeriod, s.completionRate, s.onTimeOfDue, s.weightedRate, s.overdueNow, open]),
  ]
  const sheetStaff: Cell[][] = [
    ['Nhân viên', 'Việc đến hạn', 'Đã xong', 'A. Hoàn thành (%)', 'B. Đúng hạn (%)', 'C. Trọng số (%)', 'D. Chất lượng TB (/5)', 'E. Số lần sửa', 'F. Quá hạn', 'G. Việc đang mở', 'Giờ ước tính đang mở'],
    ...empStats.map(({ p, s }) => [p.full_name, s.dueInPeriod, s.completedOfDue, s.completionRate, s.onTimeOfDue, s.weightedRate, s.qualityAvg, s.revisions, s.overdueNow, s.activeNow, s.activeHours]),
  ]
  const sheetTasks: Cell[][] = [
    ['Công việc', 'Thương hiệu', 'Dự án', 'Người thực hiện', 'Trạng thái', 'Ưu tiên', 'Trọng số', 'Hạn chót', 'Hoàn thành (nộp)', 'Đúng hạn', 'Điểm chất lượng', 'Số lần sửa', 'Số ngày quá hạn'],
    ...periodTasks.map((t) => [
      t.title,
      brandById.get(t.brand_id)?.name,
      t.project_id ? projectById.get(t.project_id)?.name : '',
      taskPeople(t)
        .map((id) => profileById.get(id)?.full_name)
        .filter(Boolean)
        .join(', '),
      STATUS_LABEL[t.status],
      PRIORITY_LABEL[t.priority],
      t.weight,
      t.due_at ? fmtDateTime(t.due_at) : '',
      t.completed_at ? fmtDateTime(t.completed_at) : '',
      isOnTime(t) == null ? '' : isOnTime(t) ? 'Có' : 'Không',
      t.quality_score,
      t.revision_count,
      isOverdue(t, now) ? overdueDays(t, now) : '',
    ]),
  ]
  const sheetContent: Cell[][] = [
    ['Thương hiệu', 'Bài dự kiến', 'Đã đăng', 'Trễ lịch', 'Chờ duyệt', 'Lượt xem', 'Tương tác', 'Tỷ lệ tương tác (%)', 'Khách tiềm năng'],
    ...contentRows.map(({ b, s }) => [b.name, s.planned, s.published, s.late, s.waiting, s.views, s.engagements, s.engagementRate, s.leads]),
  ]
  const sheetGoals: Cell[][] = [
    ['Mục tiêu', 'Thương hiệu', 'Loại', 'Kỳ', 'Chỉ tiêu', 'Thực tế', 'Đơn vị', '% đạt', '% thời gian đã qua', 'Đánh giá'],
    ...goalRows.map((g) => [
      g.goal.name,
      brandById.get(g.goal.brand_id)?.name,
      GOAL_TYPE_LABEL[g.goal.goal_type],
      periodLabel(g.goal),
      Number(g.goal.target_value),
      g.actual,
      g.goal.unit,
      g.percent,
      g.elapsed,
      GOAL_HEALTH[g.health].label,
    ]),
  ]
  const exportExcel = async () => {
    setExporting(true)
    try {
      const sheets: Sheet[] = [
        { name: 'Tổng quan', rows: sheetSummary },
        { name: 'Thương hiệu', rows: sheetBrands },
        { name: 'Nhân viên', rows: sheetStaff },
        { name: 'Công việc', rows: sheetTasks },
        { name: 'Nội dung', rows: sheetContent },
        { name: 'Mục tiêu', rows: sheetGoals },
      ]
      await downloadXlsx(sheets, `${fileBase}.xlsx`)
      toast.ok('Đã xuất file Excel')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không xuất được file Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Báo cáo"
        subtitle={`Kỳ: ${period.label} (${fmtDate(r.from)} – ${fmtDate(new Date(r.to.getTime() - 1))})${brandId ? ` · ${brandById.get(brandId)?.name}` : ''}. Số liệu tính trực tiếp từ dữ liệu hiện có.`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="primary" icon={<FileSpreadsheet className="size-4" />} loading={exporting} onClick={exportExcel}>
              Xuất Excel
            </Button>
            <Button icon={<FileDown className="size-4" />} onClick={() => downloadCsv(sheetTasks, `${fileBase}_cong-viec.csv`)}>
              Xuất CSV công việc
            </Button>
            <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
              In / Lưu PDF
            </Button>
          </div>
        }
      />
      <div className="no-print card mb-4 flex flex-wrap items-center gap-2 p-3">
        <PeriodPicker f={period} />
        <select className="input w-auto" value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Lọc thương hiệu">
          <option value="">Tất cả thương hiệu</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Hoàn thành trong kỳ" value={sum.completed} tone="ok" />
        <StatCard label="Hoàn thành việc đến hạn" value={fmtPct(team.completionRate)} hint={`${team.completedOfDue}/${team.dueInPeriod} việc`} />
        <StatCard label="Đúng hạn (trên việc đến hạn)" value={fmtPct(team.onTimeOfDue)} tone="warn" />
        <StatCard label="Khối lượng trọng số" value={fmtPct(team.weightedRate)} tone="info" />
        <StatCard label="Quá hạn (hiện tại)" value={sum.overdue} tone="danger" />
        <StatCard label="Chờ duyệt (hiện tại)" value={sum.awaitingApproval} tone="violet" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Xu hướng 8 tuần (cả đội)</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#ece6de" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => (v == null ? '—' : `${v}%`)} labelFormatter={(l) => `Tuần từ ${l}`} contentStyle={{ borderRadius: 12, border: '1px solid #e8e2da', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="completionRate" name="Hoàn thành" stroke="#2f7d4f" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="onTimeOfDue" name="Đúng hạn" stroke="#a86a12" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="weightedRate" name="Trọng số" stroke="#2f5fa8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Việc hoàn thành theo ngày trong kỳ</h2>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#ece6de" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [v, 'Việc hoàn thành']} contentStyle={{ borderRadius: 12, border: '1px solid #e8e2da', fontSize: 12 }} />
                <Bar dataKey="count" fill="#2b2724" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <Section title="Theo thương hiệu" onCsv={() => downloadCsv(sheetBrands, `${fileBase}_thuong-hieu.csv`)}>
        <Table
          head={sheetBrands[0] as string[]}
          align={['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
          rows={brandRows.map(({ b, s, done, open }) => [
            <span key="name" className="flex items-center gap-1.5 font-sans">
              <span className={clsx('size-2 rounded-full', BRAND_STYLE[b.color].bg)} /> {b.name}
            </span>,
            done,
            s.dueInPeriod,
            fmtPct(s.completionRate),
            fmtPct(s.onTimeOfDue),
            fmtPct(s.weightedRate),
            s.overdueNow,
            open,
          ])}
        />
      </Section>

      <Section title="Theo nhân viên" onCsv={() => downloadCsv(sheetStaff, `${fileBase}_nhan-vien.csv`)}>
        <Table
          head={['Nhân viên', 'Đến hạn', 'Xong', 'A. Hoàn thành', 'B. Đúng hạn', 'C. Trọng số', 'D. Chất lượng', 'E. Sửa', 'F. Quá hạn', 'G. Đang mở', '']}
          align={['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
          rows={empStats.map(({ p, s }) => [
            <span key="name" className="flex items-center gap-2 font-sans">
              <Avatar profile={p} size={22} /> {p.full_name} {p.is_demo && <DemoTag />}
            </span>,
            s.dueInPeriod,
            s.completedOfDue,
            fmtPct(s.completionRate),
            fmtPct(s.onTimeOfDue),
            fmtPct(s.weightedRate),
            qualityText(s),
            s.revisions,
            <span key="overdue" className={s.overdueNow ? 'text-danger' : ''}>{s.overdueNow}</span>,
            s.activeNow,
            <Link key="monthly" className="no-print font-sans text-xs text-info hover:underline" to={`/bao-cao/nhan-vien/${p.id}?thang=${toKey.slice(0, 7)}`}>
              Tổng kết tháng
            </Link>,
          ])}
        />
        <p className="mt-2 text-xs text-ink-muted">Các chỉ số hiển thị riêng, không gộp điểm. Công thức: docs/06-cong-thuc-kpi.md.</p>
      </Section>

      <Section title="Lịch nội dung" onCsv={() => downloadCsv(sheetContent, `${fileBase}_noi-dung.csv`)}>
        <Table
          head={['Thương hiệu', 'Dự kiến', 'Đã đăng', 'Trễ lịch', 'Chờ duyệt', 'Lượt xem', 'Tương tác', 'Tỷ lệ TT', 'Khách']}
          align={['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
          rows={contentRows.map(({ b, s }) => [
            <span key="name" className="font-sans">{b.name}</span>,
            s.planned,
            s.published,
            s.late,
            s.waiting,
            fmtNum(s.views),
            fmtNum(s.engagements),
            s.engagementRate != null ? `${fmtNum(s.engagementRate)}%` : '—',
            fmtNum(s.leads),
          ])}
        />
        <p className="mt-2 text-xs text-ink-muted">Tính theo ngày đăng dự kiến trong kỳ; số liệu xem/tương tác/khách chỉ cộng bài đã đăng. Kênh: {Object.values(PLATFORM_LABEL).join(', ')}.</p>
      </Section>

      <Section title="Mục tiêu có kỳ giao với kỳ báo cáo" onCsv={() => downloadCsv(sheetGoals, `${fileBase}_muc-tieu.csv`)}>
        {goalRows.length === 0 ? (
          <p className="text-sm text-ink-muted">Không có mục tiêu.</p>
        ) : (
          <Table
            head={['Mục tiêu', 'Kỳ', 'Chỉ tiêu', 'Thực tế', '% đạt', 'Thời gian đã qua', 'Đánh giá']}
            align={['l', 'l', 'r', 'r', 'r', 'r', 'r']}
            rows={goalRows.map((g) => [
              <span key="name" className="font-sans">
                {g.goal.name} <span className="text-xs text-ink-muted">· {brandById.get(g.goal.brand_id)?.name} · {GOAL_TYPE_LABEL[g.goal.goal_type]}</span>
              </span>,
              periodLabel(g.goal),
              `${fmtNum(Number(g.goal.target_value))} ${g.goal.unit ?? ''}`,
              fmtNum(g.actual),
              `${g.percent}%`,
              `${g.elapsed}%`,
              <Badge key="health" className={GOAL_HEALTH[g.health].cls}>{GOAL_HEALTH[g.health].label}</Badge>,
            ])}
          />
        )}
      </Section>
      <p className="mt-4 text-xs text-ink-muted">
        "In / Lưu PDF" dùng hộp thoại in của trình duyệt: chọn máy in "Lưu thành PDF" để có file PDF. Danh sách công việc chi tiết ({periodTasks.length} việc) có trong file Excel / CSV.
      </p>
    </>
  )
}

// ======================= TỔNG KẾT THÁNG TỪNG NHÂN VIÊN (bản in) =======================
export function MonthlySummaryPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const me = useMe()
  const { isAdmin } = useAuth()
  const tasksQ = useTasks()
  const contentQ = useContent()
  const goals = useGoalRows()
  const { profileById, brandById, isLoading } = useLookups()
  const month = params.get('thang') ?? vnDateKey(new Date()).slice(0, 7)

  if (!isAdmin && id !== me.id) return <Navigate to={`/bao-cao/nhan-vien/${me.id}?thang=${month}`} replace />
  if (tasksQ.isLoading || contentQ.isLoading || goals.isLoading || isLoading) return <Loading />
  if (tasksQ.error) return <ErrorBox error={tasksQ.error} onRetry={() => tasksQ.refetch()} />
  const p = profileById.get(id)
  if (!p) return <Navigate to="/nhan-vien" replace />

  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const fromKey = `${month}-01`
  const toKey = `${month}-${String(last).padStart(2, '0')}`
  const range = customRange(fromKey, toKey)
  const now = new Date()
  const tasks = tasksQ.data ?? []
  const s = employeeStat(tasks, id, range, now)
  const mine = tasks.filter((t) => t.status !== 'da_huy' && taskPeople(t).includes(id))
  const doneInMonth = mine.filter((t) => isDone(t) && inRange(t.completed_at, range)).sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))
  const lateDone = doneInMonth.filter((t) => isOnTime(t) === false)
  const overdue = mine.filter((t) => isOverdue(t, now))
  const myContent = (contentQ.data ?? []).filter((c) => c.responsible_id === id && c.publish_date && c.publish_date >= fromKey && c.publish_date <= toKey)
  const cs = contentSummary(myContent, fromKey, toKey, now)
  const myGoals = goals.rows.filter((g) => (g.goal.goal_members ?? []).some((x) => x.user_id === id) && g.goal.period_start <= toKey && g.goal.period_end >= fromKey)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to={isAdmin ? '/bao-cao' : `/nhan-vien/${id}`} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="size-4" /> Quay lại
        </Link>
        <div className="flex items-center gap-2">
          <input type="month" className="input w-auto" aria-label="Chọn tháng" value={month} onChange={(e) => e.target.value && setParams({ thang: e.target.value })} />
          <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
            In / Lưu PDF
          </Button>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 border-b border-line pb-4">
          <Avatar profile={p} size={44} />
          <div className="flex-1">
            <h1 className="text-xl font-semibold">
              Tổng kết tháng {m}/{y}
            </h1>
            <p className="text-sm text-ink-soft">
              {p.full_name} · {p.job_title ?? 'Nhân viên'} {p.is_demo && <DemoTag />}
            </p>
          </div>
          <p className="text-right text-xs text-ink-muted">
            Lập lúc {fmtDateTime(now)}
            <br />
            Giờ Việt Nam (GMT+7)
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['A. Hoàn thành việc đến hạn', fmtPct(s.completionRate), `${s.completedOfDue}/${s.dueInPeriod} việc`],
            ['B. Đúng hạn', fmtPct(s.onTimeOfDue), `${fmtPct(s.onTimeOfCompleted)} trong số việc xong`],
            ['C. Khối lượng trọng số', fmtPct(s.weightedRate), `${s.weightDone}/${s.weightDue} điểm`],
            ['D. Chất lượng TB', qualityText(s), `${s.qualityCount} việc được chấm`],
            ['E. Số lần phải sửa', String(s.revisions), 'trên việc đến hạn'],
            ['F. Đang quá hạn', String(s.overdueNow), s.maxOverdueDays ? `lâu nhất ${s.maxOverdueDays} ngày` : 'không có'],
            ['G. Việc đang mở', String(s.activeNow), `${fmtNum(s.activeHours)} giờ ước tính`],
            ['Hoàn thành trong tháng', String(doneInMonth.length), `${lateDone.length} việc nộp sau hạn`],
          ].map(([l, v, h]) => (
            <div key={l} className="rounded-xl bg-sunken p-3">
              <p className="text-xs text-ink-soft">{l}</p>
              <p className="num text-xl font-semibold">{v}</p>
              <p className="text-xs text-ink-muted">{h}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-6 mb-2 text-sm font-semibold">Việc đã hoàn thành trong tháng ({doneInMonth.length})</h2>
        {doneInMonth.length === 0 ? (
          <p className="text-sm text-ink-muted">Không có.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-ink-muted">
              <tr>
                <th className="py-1.5 font-medium">Công việc</th>
                <th className="py-1.5 font-medium">Hạn chót</th>
                <th className="py-1.5 font-medium">Nộp</th>
                <th className="py-1.5 text-right font-medium">Điểm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {doneInMonth.map((t) => (
                <tr key={t.id}>
                  <td className="py-1.5">
                    {t.title} <span className="text-xs text-ink-muted">· {brandById.get(t.brand_id)?.name}</span>
                  </td>
                  <td className="num py-1.5">{t.due_at ? fmtDate(t.due_at) : '—'}</td>
                  <td className={clsx('num py-1.5', isOnTime(t) === false && 'text-danger')}>{fmtDate(t.completed_at)}</td>
                  <td className="num py-1.5 text-right">{t.quality_score ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {overdue.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-sm font-semibold text-danger">Đang quá hạn ({overdue.length})</h2>
            <ul className="list-disc pl-5 text-sm">
              {overdue.map((t) => (
                <li key={t.id}>
                  {t.title} — trễ {overdueDays(t, now)} ngày ({STATUS_LABEL[t.status]})
                </li>
              ))}
            </ul>
          </>
        )}

        {myGoals.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-sm font-semibold">Mục tiêu phụ trách</h2>
            <ul className="space-y-1 text-sm">
              {myGoals.map((g) => (
                <li key={g.goal.id} className="flex justify-between gap-2">
                  <span>
                    {g.goal.name} <span className="text-xs text-ink-muted">· {periodLabel(g.goal)}</span>
                  </span>
                  <span className="num">
                    {fmtNum(g.actual)}/{fmtNum(Number(g.goal.target_value))} {g.goal.unit} · <b>{g.percent}%</b>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {myContent.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-sm font-semibold">Nội dung phụ trách</h2>
            <p className="text-sm text-ink-soft">
              {cs.planned} bài dự kiến · {cs.published} đã đăng · {cs.late} trễ lịch · {fmtNum(cs.views)} lượt xem · {fmtNum(cs.leads)} khách tiềm năng
            </p>
          </>
        )}

        <p className="mt-6 border-t border-line pt-3 text-xs text-ink-muted">
          Việc đến hạn = việc có hạn trong tháng đã tới hạn hoặc đã xong; việc đã hủy không tính. Thời điểm hoàn thành là lúc nhân viên nộp bản được duyệt. Các chỉ số không gộp thành một điểm.
        </p>
      </div>
    </div>
  )
}
