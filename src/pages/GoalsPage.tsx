import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TaskTable } from '../components/TaskList'
import { Avatar, AvatarStack, Badge, Button, DemoTag, EmptyState, ErrorBox, Field, fmtNum, Loading, Modal, PageHeader, ProgressBar, useConfirm, useToast } from '../components/ui'
import { useAuth, useMe } from '../contexts/AuthContext'
import { useBrandMembers, useGoalLogs, useGoals, useLookups, useTasks } from '../hooks/queries'
import { BRAND_STYLE } from '../lib/constants'
import { fmtDate, fmtDateTime, vnDateKey } from '../lib/dates'
import {
  GOAL_HEALTH,
  GOAL_METRIC_LABEL,
  GOAL_TYPE_LABEL,
  goalActual,
  goalHealth,
  goalPercent,
  periodBounds,
  periodElapsed,
  periodLabel,
} from '../lib/phase3'
import { db } from '../lib/backend'
import type { Goal, GoalMetric, GoalType, Task } from '../lib/types'

type PeriodType = 'thang' | 'quy'

function shiftPeriod(type: PeriodType, start: string, dir: 1 | -1): string {
  const [y, m] = start.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + dir * (type === 'thang' ? 1 : 3), 1))
  return periodBounds(type, d.toISOString().slice(0, 10)).start
}

export function useGoalRows() {
  const goalsQ = useGoals()
  const tasksQ = useTasks()
  const tasksById = useMemo(() => new Map((tasksQ.data ?? []).map((t) => [t.id, t])), [tasksQ.data])
  const now = new Date()
  const rows = (goalsQ.data ?? []).map((g) => {
    const actual = goalActual(g, tasksById)
    const percent = goalPercent(actual, Number(g.target_value))
    const elapsed = periodElapsed(g, now)
    return { goal: g, actual, percent, elapsed, health: goalHealth(percent, elapsed) }
  })
  return { rows, tasksById, isLoading: goalsQ.isLoading || tasksQ.isLoading, error: goalsQ.error || tasksQ.error, refetch: goalsQ.refetch }
}
export type GoalRow = ReturnType<typeof useGoalRows>['rows'][number]

export function GoalsPage() {
  const { isAdmin } = useAuth()
  const { brands, brandById, profileById, isLoading } = useLookups()
  const { rows, tasksById, isLoading: loadingRows, error, refetch } = useGoalRows()
  const [ptype, setPtype] = useState<PeriodType>('thang')
  const [start, setStart] = useState(periodBounds('thang', vnDateKey(new Date())).start)
  const [brandId, setBrandId] = useState('')
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  if (isLoading || loadingRows) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />

  const { end } = periodBounds(ptype, start)
  // Hiện mục tiêu có kỳ giao với kỳ đang xem (VD: mục tiêu quý hiện cả khi xem tháng trong quý)
  const visible = rows.filter((r) => r.goal.period_start <= end && r.goal.period_end >= start && (!brandId || r.goal.brand_id === brandId))
  const chartData = visible.map((r) => ({ name: r.goal.name, percent: r.percent, color: BRAND_STYLE[brandById.get(r.goal.brand_id)?.color ?? 'terracotta'].hex }))
  const current = openId ? rows.find((r) => r.goal.id === openId) : undefined
  const label = periodLabel({ period_type: ptype, period_start: start })

  const section = (type: GoalType) => {
    const list = visible.filter((r) => r.goal.goal_type === type)
    return (
      <section className="mt-6">
        <h2 className="mb-1 text-sm font-semibold">{GOAL_TYPE_LABEL[type]}</h2>
        <p className="mb-3 text-xs text-ink-muted">
          {type === 'cong_viec'
            ? 'Đo khối lượng công việc đã hoàn thành (tự tính từ việc liên kết, hoặc nhập tay).'
            : 'Kết quả kinh doanh nhập tay (doanh thu, khách tiềm năng, đơn hàng…) — tách riêng, không trộn với hiệu suất làm việc.'}
        </p>
        {list.length === 0 ? (
          <div className="card">
            <EmptyState title="Chưa có mục tiêu trong kỳ này" />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((r) => {
              const b = brandById.get(r.goal.brand_id)
              const st = b ? BRAND_STYLE[b.color] : BRAND_STYLE.terracotta
              return (
                <button key={r.goal.id} onClick={() => setOpenId(r.goal.id)} className="card p-4 text-left transition-shadow hover:shadow-md">
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-ink-muted">
                    <span className={clsx('size-2 rounded-full', st.bg)} /> {b?.name} · {periodLabel(r.goal)}
                    {r.goal.is_demo && <DemoTag />}
                  </div>
                  <p className="font-medium leading-snug">{r.goal.name}</p>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <p className="num text-2xl font-semibold">{r.percent}%</p>
                    <p className="num text-right text-sm text-ink-soft">
                      {fmtNum(r.actual)} / {fmtNum(Number(r.goal.target_value))} {r.goal.unit ?? ''}
                    </p>
                  </div>
                  <div className="relative mt-2">
                    <ProgressBar value={Math.min(r.percent, 100)} className="h-2" color={st.bar} />
                    <span className="absolute -top-1 h-4 w-0.5 bg-ink/50" style={{ left: `${r.elapsed}%` }} title={`Đã qua ${r.elapsed}% thời gian`} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge className={GOAL_HEALTH[r.health].cls}>{GOAL_HEALTH[r.health].label}</Badge>
                    <AvatarStack profiles={(r.goal.goal_members ?? []).map((m) => profileById.get(m.user_id))} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>
    )
  }

  return (
    <>
      <PageHeader
        title="Mục tiêu & KPI"
        subtitle="Chỉ tiêu tháng / quý theo thương hiệu, kết quả thực tế và % đạt. Vạch đen trên thanh = phần thời gian của kỳ đã trôi qua."
        actions={
          isAdmin && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Thêm mục tiêu
            </Button>
          )
        }
      />
      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="inline-flex rounded-xl bg-sunken p-1">
          {(
            [
              ['thang', 'Tháng'],
              ['quy', 'Quý'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => {
                setPtype(k)
                setStart(periodBounds(k, start).start)
              }}
              className={clsx('rounded-lg px-3 py-1.5 text-sm', ptype === k ? 'bg-surface font-medium shadow-sm' : 'text-ink-soft')}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Kỳ trước" icon={<ChevronLeft className="size-4" />} onClick={() => setStart(shiftPeriod(ptype, start, -1))} />
          <span className="min-w-28 text-center text-sm font-medium">{label}</span>
          <Button size="sm" variant="ghost" aria-label="Kỳ sau" icon={<ChevronRight className="size-4" />} onClick={() => setStart(shiftPeriod(ptype, start, 1))} />
        </div>
        <select className="input w-auto" value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Lọc thương hiệu">
          <option value="">Tất cả thương hiệu</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {visible.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="size-4" /> % đạt theo mục tiêu — {label}
          </h2>
          <div style={{ height: 40 + chartData.length * 34 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#ece6de" />
                <XAxis type="number" domain={[0, (max: number) => Math.max(100, max)]} tick={{ fontSize: 11, fill: '#8a8178' }} unit="%" tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 12, fill: '#2b2724' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [`${v}%`, 'Đạt']} contentStyle={{ borderRadius: 12, border: '1px solid #e8e2da', fontSize: 12 }} />
                <ReferenceLine x={100} stroke="#2f7d4f" strokeDasharray="4 4" />
                <Bar dataKey="percent" barSize={18} radius={[0, 6, 6, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {section('cong_viec')}
      {section('ket_qua_kinh_doanh')}

      {editing && <GoalFormModal goal={editing === 'new' ? undefined : editing} defaultStart={start} defaultType={ptype} onClose={() => setEditing(null)} />}
      {current && (
        <GoalDetailModal
          row={current}
          tasksById={tasksById}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setEditing(current.goal)
            setOpenId(null)
          }}
        />
      )}
    </>
  )
}

function GoalDetailModal({ row, tasksById, onClose, onEdit }: { row: GoalRow; tasksById: Map<string, Task>; onClose: () => void; onEdit: () => void }) {
  const { goal } = row
  const { isAdmin } = useAuth()
  const me = useMe()
  const { brandById, profileById } = useLookups()
  const logs = useGoalLogs(goal.id)
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [value, setValue] = useState(String(goal.actual_value))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const isMember = (goal.goal_members ?? []).some((m) => m.user_id === me.id)
  const canRecord = goal.metric === 'thu_cong' && (isAdmin || isMember)
  const linked = (goal.goal_tasks ?? []).map((l) => tasksById.get(l.task_id)).filter((t): t is Task => Boolean(t))
  const brand = brandById.get(goal.brand_id)

  const record = async () => {
    const v = Number(value.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) return toast.error('Kết quả phải là số không âm')
    setSaving(true)
    const { error } = await db().rpc('record_goal_progress', { p_goal: goal.id, p_value: v, p_note: note || null })
    setSaving(false)
    if (error) return toast.error(error)
    setNote('')
    qc.invalidateQueries({ queryKey: ['goals'] })
    qc.invalidateQueries({ queryKey: ['goal_logs', goal.id] })
    toast.ok('Đã cập nhật kết quả')
  }
  const remove = async () => {
    if (!(await confirm({ title: 'Xóa mục tiêu?', message: 'Mục tiêu và lịch sử cập nhật sẽ bị xóa. Công việc liên kết vẫn giữ nguyên.', confirmLabel: 'Xóa mục tiêu', danger: true }))) return
    const { error } = await db().from('goals').delete().eq('id', goal.id)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: ['goals'] })
    toast.ok('Đã xóa mục tiêu')
    onClose()
  }
  const chart = (logs.data ?? []).map((l) => ({ t: fmtDate(l.recorded_at), v: Number(l.value) }))

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={goal.name}
      footer={
        isAdmin && (
          <>
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              Xóa
            </Button>
            <Button icon={<Pencil className="size-4" />} onClick={onEdit}>
              Sửa mục tiêu
            </Button>
          </>
        )
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <Badge className={brand ? clsx(BRAND_STYLE[brand.color].soft, BRAND_STYLE[brand.color].text) : ''}>{brand?.name}</Badge>
        <Badge className="bg-sunken text-ink-soft">{GOAL_TYPE_LABEL[goal.goal_type]}</Badge>
        <span>
          {periodLabel(goal)} ({fmtDate(goal.period_start)} – {fmtDate(goal.period_end)})
        </span>
        <Badge className={GOAL_HEALTH[row.health].cls}>{GOAL_HEALTH[row.health].label}</Badge>
      </div>
      {goal.description && <p className="mb-4 text-sm whitespace-pre-wrap text-ink-soft">{goal.description}</p>}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-sunken p-3">
          <p className="text-xs text-ink-muted">Chỉ tiêu</p>
          <p className="num text-lg font-semibold">
            {fmtNum(Number(goal.target_value))} <span className="text-sm font-normal">{goal.unit}</span>
          </p>
        </div>
        <div className="rounded-xl bg-sunken p-3">
          <p className="text-xs text-ink-muted">Thực tế</p>
          <p className="num text-lg font-semibold">
            {fmtNum(row.actual)} <span className="text-sm font-normal">{goal.unit}</span>
          </p>
        </div>
        <div className="rounded-xl bg-sunken p-3">
          <p className="text-xs text-ink-muted">Đạt · thời gian đã qua</p>
          <p className="num text-lg font-semibold">
            {row.percent}% <span className="text-sm font-normal text-ink-muted">· {row.elapsed}%</span>
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">Cách tính: {GOAL_METRIC_LABEL[goal.metric]}.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-muted">Phụ trách:</span>
        {(goal.goal_members ?? []).length === 0 && <span className="text-ink-muted">—</span>}
        {(goal.goal_members ?? []).map((m) => (
          <span key={m.user_id} className="flex items-center gap-1">
            <Avatar profile={profileById.get(m.user_id)} size={20} /> {profileById.get(m.user_id)?.full_name}
          </span>
        ))}
      </div>

      {canRecord && (
        <div className="mt-5 rounded-xl border border-line p-3">
          <p className="mb-2 text-sm font-medium">Cập nhật kết quả thực tế</p>
          <div className="flex flex-wrap gap-2">
            <input className="input w-32" inputMode="decimal" aria-label="Kết quả thực tế" value={value} onChange={(e) => setValue(e.target.value)} />
            <input className="input min-w-40 flex-1" placeholder="Ghi chú (VD: số liệu đến hết tuần 3)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button variant="primary" loading={saving} onClick={record}>
              Lưu kết quả
            </Button>
          </div>
        </div>
      )}

      {goal.metric === 'thu_cong' && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Lịch sử cập nhật</h3>
          {logs.isLoading ? (
            <Loading />
          ) : chart.length === 0 ? (
            <p className="text-sm text-ink-muted">Chưa có lần cập nhật nào.</p>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#ece6de" />
                    <XAxis dataKey="t" tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#8a8178' }} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(max, Number(goal.target_value))]} />
                    <Tooltip formatter={(v) => [`${fmtNum(Number(v))} ${goal.unit ?? ''}`, 'Kết quả']} contentStyle={{ borderRadius: 12, border: '1px solid #e8e2da', fontSize: 12 }} />
                    <ReferenceLine y={Number(goal.target_value)} stroke="#2f7d4f" strokeDasharray="4 4" label={{ value: 'Chỉ tiêu', fontSize: 11, fill: '#2f7d4f', position: 'insideTopRight' }} />
                    <Line type="monotone" dataKey="v" stroke={brand ? BRAND_STYLE[brand.color].hex : '#2b2724'} strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 divide-y divide-line text-sm">
                {[...(logs.data ?? [])].reverse().map((l) => (
                  <li key={l.id} className="flex justify-between gap-2 py-1.5">
                    <span>
                      <b className="num">{fmtNum(Number(l.value))}</b> {goal.unit} {l.note && <span className="text-ink-soft">· {l.note}</span>}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {profileById.get(l.recorded_by ?? '')?.full_name} · {fmtDateTime(l.recorded_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {goal.goal_type === 'cong_viec' && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Công việc liên kết ({linked.length})</h3>
          <TaskTable tasks={linked} emptyTitle="Chưa liên kết công việc" />
        </div>
      )}
    </Modal>
  )
}

function GoalFormModal({ goal, defaultStart, defaultType, onClose }: { goal?: Goal; defaultStart: string; defaultType: PeriodType; onClose: () => void }) {
  const { brands, profiles } = useLookups()
  const members = useBrandMembers()
  const tasksQ = useTasks()
  const toast = useToast()
  const qc = useQueryClient()
  const [brandId, setBrandId] = useState(goal?.brand_id ?? '')
  const [name, setName] = useState(goal?.name ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [goalType, setGoalType] = useState<GoalType>(goal?.goal_type ?? 'cong_viec')
  const [metric, setMetric] = useState<GoalMetric>(goal?.metric ?? 'so_viec')
  const [ptype, setPtype] = useState<PeriodType>(goal?.period_type ?? defaultType)
  const [periodKey, setPeriodKey] = useState(goal?.period_start ?? defaultStart)
  const [target, setTarget] = useState(goal ? String(goal.target_value) : '')
  const [unit, setUnit] = useState(goal?.unit ?? (goalType === 'cong_viec' ? 'việc' : ''))
  const [userIds, setUserIds] = useState<string[]>(goal?.goal_members?.map((m) => m.user_id) ?? [])
  const [taskIds, setTaskIds] = useState<string[]>(goal?.goal_tasks?.map((t) => t.task_id) ?? [])
  const [saving, setSaving] = useState(false)
  const { start, end } = periodBounds(ptype, periodKey)
  const effectiveMetric: GoalMetric = goalType === 'ket_qua_kinh_doanh' ? 'thu_cong' : metric
  const memberIds = new Set((members.data ?? []).filter((m) => m.brand_id === brandId).map((m) => m.user_id))
  // Việc gợi ý: cùng thương hiệu, có hạn trong kỳ hoặc chưa có hạn, chưa hủy; luôn giữ việc đã chọn
  const candidates = (tasksQ.data ?? []).filter(
    (t) =>
      t.brand_id === brandId &&
      t.status !== 'da_huy' &&
      (taskIds.includes(t.id) || !t.due_at || (vnDateKey(t.due_at) >= start && vnDateKey(t.due_at) <= end)),
  )

  const save = async () => {
    if (!brandId) return toast.error('Vui lòng chọn thương hiệu')
    if (!name.trim()) return toast.error('Vui lòng nhập tên mục tiêu')
    const t = Number(target.replace(',', '.'))
    if (!(t > 0)) return toast.error('Chỉ tiêu phải lớn hơn 0')
    setSaving(true)
    const payload = {
      brand_id: brandId,
      name: name.trim(),
      description: description.trim() || null,
      goal_type: goalType,
      metric: effectiveMetric,
      period_type: ptype,
      period_start: start,
      period_end: end,
      target_value: t,
      unit: unit.trim() || null,
    }
    const res = goal
      ? await db().from('goals').update(payload).eq('id', goal.id).select('id').single()
      : await db().from('goals').insert(payload).select('id').single()
    if (res.error) {
      setSaving(false)
      return toast.error(res.error)
    }
    const id = (res.data as { id: string }).id
    const wantTasks = effectiveMetric === 'thu_cong' && goalType === 'ket_qua_kinh_doanh' ? [] : taskIds
    const steps = [
      db().from('goal_members').delete().eq('goal_id', id),
      db().from('goal_tasks').delete().eq('goal_id', id),
    ]
    for (const s of steps) {
      const { error } = await s
      if (error) {
        setSaving(false)
        return toast.error(error)
      }
    }
    if (userIds.length) {
      const { error } = await db().from('goal_members').insert(userIds.map((user_id) => ({ goal_id: id, user_id })))
      if (error) {
        setSaving(false)
        return toast.error(error)
      }
    }
    if (wantTasks.length) {
      const { error } = await db().from('goal_tasks').insert(wantTasks.map((task_id) => ({ goal_id: id, task_id })))
      if (error) {
        setSaving(false)
        return toast.error(error)
      }
    }
    setSaving(false)
    qc.invalidateQueries({ queryKey: ['goals'] })
    toast.ok(goal ? 'Đã lưu mục tiêu' : 'Đã thêm mục tiêu')
    onClose()
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={goal ? 'Sửa mục tiêu' : 'Thêm mục tiêu'}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {goal ? 'Lưu' : 'Thêm mục tiêu'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên mục tiêu *" className="sm:col-span-2">
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: 120 khách tiềm năng từ TikTok" />
        </Field>
        <Field label="Thương hiệu *">
          <select
            className="input"
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value)
              setTaskIds([])
            }}
          >
            <option value="">— Chọn —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Loại mục tiêu">
          <select
            className="input"
            value={goalType}
            onChange={(e) => {
              const v = e.target.value as GoalType
              setGoalType(v)
              if (v === 'ket_qua_kinh_doanh' && unit === 'việc') setUnit('')
            }}
          >
            <option value="cong_viec">{GOAL_TYPE_LABEL.cong_viec}</option>
            <option value="ket_qua_kinh_doanh">{GOAL_TYPE_LABEL.ket_qua_kinh_doanh}</option>
          </select>
        </Field>
        <Field label="Kỳ">
          <div className="flex gap-2">
            <select className="input w-28" value={ptype} onChange={(e) => setPtype(e.target.value as PeriodType)} aria-label="Loại kỳ">
              <option value="thang">Tháng</option>
              <option value="quy">Quý</option>
            </select>
            <input type="month" className="input" aria-label="Tháng" value={periodKey.slice(0, 7)} onChange={(e) => e.target.value && setPeriodKey(`${e.target.value}-01`)} />
          </div>
          <span className="mt-1 block text-xs text-ink-muted">
            {periodLabel({ period_type: ptype, period_start: start })}: {fmtDate(start)} – {fmtDate(end)}
          </span>
        </Field>
        <Field label="Chỉ tiêu * / đơn vị">
          <div className="flex gap-2">
            <input className="input" inputMode="decimal" aria-label="Chỉ tiêu" value={target} onChange={(e) => setTarget(e.target.value)} />
            <input className="input w-32" aria-label="Đơn vị" placeholder="việc, khách…" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        </Field>
        {goalType === 'cong_viec' && (
          <Field label="Cách tính kết quả" className="sm:col-span-2">
            <select className="input" value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
              {(Object.keys(GOAL_METRIC_LABEL) as GoalMetric[]).map((k) => (
                <option key={k} value={k}>
                  {GOAL_METRIC_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Mô tả" className="sm:col-span-2">
          <textarea className="input min-h-16" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Người phụ trách (được cập nhật kết quả nhập tay)</span>
          <div className="flex flex-wrap gap-2">
            {profiles
              .filter((p) => p.is_active && (!brandId || memberIds.has(p.id) || userIds.includes(p.id)))
              .map((p) => {
                const on = userIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setUserIds(on ? userIds.filter((x) => x !== p.id) : [...userIds, p.id])}
                    className={clsx('flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm', on ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-sunken')}
                  >
                    <Avatar profile={p} size={20} /> {p.full_name}
                  </button>
                )
              })}
          </div>
        </div>
        {goalType === 'cong_viec' && (
          <div className="sm:col-span-2">
            <span className="label">
              Công việc liên kết ({taskIds.length}) — việc của thương hiệu có hạn trong kỳ hoặc chưa có hạn
            </span>
            {!brandId ? (
              <p className="text-sm text-ink-muted">Chọn thương hiệu trước.</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-ink-muted">Không có công việc phù hợp.</p>
            ) : (
              <div className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {candidates.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-sunken/50">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#2b2724]"
                      checked={taskIds.includes(t.id)}
                      onChange={(e) => setTaskIds(e.target.checked ? [...taskIds, t.id] : taskIds.filter((x) => x !== t.id))}
                    />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-xs text-ink-muted">{t.due_at ? fmtDate(t.due_at) : 'Không hạn'}</span>
                  </label>
                ))}
              </div>
            )}
            {candidates.length > 0 && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setTaskIds(candidates.map((t) => t.id))}>
                  Chọn tất cả
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setTaskIds([])}>
                  Bỏ chọn
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
