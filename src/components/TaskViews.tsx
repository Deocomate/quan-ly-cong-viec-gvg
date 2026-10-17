import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertOctagon, CalendarDays, ChevronLeft, ChevronRight, GanttChart, KanbanSquare, List } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useMe } from '../contexts/AuthContext'
import { qk, useInvalidateTask, useLookups } from '../hooks/queries'
import { BRAND_STYLE, EMPLOYEE_EDITABLE_FROM, EMPLOYEE_SETTABLE_STATUSES, STATUS_LABEL, STATUS_ORDER } from '../lib/constants'
import { addDays, fmtShort, vnDateKey, vnStartOfDateKey, vnStartOfDay, vnWeekday } from '../lib/dates'
import { effectiveProgress, isOverdue, taskPeople } from '../lib/metrics'
import { db } from '../lib/backend'
import type { Task, TaskStatus } from '../lib/types'
import { TaskTable } from './TaskList'
import { AvatarStack, DemoTag, EmptyState, PriorityBadge, ProgressBar, useToast } from './ui'
import { SubmitModal } from './WorkflowModals'

// Trình duyệt vẫn bắn sự kiện click ngay sau khi thả thẻ; bỏ qua click đó để không mở nhầm công việc.
let lastDragAt = 0
const markDrag = () => {
  lastDragAt = Date.now()
}
const justDragged = () => Date.now() - lastDragAt < 400

export type ViewKey = 'list' | 'kanban' | 'calendar' | 'timeline'

const VIEWS: { key: ViewKey; label: string; icon: ReactNode }[] = [
  { key: 'list', label: 'Danh sách', icon: <List className="size-4" /> },
  { key: 'kanban', label: 'Kanban', icon: <KanbanSquare className="size-4" /> },
  { key: 'calendar', label: 'Lịch', icon: <CalendarDays className="size-4" /> },
  { key: 'timeline', label: 'Timeline', icon: <GanttChart className="size-4" /> },
]

export function ViewTabs({ view, onChange, views = VIEWS.map((v) => v.key) }: { view: ViewKey; onChange: (v: ViewKey) => void; views?: ViewKey[] }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-sunken p-1">
      {VIEWS.filter((v) => views.includes(v.key)).map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={clsx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm', view === v.key ? 'bg-surface font-medium shadow-sm' : 'text-ink-soft hover:text-ink')}
        >
          {v.icon} {v.label}
        </button>
      ))}
    </div>
  )
}

export function TaskViews({ tasks, view, showProject = true, emptyAction }: { tasks: Task[]; view: ViewKey; showProject?: boolean; emptyAction?: ReactNode }) {
  if (view === 'kanban') return <KanbanBoard tasks={tasks} />
  if (view === 'calendar') return <CalendarView tasks={tasks} />
  if (view === 'timeline') return <TimelineView tasks={tasks} />
  return <TaskTable tasks={tasks} showProject={showProject} emptyAction={emptyAction} />
}

/** Cập nhật lạc quan danh sách công việc trong bộ nhớ đệm */
function usePatchTask() {
  const qc = useQueryClient()
  const invalidate = useInvalidateTask()
  const toast = useToast()
  return async (task: Task, patch: Partial<Task>, okMsg: string) => {
    const prev = qc.getQueryData<Task[]>(qk.tasks)
    qc.setQueryData<Task[]>(qk.tasks, (old) => old?.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
    const { error } = await db().from('tasks').update(patch).eq('id', task.id)
    if (error) {
      qc.setQueryData(qk.tasks, prev)
      toast.error(error)
    } else toast.ok(okMsg)
    invalidate(task.id)
  }
}

// ======================= KANBAN =======================
const KANBAN_COLUMNS: TaskStatus[] = STATUS_ORDER.filter((s) => s !== 'da_huy')

function KanbanCard({ task, draggable }: { task: Task; draggable: boolean }) {
  const { brandById, profileById, projectById } = useLookups()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable })
  const navigate = useNavigate()
  const brand = brandById.get(task.brand_id)
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && !justDragged() && navigate(`/cong-viec/${task.id}`)}
      className={clsx(
        'cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(43,39,36,0.05)] transition-shadow hover:shadow-md',
        draggable && 'touch-none',
        isDragging && 'z-50 rotate-1 shadow-xl ring-2 ring-ink/20',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={clsx('size-2 rounded-full', brand ? BRAND_STYLE[brand.color].bg : 'bg-line')} />
        <span className="truncate text-[11px] text-ink-muted">{task.project_id ? projectById.get(task.project_id)?.name : brand?.name}</span>
        {task.is_demo && <DemoTag />}
      </div>
      <p className="text-sm leading-snug font-medium">{task.title}</p>
      {task.is_blocked && (
        <p className="mt-1 flex items-center gap-1 text-xs text-danger">
          <AlertOctagon className="size-3" /> Vướng mắc
        </p>
      )}
      <ProgressBar value={effectiveProgress(task)} className="mt-2" color={task.status === 'hoan_thanh' ? 'bg-ok' : undefined} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <PriorityBadge priority={task.priority} />
        <span className={clsx('text-xs', isOverdue(task) ? 'font-medium text-danger' : 'text-ink-muted')}>{task.due_at ? fmtShort(task.due_at) : 'Không hạn'}</span>
        <AvatarStack profiles={taskPeople(task).map((id) => profileById.get(id))} max={2} />
      </div>
    </div>
  )
}

function KanbanColumn({ status, tasks, canDrag }: { status: TaskStatus; tasks: Task[]; canDrag: (t: Task) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className={clsx('flex w-72 shrink-0 flex-col rounded-2xl bg-sunken/70 p-2 transition-colors', isOver && 'bg-[#ebe3d8] ring-2 ring-ink/10')}>
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-sm font-semibold">{STATUS_LABEL[status]}</span>
        <span className="num rounded-full bg-surface px-2 text-xs text-ink-soft">{tasks.length}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2 p-1">
        {tasks.map((t) => (
          <KanbanCard key={t.id} task={t} draggable={canDrag(t)} />
        ))}
      </div>
    </div>
  )
}

export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const me = useMe()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const patch = usePatchTask()
  const [submitting, setSubmitting] = useState<Task | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const byStatus = useMemo(() => {
    const m = new Map<TaskStatus, Task[]>(KANBAN_COLUMNS.map((s) => [s, []]))
    for (const t of tasks) m.get(t.status)?.push(t)
    return m
  }, [tasks])
  const isWorker = (t: Task) => taskPeople(t).includes(me.id)
  const canDrag = (t: Task) => isAdmin || (isWorker(t) && EMPLOYEE_EDITABLE_FROM.includes(t.status))

  const onDragEnd = (e: DragEndEvent) => {
    const task = tasks.find((t) => t.id === e.active.id)
    const to = e.over?.id as TaskStatus | undefined
    if (!task || !to || to === task.status) return
    if (!isAdmin) {
      if ((to === 'cho_duyet' && task.requires_approval) || (to === 'hoan_thanh' && !task.requires_approval)) return setSubmitting(task)
      if (!EMPLOYEE_SETTABLE_STATUSES.includes(to)) {
        return toast.error(to === 'hoan_thanh' ? 'Việc này cần quản lý duyệt — kéo vào "Chờ duyệt" để nộp.' : `Bạn không thể chuyển sang "${STATUS_LABEL[to]}".`)
      }
    }
    patch(task, { status: to }, `Đã chuyển sang "${STATUS_LABEL[to]}"`)
  }

  if (!tasks.length) return <div className="card"><EmptyState title="Chưa có công việc" /></div>
  return (
    <>
      <DndContext sensors={sensors} onDragStart={markDrag} onDragCancel={markDrag} onDragEnd={(e) => { markDrag(); onDragEnd(e) }}>
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="flex gap-3">
            {KANBAN_COLUMNS.map((s) => (
              <KanbanColumn key={s} status={s} tasks={byStatus.get(s) ?? []} canDrag={canDrag} />
            ))}
          </div>
        </div>
      </DndContext>
      <p className="mt-1 text-xs text-ink-muted">
        Kéo thẻ để đổi trạng thái. {isAdmin ? 'Quản trị viên chuyển được mọi cột.' : 'Kéo vào "Chờ duyệt" để nộp kết quả; chỉ quản lý mới chuyển sang "Hoàn thành".'} Việc đã hủy không hiển thị.
      </p>
      {submitting && <SubmitModal task={submitting} onClose={() => setSubmitting(null)} />}
    </>
  )
}

// ======================= LỊCH =======================
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

function CalendarChip({ task, draggable }: { task: Task; draggable: boolean }) {
  const { brandById } = useLookups()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable })
  const brand = brandById.get(task.brand_id)
  const s = brand ? BRAND_STYLE[brand.color] : BRAND_STYLE.terracotta
  return (
    <Link
      ref={setNodeRef}
      to={`/cong-viec/${task.id}`}
      style={{ borderLeftColor: s.hex, ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {}) }}
      {...listeners}
      {...attributes}
      title={`${task.title} · ${STATUS_LABEL[task.status]}`}
      className={clsx(
        'block truncate rounded-md border-l-2 px-1.5 py-0.5 text-[11px] leading-tight',
        s.soft,
        task.status === 'hoan_thanh' && 'line-through opacity-60',
        isOverdue(task) && 'ring-1 ring-danger/50',
        draggable && 'touch-none',
        isDragging && 'z-50 shadow-lg',
      )}
      onClick={(e) => (isDragging || justDragged()) && e.preventDefault()}
    >
      <span className={clsx('font-medium', s.text)}>
        {task.title}
      </span>
    </Link>
  )
}

function CalendarDay({ dateKey, inMonth, isToday, tasks, canDrag }: { dateKey: string; inMonth: boolean; isToday: boolean; tasks: Task[]; canDrag: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey })
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? tasks : tasks.slice(0, 3)
  return (
    <div ref={setNodeRef} className={clsx('min-h-28 border-t border-l border-line p-1.5', !inMonth && 'bg-sunken/50', isOver && 'bg-[#efe6da]')}>
      <div className={clsx('mb-1 flex size-6 items-center justify-center rounded-full text-xs', isToday ? 'bg-ink font-semibold text-white' : inMonth ? 'text-ink-soft' : 'text-ink-muted')}>
        {Number(dateKey.slice(8))}
      </div>
      <div className="space-y-1">
        {shown.map((t) => (
          <CalendarChip key={t.id} task={t} draggable={canDrag} />
        ))}
        {tasks.length > 3 && (
          <button onClick={() => setExpanded(!expanded)} className="px-1 text-[11px] text-ink-soft hover:underline">
            {expanded ? 'Thu gọn' : `+${tasks.length - 3} việc`}
          </button>
        )}
      </div>
    </div>
  )
}

export function CalendarView({ tasks }: { tasks: Task[] }) {
  const { isAdmin } = useAuth()
  const patch = usePatchTask()
  const todayKey = vnDateKey(new Date())
  const [month, setMonth] = useState(todayKey.slice(0, 7)) // 'YYYY-MM'
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const [y, m] = month.split('-').map(Number)
  const first = vnStartOfDateKey(`${month}-01`)
  const gridStart = addDays(first, -(vnWeekday(first) - 1))
  const days = Array.from({ length: 42 }, (_, i) => vnDateKey(addDays(gridStart, i)))
  const weeks = days.slice(35).some((k) => k.startsWith(month)) ? 6 : 5

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.due_at || t.status === 'da_huy') continue
      const k = vnDateKey(t.due_at)
      map.set(k, [...(map.get(k) ?? []), t])
    }
    return map
  }, [tasks])
  const noDue = tasks.filter((t) => !t.due_at && t.status !== 'da_huy' && t.status !== 'hoan_thanh').length
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  const onDragEnd = (e: DragEndEvent) => {
    const task = tasks.find((t) => t.id === e.active.id)
    const toKey = e.over?.id as string | undefined
    if (!task || !toKey || !task.due_at || vnDateKey(task.due_at) === toKey) return
    // giữ nguyên giờ trong ngày của hạn chót
    const offset = new Date(task.due_at).getTime() - vnStartOfDay(new Date(task.due_at)).getTime()
    const due_at = new Date(vnStartOfDateKey(toKey).getTime() + offset).toISOString()
    patch(task, { due_at }, `Đã dời hạn sang ${toKey.split('-').reverse().join('/')}`)
  }

  const monthTasks = days.filter((k) => k.startsWith(month)).flatMap((k) => (byDay.get(k) ?? []).map((t) => ({ k, t })))

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <button onClick={() => shift(-1)} className="rounded-lg p-1.5 hover:bg-sunken" aria-label="Tháng trước">
          <ChevronLeft className="size-4" />
        </button>
        <p className="min-w-32 text-center font-semibold">
          Tháng {m}/{y}
        </p>
        <button onClick={() => shift(1)} className="rounded-lg p-1.5 hover:bg-sunken" aria-label="Tháng sau">
          <ChevronRight className="size-4" />
        </button>
        <button onClick={() => setMonth(todayKey.slice(0, 7))} className="rounded-lg px-2.5 py-1 text-sm hover:bg-sunken">
          Hôm nay
        </button>
        <span className="ml-auto text-xs text-ink-muted">
          {isAdmin ? 'Kéo việc sang ngày khác để dời hạn (được ghi nhật ký). ' : ''}
          {noDue > 0 && `${noDue} việc chưa có hạn không hiện trên lịch.`}
        </span>
      </div>
      {/* Lưới tháng (máy tính / máy tính bảng) */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-line bg-sunken/60 text-center text-xs font-medium text-ink-soft">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <DndContext sensors={sensors} onDragStart={markDrag} onDragCancel={markDrag} onDragEnd={(e) => { markDrag(); onDragEnd(e) }}>
          <div className="grid grid-cols-7 border-r border-b border-line">
            {days.slice(0, weeks * 7).map((k) => (
              <CalendarDay key={k} dateKey={k} inMonth={k.startsWith(month)} isToday={k === todayKey} tasks={byDay.get(k) ?? []} canDrag={isAdmin} />
            ))}
          </div>
        </DndContext>
      </div>
      {/* Danh sách theo ngày (điện thoại) */}
      <div className="divide-y divide-line md:hidden">
        {monthTasks.length === 0 ? (
          <EmptyState title="Tháng này chưa có việc có hạn" />
        ) : (
          Object.entries(
            monthTasks.reduce<Record<string, Task[]>>((acc, { k, t }) => ({ ...acc, [k]: [...(acc[k] ?? []), t] }), {}),
          ).map(([k, list]) => (
            <div key={k} className="px-4 py-3">
              <p className={clsx('mb-2 text-xs font-semibold', k === todayKey ? 'text-ink' : 'text-ink-soft')}>
                {k === todayKey ? 'Hôm nay · ' : ''}
                {k.split('-').reverse().join('/')}
              </p>
              <div className="space-y-1">
                {list.map((t) => (
                  <CalendarChip key={t.id} task={t} draggable={false} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ======================= TIMELINE =======================
const DAY_W = 28

export function TimelineView({ tasks }: { tasks: Task[] }) {
  const { brandById, profileById } = useLookups()
  const rows = tasks
    .filter((t) => t.status !== 'da_huy' && t.due_at)
    .map((t) => {
      const end = vnDateKey(t.due_at!)
      const startKey = t.start_date ?? vnDateKey(t.created_at)
      return { t, start: startKey <= end ? startKey : end, end }
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
  if (!rows.length) return <div className="card"><EmptyState title="Chưa có việc có hạn để vẽ timeline" hint="Timeline dùng ngày bắt đầu (hoặc ngày tạo) và hạn chót của từng việc." /></div>

  const todayKey = vnDateKey(new Date())
  const minKey = [rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0].start), todayKey].sort()[0]
  const maxKey = [rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end), todayKey].sort()[1]
  const from = addDays(vnStartOfDateKey(minKey), -2)
  const total = Math.round((addDays(vnStartOfDateKey(maxKey), 3).getTime() - from.getTime()) / 86_400_000)
  const days = Array.from({ length: total }, (_, i) => addDays(from, i))
  const idx = (key: string) => Math.round((vnStartOfDateKey(key).getTime() - from.getTime()) / 86_400_000)
  const todayIdx = idx(todayKey)

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ width: 240 + total * DAY_W }} className="relative">
          {/* Tiêu đề ngày */}
          <div className="sticky top-0 z-10 flex border-b border-line bg-surface">
            <div className="sticky left-0 z-20 w-60 shrink-0 border-r border-line bg-surface px-3 py-2 text-xs font-medium text-ink-soft">Công việc</div>
            {days.map((d, i) => {
              const key = vnDateKey(d)
              const isMon = vnWeekday(d) === 1
              return (
                <div key={i} style={{ width: DAY_W }} className={clsx('shrink-0 py-1 text-center text-[10px]', vnWeekday(d) >= 6 && 'bg-sunken/60', key === todayKey && 'font-bold text-danger')}>
                  {(isMon || i === 0) && <div className="text-ink-muted">{fmtShort(d)}</div>}
                  <div className="text-ink-soft">{key.slice(8)}</div>
                </div>
              )
            })}
          </div>
          {/* Hàng việc */}
          {rows.map(({ t, start, end }) => {
            const brand = brandById.get(t.brand_id)
            const s = brand ? BRAND_STYLE[brand.color] : BRAND_STYLE.terracotta
            const left = idx(start) * DAY_W
            const width = Math.max(1, idx(end) - idx(start) + 1) * DAY_W
            const owner = t.primary_owner_id ? profileById.get(t.primary_owner_id) : undefined
            return (
              <div key={t.id} className="flex border-b border-line/70 hover:bg-[#fcfaf7]">
                <Link to={`/cong-viec/${t.id}`} className="sticky left-0 z-10 w-60 shrink-0 truncate border-r border-line bg-surface px-3 py-2 text-sm hover:underline" title={t.title}>
                  {t.title}
                  <span className="block truncate text-[11px] text-ink-muted">{owner?.full_name ?? 'Chưa giao'}</span>
                </Link>
                <div className="relative flex-1">
                  <Link
                    to={`/cong-viec/${t.id}`}
                    title={`${t.title}: ${start.split('-').reverse().join('/')} → ${end.split('-').reverse().join('/')} · ${STATUS_LABEL[t.status]}`}
                    className={clsx('absolute top-2.5 h-6 overflow-hidden rounded-md', isOverdue(t) && 'ring-2 ring-danger/60')}
                    style={{ left, width, background: `${s.hex}26` }}
                  >
                    <span className="block h-full" style={{ width: `${effectiveProgress(t)}%`, background: t.status === 'hoan_thanh' ? '#2f7d4f' : s.hex, opacity: 0.85 }} />
                  </Link>
                </div>
              </div>
            )
          })}
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-danger/60" style={{ left: 240 + todayIdx * DAY_W + DAY_W / 2 }} />
        </div>
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
        Thanh = từ ngày bắt đầu (hoặc ngày tạo) đến hạn chót; phần đậm = tiến độ; viền đỏ = quá hạn; vạch đỏ = hôm nay.
      </p>
    </div>
  )
}
