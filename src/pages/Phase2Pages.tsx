import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowLeft, Pause, Pencil, Play, Plus, Printer, RefreshCw, Repeat, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TaskTable } from '../components/TaskList'
import { TaskViews, ViewTabs, type ViewKey } from '../components/TaskViews'
import {
  Avatar,
  Badge,
  Button,
  DemoTag,
  EmptyState,
  ErrorBox,
  Field,
  fmtNum,
  fmtPct,
  Loading,
  Modal,
  PageHeader,
  StatCard,
  useConfirm,
  useToast,
} from '../components/ui'
import { useAuth, useMe } from '../contexts/AuthContext'
import { qk, useLookups, useRecurringRules, useSetting, useTasks, type RecurringRule } from '../hooks/queries'
import { BRAND_STYLE, PRIORITY_LABEL, PRIORITY_STYLE, WEIGHT_OPTIONS } from '../lib/constants'
import { fmtDateKey, fmtShort, vnDateKey } from '../lib/dates'
import {
  combinedScore,
  DEFAULT_KPI_WEIGHTS,
  employeeStat,
  isOpen,
  isOverdue,
  openHoursByBrand,
  taskPeople,
  weeklyTrend,
  type KpiWeights,
} from '../lib/metrics'
import { db } from '../lib/backend'
import type { TaskPriority } from '../lib/types'
import { PeriodPicker, usePeriodFilter } from './DashboardPage'

// ======================= LỊCH CÔNG VIỆC =======================
export function WorkCalendarPage() {
  const tasksQ = useTasks()
  const me = useMe()
  const { brands, profiles, isLoading } = useLookups()
  const [view, setView] = useState<ViewKey>('calendar')
  const [brandId, setBrandId] = useState('')
  const [personId, setPersonId] = useState('')
  const [hideDone, setHideDone] = useState(false)

  const tasks = useMemo(
    () =>
      (tasksQ.data ?? []).filter(
        (t) =>
          (!brandId || t.brand_id === brandId) &&
          (!personId || taskPeople(t).includes(personId)) &&
          (!hideDone || isOpen(t)),
      ),
    [tasksQ.data, brandId, personId, hideDone],
  )
  if (tasksQ.isLoading || isLoading) return <Loading />
  if (tasksQ.error) return <ErrorBox error={tasksQ.error} onRetry={() => tasksQ.refetch()} />

  return (
    <>
      <PageHeader title="Lịch công việc" subtitle="Xem toàn bộ công việc theo lịch hạn chót, bảng Kanban hoặc timeline." actions={<ViewTabs view={view} onChange={setView} views={['calendar', 'kanban', 'timeline', 'list']} />} />
      <div className="mb-4 grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:p-3">
        <select className="input sm:w-auto" value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Lọc thương hiệu">
          <option value="">Tất cả thương hiệu</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="input sm:w-auto" value={personId} onChange={(e) => setPersonId(e.target.value)} aria-label="Lọc người thực hiện">
          <option value="">Mọi người</option>
          <option value={me.id}>Chỉ việc của tôi</option>
          {profiles
            .filter((p) => p.is_active && p.id !== me.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
        </select>
        <label className="col-span-2 flex min-h-9 items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="size-4 accent-[#2b2724]" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Ẩn việc đã xong
        </label>
        <span className="ml-auto hidden flex-wrap gap-3 text-xs text-ink-soft sm:flex">
          {brands.map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <span className={clsx('size-2 rounded-full', BRAND_STYLE[b.color].bg)} /> {b.name}
            </span>
          ))}
        </span>
      </div>
      <TaskViews tasks={tasks} view={view} />
    </>
  )
}

// ======================= VIỆC LẶP LẠI =======================
const WD_LABEL = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export function describeRule(r: Pick<RecurringRule, 'frequency' | 'weekdays' | 'day_of_month' | 'due_time'>): string {
  const time = r.due_time.slice(0, 5)
  if (r.frequency === 'monthly') return `Hằng tháng, ngày ${r.day_of_month}, hạn ${time}`
  const days = [...r.weekdays].sort().map((d) => WD_LABEL[d - 1]).join(', ')
  if (r.frequency === 'weekly') return `${r.weekdays.length} lần/tuần (${days}), hạn ${time}`
  return r.weekdays.length ? `Hằng ngày vào ${days}, hạn ${time}` : `Hằng ngày, hạn ${time}`
}

export function RecurringPage() {
  const q = useRecurringRules()
  const tasksQ = useTasks()
  const { brandById, profileById, projectById, isLoading } = useLookups()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)
  const [running, setRunning] = useState(false)

  const generate = async (silent = false) => {
    setRunning(true)
    const { data, error } = await db().rpc('generate_recurring_tasks', { p_days: 7 })
    setRunning(false)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: qk.tasks })
    qc.invalidateQueries({ queryKey: ['recurring_rules'] })
    if (!silent) toast.ok(data ? `Đã tạo ${data} công việc cho 7 ngày tới` : 'Các lần lặp trong 7 ngày tới đã có đủ, không tạo thêm')
  }

  const toggle = async (r: RecurringRule) => {
    const { error } = await db().from('recurring_task_rules').update({ is_active: !r.is_active }).eq('id', r.id)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: ['recurring_rules'] })
    toast.ok(r.is_active ? 'Đã tạm dừng quy tắc' : 'Đã bật lại quy tắc')
    if (!r.is_active) generate(true)
  }

  const remove = async (r: RecurringRule) => {
    const ok = await confirm({
      title: 'Xóa quy tắc lặp lại?',
      message: 'Quy tắc sẽ không tạo việc mới nữa. Các công việc đã tạo trước đó vẫn được giữ nguyên để không mất lịch sử hiệu suất.',
      confirmLabel: 'Xóa quy tắc',
      danger: true,
    })
    if (!ok) return
    const { error } = await db().from('recurring_task_rules').delete().eq('id', r.id)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: ['recurring_rules'] })
    toast.ok('Đã xóa quy tắc')
  }

  if (q.isLoading || isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  const rules = q.data ?? []
  const today = vnDateKey(new Date())

  return (
    <>
      <PageHeader
        title="Việc lặp lại"
        subtitle="Hệ thống tự tạo công việc cho 7 ngày tới theo từng quy tắc, chạy lại nhiều lần cũng không tạo trùng."
        actions={
          <>
            <Button icon={<RefreshCw className="size-4" />} loading={running} onClick={() => generate()}>
              Tạo ngay các lần lặp
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Thêm quy tắc
            </Button>
          </>
        }
      />
      {rules.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Repeat className="size-5" />}
            title="Chưa có việc lặp lại"
            hint="Ví dụ: đăng bài Facebook hằng ngày, 3 video TikTok mỗi tuần (T2, T4, T6), báo cáo hiệu suất ngày 1 hằng tháng."
            action={<Button onClick={() => setEditing('new')}>Thêm quy tắc đầu tiên</Button>}
          />
        </div>
      ) : (
        <div className="card divide-y divide-line">
          {rules.map((r) => {
            const brand = brandById.get(r.brand_id)
            const upcoming = (tasksQ.data ?? []).filter((t) => (t as { recurring_rule_id?: string }).recurring_rule_id === r.id)
            const openCount = upcoming.filter(isOpen).length
            const nextKey = upcoming
              .filter((t) => t.due_at && vnDateKey(t.due_at) >= today && isOpen(t))
              .map((t) => vnDateKey(t.due_at!))
              .sort()[0]
            return (
              <div key={r.id} className={clsx('flex flex-col gap-3 p-4 md:flex-row md:items-center', !r.is_active && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {brand && <span className={clsx('size-2 rounded-full', BRAND_STYLE[brand.color].bg)} />}
                    {r.title}
                    {!r.is_active && <Badge className="bg-sunken text-ink-muted">Tạm dừng</Badge>}
                  </p>
                  <p className="text-sm text-ink-soft">{describeRule(r)}</p>
                  <p className="text-xs text-ink-muted">
                    {brand?.name}
                    {r.project_id ? ` · ${projectById.get(r.project_id)?.name ?? ''}` : ''} · từ {fmtDateKey(r.starts_on)}
                    {r.ends_on ? ` đến ${fmtDateKey(r.ends_on)}` : ''} · {openCount} việc đang mở
                    {nextKey ? ` · lần tới ${fmtDateKey(nextKey)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {r.assignee_ids.map((id) => (
                    <Avatar key={id} profile={profileById.get(id)} size={26} />
                  ))}
                </div>
                <Badge className={PRIORITY_STYLE[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={r.is_active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} onClick={() => toggle(r)}>
                    {r.is_active ? 'Tạm dừng' : 'Bật lại'}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(r)}>
                    Sửa
                  </Button>
                  <Button size="sm" variant="ghost" className="text-danger" aria-label="Xóa quy tắc" icon={<Trash2 className="size-3.5" />} onClick={() => remove(r)} />
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Việc tự tạo không gửi thông báo "giao việc mới"; người làm sẽ nhận nhắc khi việc sắp đến hạn. Sửa quy tắc chỉ áp dụng cho các lần lặp tạo sau đó.
      </p>
      {editing && <RuleModal rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => generate(true)} />}
    </>
  )
}

function RuleModal({ rule, onClose, onSaved }: { rule?: RecurringRule; onClose: () => void; onSaved: () => void }) {
  const { brands, projects, profiles } = useLookups()
  const toast = useToast()
  const qc = useQueryClient()
  const [brandId, setBrandId] = useState(rule?.brand_id ?? '')
  const [projectId, setProjectId] = useState(rule?.project_id ?? '')
  const [title, setTitle] = useState(rule?.title ?? '')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [frequency, setFrequency] = useState<RecurringRule['frequency']>(rule?.frequency ?? 'daily')
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? [])
  const [dom, setDom] = useState(rule?.day_of_month ?? 1)
  const [time, setTime] = useState((rule?.due_time ?? '23:59').slice(0, 5))
  const [assignees, setAssignees] = useState<string[]>(rule?.assignee_ids ?? [])
  const [priority, setPriority] = useState<TaskPriority>(rule?.priority ?? 'trung_binh')
  const [weight, setWeight] = useState(rule?.weight ?? 1)
  const [hours, setHours] = useState(rule?.estimated_hours?.toString() ?? '')
  const [requiresApproval, setRequiresApproval] = useState(rule?.requires_approval ?? true)
  const [startsOn, setStartsOn] = useState(rule?.starts_on ?? vnDateKey(new Date()))
  const [endsOn, setEndsOn] = useState(rule?.ends_on ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!brandId) return toast.error('Vui lòng chọn thương hiệu')
    if (!title.trim()) return toast.error('Vui lòng nhập tên công việc')
    if (frequency === 'weekly' && !weekdays.length) return toast.error('Chọn ít nhất một ngày trong tuần')
    if (!assignees.length) return toast.error('Chọn ít nhất một người thực hiện')
    setSaving(true)
    const payload = {
      brand_id: brandId,
      project_id: projectId || null,
      title: title.trim(),
      description: description.trim() || null,
      frequency,
      weekdays: frequency === 'monthly' ? [] : weekdays,
      day_of_month: frequency === 'monthly' ? dom : null,
      due_time: time,
      assignee_ids: assignees,
      primary_owner_id: assignees[0],
      priority,
      weight,
      estimated_hours: hours === '' ? null : Number(hours.replace(',', '.')),
      requires_approval: requiresApproval,
      starts_on: startsOn,
      ends_on: endsOn || null,
    }
    const { error } = rule
      ? await db().from('recurring_task_rules').update(payload).eq('id', rule.id)
      : await db().from('recurring_task_rules').insert(payload)
    setSaving(false)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: ['recurring_rules'] })
    toast.ok(rule ? 'Đã lưu quy tắc' : 'Đã thêm quy tắc, đang tạo công việc cho 7 ngày tới')
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={rule ? 'Sửa việc lặp lại' : 'Thêm việc lặp lại'}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {rule ? 'Lưu' : 'Thêm quy tắc'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên công việc *" className="sm:col-span-2">
          <input autoFocus className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Đăng bài Facebook Gốm Vũ Gia" />
        </Field>
        <Field label="Thương hiệu *">
          <select className="input" value={brandId} onChange={(e) => { setBrandId(e.target.value); setProjectId('') }}>
            <option value="">— Chọn —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dự án">
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!brandId}>
            <option value="">— Không thuộc dự án —</option>
            {projects
              .filter((p) => p.brand_id === brandId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Hướng dẫn" className="sm:col-span-2">
          <textarea className="input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Tần suất</span>
          <div className="mb-3 inline-flex rounded-xl bg-sunken p-1">
            {(
              [
                ['daily', 'Hằng ngày'],
                ['weekly', 'Theo thứ trong tuần'],
                ['monthly', 'Hằng tháng'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFrequency(k)} className={clsx('rounded-lg px-3 py-1.5 text-sm', frequency === k ? 'bg-surface font-medium shadow-sm' : 'text-ink-soft')}>
                {l}
              </button>
            ))}
          </div>
          {frequency !== 'monthly' ? (
            <div>
              <div className="flex flex-wrap gap-1.5">
                {WD_LABEL.map((l, i) => {
                  const d = i + 1
                  const on = weekdays.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                      className={clsx('size-10 rounded-xl border text-sm', on ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-sunken')}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-xs text-ink-muted">{frequency === 'daily' ? 'Để trống = mọi ngày. Chọn để giới hạn (VD: bỏ Chủ nhật).' : 'VD: 3 video/tuần → chọn T2, T4, T6.'}</p>
            </div>
          ) : (
            <Field label="Ngày trong tháng" hint="Tháng ít ngày hơn sẽ dùng ngày cuối tháng.">
              <input type="number" min={1} max={31} className="input w-28" value={dom} onChange={(e) => setDom(Math.min(31, Math.max(1, Number(e.target.value))))} />
            </Field>
          )}
        </div>
        <Field label="Giờ hạn chót">
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Độ phức tạp">
          <select className="input" value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
            {WEIGHT_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bắt đầu từ">
          <input type="date" className="input" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </Field>
        <Field label="Kết thúc (không bắt buộc)">
          <input type="date" className="input" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Người thực hiện * (người đầu tiên là phụ trách chính)</span>
          <div className="flex flex-wrap gap-2">
            {profiles
              .filter((p) => p.is_active)
              .map((p) => {
                const on = assignees.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAssignees(on ? assignees.filter((x) => x !== p.id) : [...assignees, p.id])}
                    className={clsx('flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm', on ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-sunken')}
                  >
                    <Avatar profile={p} size={20} /> {p.full_name}
                  </button>
                )
              })}
          </div>
        </div>
        <Field label="Độ ưu tiên">
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Giờ làm ước tính mỗi lần">
          <input className="input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4 accent-[#2b2724]" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
          Cần quản lý duyệt
        </label>
        <p className="rounded-xl bg-sunken p-3 text-sm text-ink-soft sm:col-span-2">
          Lịch: <b className="text-ink">{describeRule({ frequency, weekdays, day_of_month: dom, due_time: time })}</b>
        </p>
      </div>
    </Modal>
  )
}

// ======================= HIỆU SUẤT NHÂN VIÊN =======================
export function useKpiWeights() {
  return useSetting<KpiWeights>('kpi_weights', DEFAULT_KPI_WEIGHTS)
}

export function EmployeePerformancePage() {
  const { id = '' } = useParams()
  const me = useMe()
  const { isAdmin } = useAuth()
  const tasksQ = useTasks()
  const { profileById, brandById, isLoading } = useLookups()
  const weightsQ = useKpiWeights()
  const period = usePeriodFilter('month')

  if (!isAdmin && id !== me.id) return <Navigate to={`/nhan-vien/${me.id}`} replace />
  if (tasksQ.isLoading || isLoading) return <Loading />
  if (tasksQ.error) return <ErrorBox error={tasksQ.error} onRetry={() => tasksQ.refetch()} />
  const p = profileById.get(id)
  if (!p) return <div className="card"><EmptyState title="Không tìm thấy nhân viên" action={<Link to="/nhan-vien"><Button>Về danh sách</Button></Link>} /></div>

  const tasks = tasksQ.data ?? []
  const now = new Date()
  const s = employeeStat(tasks, id, period.range, now)
  const trend = weeklyTrend(tasks, id, 8, now).map((t) => ({ ...t, label: fmtShort(t.from) }))
  const weights = { ...DEFAULT_KPI_WEIGHTS, ...(weightsQ.data ?? {}) }
  const score = weights.show_combined ? combinedScore(s, weights) : null
  const hoursByBrand = openHoursByBrand(tasks, id)
  const mine = tasks.filter((t) => taskPeople(t).includes(id))
  const overdue = mine.filter((t) => isOverdue(t, now))

  return (
    <>
      <Link to="/nhan-vien" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Nhân viên
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar profile={p} size={40} />
            <span>
              {p.full_name} {p.is_demo && <DemoTag />}
              <span className="block text-sm font-normal text-ink-soft">{p.job_title ?? 'Nhân viên'}</span>
            </span>
          </span>
        }
        actions={
          <>
            <PeriodPicker f={period} />
            <Link to={`/bao-cao/nhan-vien/${id}?thang=${vnDateKey(new Date()).slice(0, 7)}`}>
              <Button icon={<Printer className="size-4" />}>Tổng kết tháng</Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="A. Hoàn thành việc đến hạn" value={fmtPct(s.completionRate)} hint={`${s.completedOfDue}/${s.dueInPeriod} việc · ${period.label}`} tone="ok" />
        <StatCard label="B. Đúng hạn" value={fmtPct(s.onTimeOfDue)} hint={`trên việc đến hạn · ${fmtPct(s.onTimeOfCompleted)} trong số việc xong`} tone="warn" />
        <StatCard label="C. Khối lượng có trọng số" value={fmtPct(s.weightedRate)} hint={`${s.weightDone}/${s.weightDue} điểm trọng số`} tone="info" />
        <StatCard label="D. Chất lượng TB (quản lý chấm)" value={s.qualityAvg != null ? `${s.qualityAvg}/5` : '—'} hint={`${s.qualityCount} việc được chấm`} tone="violet" />
        <StatCard label="E. Số lần phải sửa" value={s.revisions} hint="trên việc đến hạn trong kỳ" />
        <StatCard label="F. Đang quá hạn" value={s.overdueNow} hint={s.maxOverdueDays ? `Lâu nhất ${s.maxOverdueDays} ngày` : 'Không có'} tone="danger" />
        <StatCard label="G. Việc đang mở" value={s.activeNow} hint={`${fmtNum(s.activeHours)} giờ ước tính · ${s.noDueOpen} việc chưa có hạn`} />
        {weights.show_combined ? (
          <StatCard label="Điểm tổng hợp (tham khảo)" value={score ?? '—'} hint={`Trọng số ${weights.completion}/${weights.on_time}/${weights.weighted}/${weights.quality}`} />
        ) : (
          <StatCard label="Điểm tổng hợp" value="Tắt" hint="Mặc định không gộp chỉ số. Bật trong Cài đặt." />
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="card p-4 xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold">Xu hướng 8 tuần gần nhất</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#ece6de" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} unit="%" />
                <Tooltip formatter={(v) => (v == null ? '—' : `${v}%`)} labelFormatter={(l) => `Tuần từ ${l}`} contentStyle={{ borderRadius: 12, border: '1px solid #e8e2da', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="completionRate" name="Hoàn thành" stroke="#2f7d4f" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="onTimeOfDue" name="Đúng hạn" stroke="#a86a12" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="weightedRate" name="Trọng số" stroke="#2f5fa8" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-ink-muted">Tuần không có việc đến hạn để trống (không tính là 0%).</p>
        </div>
        <div className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Khối lượng đang mở theo thương hiệu</h2>
          {Object.keys(hoursByBrand).length === 0 ? (
            <EmptyState title="Không có việc đang mở" />
          ) : (
            <div className="space-y-3">
              {Object.entries(s.activeByBrand).map(([bid, n]) => {
                const b = brandById.get(bid)
                return (
                  <div key={bid}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="flex items-center gap-1.5">
                        <span className={clsx('size-2 rounded-full', b ? BRAND_STYLE[b.color].bg : 'bg-line')} /> {b?.name}
                      </span>
                      <span className="num text-ink-soft">
                        {n} việc · {fmtNum(hoursByBrand[bid] ?? 0)} giờ
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-sunken">
                      <div className={clsx('h-2 rounded-full', b ? BRAND_STYLE[b.color].bg : 'bg-ink')} style={{ width: `${(n / s.activeNow) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {overdue.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold text-danger">Việc đang quá hạn ({overdue.length})</h2>
          <TaskTable tasks={overdue} />
        </>
      )}
      <h2 className="mt-8 mb-3 text-sm font-semibold text-ink-soft">Tất cả công việc</h2>
      <TaskTable tasks={mine} />
      <p className="mt-3 text-xs text-ink-muted">
        Công thức chi tiết: docs/06-cong-thuc-kpi.md. Thời điểm hoàn thành tính theo lúc nhân viên nộp; quản lý duyệt chậm hay dời hạn không làm nhân viên bị tính trễ.
      </p>
    </>
  )
}

// ======================= PHÂN BỔ KHỐI LƯỢNG =======================
export function WorkloadChart() {
  const tasksQ = useTasks()
  const { profiles, brands } = useLookups()
  const staff = profiles.filter((p) => p.is_active && p.role === 'employee')
  if (!tasksQ.data || !staff.length) return null
  const rows = staff.map((p) => {
    const h = openHoursByBrand(tasksQ.data!, p.id)
    const total = Object.values(h).reduce((a, b) => a + b, 0)
    return { name: p.full_name, total, ...Object.fromEntries(brands.map((b) => [b.id, Math.round((h[b.id] ?? 0) * 10) / 10])) }
  })
  const avg = rows.reduce((a, r) => a + r.total, 0) / rows.length
  return (
    <div className="card mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Phân bổ khối lượng (giờ ước tính của việc đang mở)</h2>
        <span className="text-xs text-ink-muted">Trung bình nhóm: {fmtNum(avg)} giờ/người</span>
      </div>
      <div style={{ height: 56 + rows.length * 44 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="#ece6de" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} unit=" giờ" />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#2b2724' }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v, n) => [`${v} giờ`, brands.find((b) => b.id === n)?.name ?? n]} contentStyle={{ borderRadius: 12, border: '1px solid #e8e2da', fontSize: 12 }} />
            <Legend formatter={(v) => brands.find((b) => b.id === v)?.name ?? v} wrapperStyle={{ fontSize: 12 }} />
            {brands.map((b, i) => (
              <Bar key={b.id} dataKey={b.id} stackId="h" fill={BRAND_STYLE[b.color].hex} radius={i === brands.length - 1 ? [0, 6, 6, 0] : 0} barSize={22} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {rows.map((r) => {
          const ratio = avg ? r.total / avg : 0
          return (
            <Badge key={r.name} className={ratio > 1.4 ? 'bg-danger-soft text-danger' : ratio < 0.6 ? 'bg-info-soft text-info' : 'bg-ok-soft text-ok'}>
              {r.name}: {ratio > 1.4 ? 'quá tải' : ratio < 0.6 ? 'còn trống' : 'cân bằng'}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}

// ======================= CÀI ĐẶT KPI & NHẮC HẠN =======================
export function KpiSettingsCard() {
  const weightsQ = useKpiWeights()
  const remindQ = useSetting<{ days_before_due: number }>('reminders', { days_before_due: 1 })
  if (weightsQ.isLoading || remindQ.isLoading) return <section className="card p-5"><Loading /></section>
  return <KpiSettingsForm initial={{ ...DEFAULT_KPI_WEIGHTS, ...(weightsQ.data ?? {}) }} days={remindQ.data?.days_before_due ?? 1} />
}

function KpiSettingsForm({ initial, days: initialDays }: { initial: KpiWeights; days: number }) {
  const { isAdmin } = useAuth()
  const me = useMe()
  const toast = useToast()
  const qc = useQueryClient()
  const [w, setW] = useState(initial)
  const [days, setDays] = useState(initialDays)
  const [saving, setSaving] = useState(false)
  const sum = w.completion + w.on_time + w.weighted + w.quality
  const save = async () => {
    if (sum <= 0) return toast.error('Tổng trọng số phải lớn hơn 0')
    setSaving(true)
    const { error } = await db()
      .from('app_settings')
      .upsert([
        { key: 'kpi_weights', value: w, updated_by: me.id },
        { key: 'reminders', value: { days_before_due: days }, updated_by: me.id },
      ])
    setSaving(false)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: ['setting'] })
    toast.ok('Đã lưu cài đặt KPI và nhắc hạn')
  }
  const fields: [keyof Omit<KpiWeights, 'show_combined'>, string][] = [
    ['completion', 'A. Hoàn thành'],
    ['on_time', 'B. Đúng hạn'],
    ['weighted', 'C. Khối lượng trọng số'],
    ['quality', 'D. Chất lượng'],
  ]
  return (
    <section className="card p-5">
      <h2 className="mb-1 font-semibold">Trọng số KPI & nhắc hạn</h2>
      <p className="mb-4 text-sm text-ink-soft">Các chỉ số luôn được hiển thị riêng. Điểm tổng hợp chỉ là tham khảo và mặc định tắt.</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([k, l]) => (
          <Field key={k} label={`${l} ${sum ? `(${Math.round((w[k] / sum) * 100)}%)` : ''}`}>
            <input type="number" min={0} max={100} className="input" disabled={!isAdmin} value={w[k]} onChange={(e) => setW({ ...w, [k]: Math.max(0, Number(e.target.value)) })} />
          </Field>
        ))}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[#2b2724]" disabled={!isAdmin} checked={w.show_combined} onChange={(e) => setW({ ...w, show_combined: e.target.checked })} />
        Hiện điểm tổng hợp (tham khảo) trên trang hiệu suất
      </label>
      <Field label="Nhắc trước hạn chót (ngày)" className="mt-4">
        <input type="number" min={0} max={7} className="input w-28" disabled={!isAdmin} value={days} onChange={(e) => setDays(Math.min(7, Math.max(0, Number(e.target.value))))} />
      </Field>
      {isAdmin && (
        <Button variant="primary" className="mt-4" loading={saving} onClick={save}>
          Lưu cài đặt
        </Button>
      )}
    </section>
  )
}
