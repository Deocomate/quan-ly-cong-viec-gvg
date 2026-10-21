import clsx from 'clsx'
import { CheckCircle2, Clock, Hourglass, ListTodo, PlayCircle, Timer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DueText } from '../components/TaskList'
import {
  Avatar,
  Button,
  DemoTag,
  EmptyState,
  ErrorBox,
  fmtNum,
  fmtPct,
  Loading,
  PageHeader,
  ProgressBar,
  StatCard,
} from '../components/ui'
import { ReviewModal } from '../components/WorkflowModals'
import { useLookups, useTasks } from '../hooks/queries'
import { BRAND_STYLE } from '../lib/constants'
import { customRange, fmtLong, fmtShort, fmtWeekday, presetRange, vnDateKey, vnStartOfDateKey, type PresetKey, type Range } from '../lib/dates'
import { brandStat, dailyCompletions, employeeStat, inRangeCompleted, isOverdue, overdueDays, summarize, taskPeople } from '../lib/metrics'
import type { Task } from '../lib/types'

export function usePeriodFilter(initial: PresetKey = 'week') {
  const today = vnDateKey(new Date())
  const [preset, setPreset] = useState<PresetKey>(initial)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const range: Range = useMemo(() => (preset === 'custom' ? customRange(from, to) : presetRange(preset)), [preset, from, to])
  const label =
    preset === 'today' ? 'Hôm nay' : preset === 'week' ? 'Tuần này' : preset === 'month' ? 'Tháng này' : `${fmtShort(range.from)} – ${fmtShort(new Date(range.to.getTime() - 1))}`
  return { preset, setPreset, from, setFrom, to, setTo, range, label }
}

export function PeriodPicker({ f }: { f: ReturnType<typeof usePeriodFilter> }) {
  const opts: [PresetKey, string][] = [
    ['today', 'Hôm nay'],
    ['week', 'Tuần này'],
    ['month', 'Tháng này'],
    ['custom', 'Tùy chọn'],
  ]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="grid w-full grid-cols-4 rounded-xl bg-sunken p-1 sm:inline-flex sm:w-auto">
        {opts.map(([k, l]) => (
          <button
            key={k}
            onClick={() => f.setPreset(k)}
            className={clsx('min-h-9 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap sm:px-3 sm:text-sm', f.preset === k ? 'bg-surface shadow-sm' : 'text-ink-soft hover:text-ink')}
          >
            {l}
          </button>
        ))}
      </div>
      {f.preset === 'custom' && (
        <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <input type="date" className="input min-w-0 flex-1 py-1.5 sm:w-auto sm:flex-none" value={f.from} onChange={(e) => f.setFrom(e.target.value)} aria-label="Từ ngày" />
          <span className="text-ink-muted">–</span>
          <input type="date" className="input min-w-0 flex-1 py-1.5 sm:w-auto sm:flex-none" value={f.to} onChange={(e) => f.setTo(e.target.value)} aria-label="Đến ngày" />
        </div>
      )}
    </div>
  )
}

export function DashboardPage() {
  const tasksQ = useTasks()
  const { brands, profiles, brandById, profileById, projectById, isLoading, error } = useLookups()
  const period = usePeriodFilter('week')
  const [brandId, setBrandId] = useState('')
  const [personId, setPersonId] = useState('')
  const [attention, setAttention] = useState<'overdue' | 'blocked' | 'approval'>('overdue')
  const [reviewing, setReviewing] = useState<Task | null>(null)

  const employees = profiles.filter((p) => p.is_active && p.role === 'employee')
  const all = useMemo(() => tasksQ.data ?? [], [tasksQ.data])
  const scoped = useMemo(
    () => all.filter((t) => (!brandId || t.brand_id === brandId) && (!personId || taskPeople(t).includes(personId))),
    [all, brandId, personId],
  )
  const now = new Date()
  const summary = summarize(scoped, period.range, now)
  const daily = dailyCompletions(scoped, period.range).map((d) => {
    const date = vnStartOfDateKey(d.key)
    return { ...d, label: `${fmtWeekday(date)} ${fmtShort(date)}` }
  })
  const hasDemo = all.some((t) => t.is_demo)

  if (tasksQ.isLoading || isLoading) return <Loading />
  if (tasksQ.error || error) return <ErrorBox error={tasksQ.error || error} onRetry={() => tasksQ.refetch()} />

  const overdueList = scoped.filter((t) => isOverdue(t, now)).sort((a, b) => overdueDays(b, now) - overdueDays(a, now))
  const blockedList = scoped.filter((t) => t.is_blocked && t.status !== 'hoan_thanh' && t.status !== 'da_huy')
  const approvalList = scoped.filter((t) => t.status === 'cho_duyet').sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
  const attentionList = attention === 'overdue' ? overdueList : attention === 'blocked' ? blockedList : approvalList

  return (
    <>
      <PageHeader title="Tổng quan" subtitle={<span className="first-letter:uppercase">{fmtLong(now)}</span>} />

      {hasDemo && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#e6d8c4] bg-[#fbf4ea] px-4 py-2.5 text-sm">
          <DemoTag />
          <span className="text-ink-soft">Đang hiển thị cả dữ liệu mẫu.</span>
          <Link to="/cai-dat" className="font-medium underline">
            Xóa dữ liệu mẫu
          </Link>
        </div>
      )}

      {/* Bộ lọc */}
      <div className="mb-4 flex flex-col gap-2 sm:mb-6 lg:flex-row lg:items-center lg:justify-between">
        <PeriodPicker f={period} />
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <select className="input lg:w-44" value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Lọc thương hiệu">
            <option value="">Tất cả thương hiệu</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select className="input lg:w-44" value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Lọc nhân viên">
            <option value="">Tất cả nhân viên</option>
            {profiles
              .filter((p) => p.is_active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Thẻ tổng hợp */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 xl:grid-cols-6">
        <StatCard label="Việc đang mở" value={summary.active} hint="Hiện tại" icon={<ListTodo className="size-4" />} />
        <StatCard label="Hoàn thành" value={summary.completed} hint={period.label} tone="ok" icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="Đang thực hiện" value={summary.inProgress} hint="Hiện tại" tone="info" icon={<PlayCircle className="size-4" />} />
        <StatCard label="Quá hạn" value={summary.overdue} hint="Hiện tại" tone="danger" icon={<Clock className="size-4" />} />
        <StatCard label="Chờ duyệt" value={summary.awaitingApproval} hint="Cần bạn xử lý" tone="violet" icon={<Hourglass className="size-4" />} />
        <StatCard
          label="Tỷ lệ đúng hạn"
          value={fmtPct(summary.onTimeRate)}
          hint={summary.completedWithDue ? `${summary.completedWithDue} việc có hạn · ${period.label}` : `Chưa có việc xong · ${period.label}`}
          tone="warn"
          icon={<Timer className="size-4" />}
        />
      </div>

      <div className="mt-6 grid gap-6 sm:mt-8 xl:grid-cols-5">
        {/* Bảng chú ý */}
        <div className="card flex flex-col xl:col-span-2">
          <div className="flex gap-1 border-b border-line p-2">
            {(
              [
                ['overdue', 'Quá hạn', overdueList.length],
                ['blocked', 'Vướng mắc', blockedList.length],
                ['approval', 'Chờ duyệt', approvalList.length],
              ] as const
            ).map(([k, l, n]) => (
              <button
                key={k}
                onClick={() => setAttention(k)}
                className={clsx('min-h-10 flex-1 rounded-lg px-2 py-1.5 text-sm whitespace-nowrap', attention === k ? 'bg-sunken font-medium' : 'text-ink-soft hover:bg-sunken')}
              >
                {l} <span className={clsx('num ml-1 rounded-full px-1.5 text-xs', n ? 'bg-danger-soft text-danger' : 'bg-sunken text-ink-muted')}>{n}</span>
              </button>
            ))}
          </div>
          <div className="flex-1 divide-y divide-line lg:max-h-80 lg:overflow-y-auto">
            {attentionList.length === 0 ? (
              <EmptyState title="Không có việc cần chú ý" hint="Mọi thứ đang ổn trong mục này." />
            ) : (
              attentionList.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={clsx('size-2 shrink-0 rounded-full', BRAND_STYLE[brandById.get(t.brand_id)?.color ?? 'terracotta'].bg)} />
                  <Link to={`/cong-viec/${t.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:underline">{t.title}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {taskPeople(t)
                        .map((id) => profileById.get(id)?.full_name)
                        .filter(Boolean)
                        .join(', ') || 'Chưa giao'}
                      {t.project_id && projectById.get(t.project_id) ? ` · ${projectById.get(t.project_id)!.name}` : ''}
                    </p>
                    {attention === 'blocked' && t.blocker_note && <p className="mt-0.5 line-clamp-2 text-xs text-danger">{t.blocker_note}</p>}
                  </Link>
                  {attention === 'approval' ? (
                    <Button size="sm" variant="primary" onClick={() => setReviewing(t)}>
                      Duyệt
                    </Button>
                  ) : (
                    <DueText task={t} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Biểu đồ */}
        <div className="card p-4 xl:col-span-3">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Việc hoàn thành theo ngày</h2>
            <span className="text-xs text-ink-muted">{period.label}{daily.length >= 31 ? ' (31 ngày đầu)' : ''}</span>
          </div>
          <div className="h-48 sm:h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#ece6de" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: '#f3efe9' }}
                  formatter={(v) => [`${v} việc`, 'Hoàn thành']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e8e2da', fontSize: 12 }}
                />
                <Bar dataKey="count" fill="#2b2724" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Thương hiệu */}
      <h2 className="mt-6 mb-3 text-sm font-semibold text-ink-soft sm:mt-8">Tiến độ thương hiệu</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {brands.map((b) => {
          const bt = all.filter((t) => t.brand_id === b.id && (!personId || taskPeople(t).includes(personId)))
          const s = brandStat(bt, now)
          const doneInPeriod = bt.filter((t) => inRangeCompleted(t, period.range)).length
          const style = BRAND_STYLE[b.color]
          return (
            <Link
              key={b.id}
              to={`/thuong-hieu/${b.slug}`}
              className={clsx('card group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-md', brandId && brandId !== b.id && 'opacity-50')}
            >
              <span className={clsx('absolute inset-x-0 top-0 h-1', style.bg)} />
              <div className="flex items-start justify-between">
                <div>
                  <p className={clsx('font-semibold', style.text)}>{b.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">{b.industry}</p>
                </div>
                <span className={clsx('num rounded-lg px-2 py-1 text-sm font-semibold', style.soft, style.text)}>{s.progress}%</span>
              </div>
              <ProgressBar value={s.progress} className="mt-4 h-2" color={style.bar} />
              <div className="mt-4 grid grid-cols-3 text-center">
                <div>
                  <p className="num text-lg font-semibold">{s.total}</p>
                  <p className="text-[11px] text-ink-muted">Tổng việc</p>
                </div>
                <div>
                  <p className="num text-lg font-semibold text-ok">{s.completed}</p>
                  <p className="text-[11px] text-ink-muted">Hoàn thành</p>
                </div>
                <div>
                  <p className={clsx('num text-lg font-semibold', s.overdue ? 'text-danger' : '')}>{s.overdue}</p>
                  <p className="text-[11px] text-ink-muted">Quá hạn</p>
                </div>
              </div>
              <p className="mt-3 border-t border-line pt-2 text-xs text-ink-soft">
                {s.overdue ? <span className="text-danger">Có việc trễ hạn</span> : <span className="text-ok">Đúng kế hoạch</span>}
                <span className="text-ink-muted"> · {doneInPeriod} việc xong {period.label.toLowerCase()}</span>
              </p>
            </Link>
          )
        })}
      </div>

      {/* Nhân viên */}
      <div className="mt-8 mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink-soft">Hiệu suất nhân viên · {period.label}</h2>
        <Link to="/nhan-vien" className="text-xs text-ink-soft underline">
          Xem tất cả
        </Link>
      </div>
      {employees.length === 0 ? (
        <div className="card">
          <EmptyState title="Chưa có nhân viên" hint="Mời nhân viên trong trang Nhân viên." action={<Link to="/nhan-vien"><Button>Mời nhân viên</Button></Link>} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {employees.map((p) => {
            const brandScoped = brandId ? all.filter((t) => t.brand_id === brandId) : all
            const s = employeeStat(brandScoped, p.id, period.range, now)
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <Avatar profile={p} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      <Link to={`/nhan-vien/${p.id}`} className="hover:underline">
                        {p.full_name}
                      </Link>{' '}
                      {p.is_demo && <DemoTag />}
                    </p>
                    <p className="truncate text-xs text-ink-muted">{p.job_title ?? 'Nhân viên'}</p>
                  </div>
                  <div className="text-right text-xs text-ink-soft">
                    <p className="num">
                      <b className="text-ink">{s.activeNow}</b> việc mở
                    </p>
                    <p className="num">{fmtNum(s.activeHours)} giờ ước tính</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2.5">
                  <Metric label="Hoàn thành việc đến hạn" value={s.completionRate} detail={`${s.completedOfDue}/${s.dueInPeriod}`} />
                  <Metric label="Đúng hạn / việc đến hạn" value={s.onTimeOfDue} detail={s.onTimeOfCompleted != null ? `${s.onTimeOfCompleted}% trong số việc xong` : ''} />
                  <Metric label="Khối lượng có trọng số" value={s.weightedRate} detail={`${s.weightDone}/${s.weightDue} điểm`} />
                </div>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-ink-soft">
                  <span className={s.overdueNow ? 'font-medium text-danger' : ''}>
                    Quá hạn: <b className="num">{s.overdueNow}</b>
                    {s.maxOverdueDays ? ` (lâu nhất ${s.maxOverdueDays} ngày)` : ''}
                  </span>
                  <span>
                    Chất lượng TB: <b className="num">{s.qualityAvg ?? '—'}</b>
                    {s.qualityAvg != null && '/5'}
                  </span>
                  <span>
                    Lần phải sửa: <b className="num">{s.revisions}</b>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Các chỉ số được hiển thị riêng, không gộp thành một điểm tổng. "Việc đến hạn" = việc có hạn chót trong khoảng thời gian đã chọn. Việc chờ duyệt không bị tính là quá hạn.
      </p>

      {reviewing && <ReviewModal task={reviewing} onClose={() => setReviewing(null)} />}
    </>
  )
}

function Metric({ label, value, detail }: { label: string; value: number | null; detail?: string }) {
  const color = value == null ? 'bg-line' : value >= 80 ? 'bg-ok' : value >= 50 ? 'bg-warn' : 'bg-danger'
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-ink-soft">{label}</span>
        <span className="num">
          <b>{fmtPct(value)}</b> <span className="text-ink-muted">{detail}</span>
        </span>
      </div>
      <ProgressBar value={value ?? 0} color={color} />
    </div>
  )
}
