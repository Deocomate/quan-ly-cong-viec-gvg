import clsx from 'clsx'
import { AlertOctagon, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLookups } from '../hooks/queries'
import { BRAND_STYLE, PRIORITY_LABEL, PRIORITY_RANK, STATUS_LABEL, STATUS_ORDER } from '../lib/constants'
import { fmtDate, relativeDue } from '../lib/dates'
import { effectiveProgress, isOverdue, taskPeople } from '../lib/metrics'
import type { Task, TaskPriority, TaskStatus } from '../lib/types'
import { AvatarStack, DemoTag, EmptyState, PriorityBadge, ProgressBar, StatusBadge } from './ui'

export function DueText({ task, className }: { task: Task; className?: string }) {
  const overdue = isOverdue(task)
  if (task.status === 'hoan_thanh') return <span className={clsx('text-xs text-ink-muted', className)}>Xong {fmtDate(task.completed_at)}</span>
  return (
    <span title={task.due_at ? `Hạn: ${fmtDate(task.due_at)}` : undefined} className={clsx('text-xs whitespace-nowrap', overdue ? 'font-medium text-danger' : 'text-ink-soft', className)}>
      {relativeDue(task.due_at)}
    </span>
  )
}

export function TaskRow({ task, showProject = true, extra }: { task: Task; showProject?: boolean; extra?: ReactNode }) {
  const { brandById, projectById, profileById } = useLookups()
  const brand = brandById.get(task.brand_id)
  const project = task.project_id ? projectById.get(task.project_id) : undefined
  return (
    <div className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-[#fcfaf7] sm:flex-row sm:items-center sm:gap-4">
      <Link to={`/cong-viec/${task.id}`} className="flex min-w-0 flex-1 items-start gap-3">
        <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', brand ? BRAND_STYLE[brand.color]?.bg : 'bg-line')} title={brand?.name} />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={clsx('text-sm font-medium group-hover:underline', task.status === 'da_huy' && 'text-ink-muted line-through')}>{task.title}</span>
            {task.is_blocked && (
              <span title={task.blocker_note ?? 'Có vướng mắc'} className="inline-flex items-center gap-0.5 text-xs text-danger">
                <AlertOctagon className="size-3.5" /> Vướng mắc
              </span>
            )}
            {task.is_demo && <DemoTag />}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {brand?.name}
            {showProject && project ? ` · ${project.name}` : ''}
          </span>
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-2 pl-5 sm:flex-nowrap sm:pl-0">
        <AvatarStack profiles={taskPeople(task).map((id) => profileById.get(id))} />
        <div className="hidden w-20 md:block">
          <ProgressBar value={effectiveProgress(task)} color={task.status === 'hoan_thanh' ? 'bg-ok' : undefined} />
        </div>
        {/* Điện thoại chỉ hiện ưu tiên khi cao / khẩn cấp */}
        <span className={clsx(task.priority !== 'cao' && task.priority !== 'khan_cap' && 'max-sm:hidden')}>
          <PriorityBadge priority={task.priority} />
        </span>
        <StatusBadge status={task.status} />
        <DueText task={task} className="w-20 text-right" />
        {extra}
      </div>
    </div>
  )
}

type SortKey = 'due' | 'priority' | 'updated'

export function TaskTable({
  tasks,
  showProject = true,
  emptyTitle = 'Chưa có công việc',
  emptyHint,
  emptyAction,
}: {
  tasks: Task[]
  showProject?: boolean
  emptyTitle?: string
  emptyHint?: string
  emptyAction?: ReactNode
}) {
  const { profiles } = useLookups()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<TaskStatus | 'open' | ''>('open')
  const [person, setPerson] = useState('')
  const [priority, setPriority] = useState<TaskPriority | ''>('')
  const [sort, setSort] = useState<SortKey>('due')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilters = Number(status !== 'open') + Number(!!person) + Number(!!priority) + Number(sort !== 'due')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = tasks.filter((t) => {
      if (needle && !`${t.title} ${t.description ?? ''}`.toLowerCase().includes(needle)) return false
      if (status === 'open' && (t.status === 'hoan_thanh' || t.status === 'da_huy')) return false
      if (status && status !== 'open' && t.status !== status) return false
      if (person && !taskPeople(t).includes(person)) return false
      if (priority && t.priority !== priority) return false
      return true
    })
    return list.sort((a, b) => {
      if (sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (sort === 'updated') return b.updated_at.localeCompare(a.updated_at)
      return (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999')
    })
  }, [tasks, q, status, person, priority, sort])

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line p-3 lg:flex-row lg:items-center">
        <div className="flex gap-2 lg:flex-1">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
            <input className="input pl-9" type="search" placeholder="Tìm công việc…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {/* Điện thoại: ẩn bớt bộ lọc sau một nút */}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={clsx('relative flex size-11 shrink-0 items-center justify-center rounded-xl border sm:hidden', filtersOpen ? 'border-ink bg-sunken' : 'border-line-strong')}
            aria-label="Bộ lọc"
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal className="size-4" />
            {activeFilters > 0 && <span className="num absolute -top-1 -right-1 min-w-4 rounded-full bg-ink px-1 text-[10px] leading-4 text-white">{activeFilters}</span>}
          </button>
        </div>
        <div className={clsx('grid-cols-2 gap-2 sm:grid sm:grid-cols-4 lg:flex', filtersOpen ? 'grid' : 'hidden')}>
          <select className="input lg:w-40" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | 'open' | '')} aria-label="Lọc trạng thái">
            <option value="open">Đang mở</option>
            <option value="">Tất cả trạng thái</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select className="input lg:w-40" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Lọc người thực hiện">
            <option value="">Mọi người</option>
            {profiles
              .filter((p) => p.is_active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
          <select className="input lg:w-36" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority | '')} aria-label="Lọc độ ưu tiên">
            <option value="">Mọi ưu tiên</option>
            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <select className="input lg:w-36" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sắp xếp">
            <option value="due">Theo hạn chót</option>
            <option value="priority">Theo ưu tiên</option>
            <option value="updated">Mới cập nhật</option>
          </select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title={tasks.length ? 'Không có công việc khớp bộ lọc' : emptyTitle}
          hint={tasks.length ? 'Thử đổi bộ lọc hoặc từ khóa.' : emptyHint}
          action={tasks.length ? undefined : emptyAction}
        />
      ) : (
        <div className="divide-y divide-line">
          {filtered.map((t) => (
            <TaskRow key={t.id} task={t} showProject={showProject} />
          ))}
        </div>
      )}
      <div className="border-t border-line px-4 py-2 text-xs text-ink-muted">
        {filtered.length} / {tasks.length} công việc
      </div>
    </div>
  )
}
