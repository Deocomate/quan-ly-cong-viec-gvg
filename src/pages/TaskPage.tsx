import clsx from 'clsx'
import {
  AlertOctagon,
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileUp,
  Link2,
  Pencil,
  Plus,
  Send,
  Star,
  Trash2,
} from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { TaskFormModal } from '../components/TaskFormModal'
import {
  Avatar,
  Badge,
  BrandTag,
  Button,
  DemoTag,
  EmptyState,
  ErrorBox,
  Loading,
  PriorityBadge,
  ProgressBar,
  StatusBadge,
  useConfirm,
  useToast,
} from '../components/ui'
import { ReviewModal, SubmitModal } from '../components/WorkflowModals'
import { NoteModal } from './MyWorkPage'
import { useAuth, useMe } from '../contexts/AuthContext'
import { useQueryClient } from '@tanstack/react-query'
import {
  qk,
  useActivity,
  useApprovals,
  useAttachments,
  useChecklist,
  useComments,
  useInvalidateTask,
  useLookups,
  useSubtasks,
  useTask,
} from '../hooks/queries'
import {
  ACTIVITY_LABEL,
  EMPLOYEE_EDITABLE_FROM,
  EMPLOYEE_SETTABLE_STATUSES,
  FIELD_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  SUBMITTABLE_FROM,
  WEIGHT_OPTIONS,
} from '../lib/constants'
import { fmtDate, fmtDateKey, fmtDateTime, relativeDue } from '../lib/dates'
import { effectiveProgress, isOnTime, isOverdue, overdueDays, taskPeople } from '../lib/metrics'
import { db, STORAGE_BUCKET } from '../lib/backend'
import type { ActivityLog, ChecklistItem, CommentKind, Profile, Subtask, Task, TaskStatus } from '../lib/types'

export function TaskPage() {
  const { id = '' } = useParams()
  const taskQ = useTask(id)
  const lookups = useLookups()
  const me = useMe()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const toast = useToast()
  const invalidate = useInvalidateTask()
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [tab, setTab] = useState<'comments' | 'approvals' | 'activity'>('comments')

  if (taskQ.isLoading || lookups.isLoading) return <Loading />
  if (taskQ.error) return <ErrorBox error={taskQ.error} onRetry={() => taskQ.refetch()} />
  const task = taskQ.data
  if (!task)
    return (
      <div className="card">
        <EmptyState title="Không tìm thấy công việc" hint="Công việc có thể đã bị xóa hoặc bạn không có quyền xem." action={<Link to="/cong-viec-cua-toi"><Button>Về Công việc của tôi</Button></Link>} />
      </div>
    )

  const people = taskPeople(task)
  const isWorker = people.includes(me.id)
  const canWork = isAdmin || isWorker
  const employeeCanEdit = isWorker && EMPLOYEE_EDITABLE_FROM.includes(task.status)
  const brand = lookups.brandById.get(task.brand_id)
  const project = task.project_id ? lookups.projectById.get(task.project_id) : undefined

  const patch = async (p: Partial<Task>, msg = 'Đã cập nhật') => {
    const { error } = await db().from('tasks').update(p).eq('id', task.id)
    if (error) return toast.error(error)
    invalidate(task.id)
    toast.ok(msg)
  }

  const changeStatus = async (s: TaskStatus) => {
    if (s === task.status) return
    if (s === 'da_huy') {
      const ok = await confirm({ title: 'Hủy công việc?', message: 'Công việc đã hủy sẽ bị loại khỏi mọi thống kê hiệu suất. Bạn có thể mở lại sau.', confirmLabel: 'Hủy công việc', danger: true })
      if (!ok) return
    }
    patch({ status: s }, `Đã chuyển sang "${STATUS_LABEL[s]}"`)
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Xóa vĩnh viễn công việc?',
      message: 'Toàn bộ bình luận, tệp đính kèm, lịch sử duyệt và nhật ký của công việc này sẽ bị xóa và không thể khôi phục. Nếu chỉ muốn dừng, hãy chọn trạng thái "Đã hủy".',
      confirmLabel: 'Xóa vĩnh viễn',
      danger: true,
    })
    if (!ok) return
    const { error } = await db().from('tasks').delete().eq('id', task.id)
    if (error) return toast.error(error)
    invalidate()
    toast.ok('Đã xóa công việc')
    navigate(project ? `/du-an/${project.id}` : '/')
  }

  const toggleBlocked = async () => {
    if (task.is_blocked) return patch({ is_blocked: false }, 'Đã gỡ vướng mắc')
    setBlocking(true)
  }

  return (
    <>
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Quay lại
      </button>

      <div className="mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <BrandTag brand={brand} />
          {project && (
            <Link to={`/du-an/${project.id}`} className="text-xs text-ink-soft hover:underline">
              {project.name}
            </Link>
          )}
          {task.is_demo && <DemoTag />}
        </div>
        <h1 className={clsx('text-xl font-semibold tracking-tight sm:text-2xl', task.status === 'da_huy' && 'text-ink-muted line-through')}>{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {isOverdue(task) && <Badge className="bg-danger-soft text-danger">Trễ {overdueDays(task)} ngày</Badge>}
          {task.revision_count > 0 && <Badge className="bg-sunken text-ink-soft">Đã sửa {task.revision_count} lần</Badge>}
        </div>
      </div>

      {/* Thanh hành động */}
      <div className="card mb-6 flex flex-wrap items-center gap-2 p-3">
        {isAdmin && task.status === 'cho_duyet' && (
          <Button variant="success" icon={<CheckCircle2 className="size-4" />} onClick={() => setReviewing(true)}>
            Duyệt / Yêu cầu sửa
          </Button>
        )}
        {isWorker && SUBMITTABLE_FROM.includes(task.status) && (
          <Button variant="primary" icon={<Send className="size-4" />} onClick={() => setSubmitting(true)}>
            {task.requires_approval ? 'Nộp duyệt' : 'Hoàn thành'}
          </Button>
        )}
        {(isAdmin || employeeCanEdit) && (
          <select className="input w-auto" value={task.status} onChange={(e) => changeStatus(e.target.value as TaskStatus)} aria-label="Đổi trạng thái">
            {(isAdmin ? STATUS_ORDER : Array.from(new Set([task.status, ...EMPLOYEE_SETTABLE_STATUSES]))).map((s) => (
              <option key={s} value={s} disabled={!isAdmin && !EMPLOYEE_SETTABLE_STATUSES.includes(s)}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}
        {(isAdmin || employeeCanEdit) && task.status !== 'hoan_thanh' && task.status !== 'da_huy' && (
          <Button variant={task.is_blocked ? 'secondary' : 'ghost'} icon={<AlertOctagon className="size-4" />} onClick={toggleBlocked}>
            {task.is_blocked ? 'Gỡ vướng mắc' : 'Báo vướng mắc'}
          </Button>
        )}
        {isAdmin && (
          <>
            <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} className="sm:ml-auto">
              Sửa
            </Button>
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={remove} className="text-danger">
              Xóa
            </Button>
          </>
        )}
        {!canWork && <p className="text-sm text-ink-muted">Bạn đang xem công việc của thương hiệu mình. Chỉ người được giao mới cập nhật được.</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {task.is_blocked && (
            <div className="flex gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm">
              <AlertOctagon className="mt-0.5 size-5 shrink-0 text-danger" />
              <div>
                <p className="font-medium text-danger">Đang có vướng mắc</p>
                <p className="mt-0.5 whitespace-pre-wrap">{task.blocker_note}</p>
              </div>
            </div>
          )}
          {task.status === 'can_chinh_sua' && <RevisionNotice taskId={task.id} />}

          <section className="card p-5">
            <h2 className="mb-2 text-sm font-semibold">Hướng dẫn chi tiết</h2>
            {task.description ? <p className="text-sm whitespace-pre-wrap text-ink-soft">{task.description}</p> : <p className="text-sm text-ink-muted">Chưa có mô tả.</p>}
            {task.links.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {task.links.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-sunken px-2.5 py-1.5 text-xs hover:bg-line">
                    <Link2 className="size-3.5" /> {l.label} <ExternalLink className="size-3 text-ink-muted" />
                  </a>
                ))}
              </div>
            )}
          </section>

          <Checklist task={task} canWork={canWork} />
          <Subtasks task={task} canWork={canWork} />

          {task.completion_evidence && (
            <section className="card p-5">
              <h2 className="mb-2 text-sm font-semibold">Bằng chứng hoàn thành</h2>
              <p className="text-sm whitespace-pre-wrap text-ink-soft">{linkify(task.completion_evidence)}</p>
            </section>
          )}

          <Attachments task={task} canWork={canWork} />

          <section className="card">
            <div className="flex gap-1 border-b border-line p-2">
              {(
                [
                  ['comments', 'Trao đổi'],
                  ['approvals', 'Lịch sử duyệt'],
                  ['activity', 'Nhật ký thay đổi'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={clsx('rounded-lg px-3 py-1.5 text-sm', tab === k ? 'bg-sunken font-medium' : 'text-ink-soft hover:bg-sunken')}>
                  {l}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === 'comments' && <Comments task={task} />}
              {tab === 'approvals' && <ApprovalHistory taskId={task.id} />}
              {tab === 'activity' && <ActivityList taskId={task.id} />}
            </div>
          </section>
        </div>

        {/* Thông tin bên phải */}
        <aside className="space-y-4">
          <section className="card p-5">
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Tiến độ</h2>
              <span className="num text-sm font-semibold">{effectiveProgress(task)}%</span>
            </div>
            <ProgressBar value={effectiveProgress(task)} className="h-2" color={task.status === 'hoan_thanh' ? 'bg-ok' : undefined} />
            {(isAdmin || employeeCanEdit) && task.status !== 'hoan_thanh' && task.status !== 'cho_duyet' && (
              <ProgressSlider task={task} onSave={(v) => patch({ progress: v, ...(task.status === 'chua_bat_dau' && v > 0 ? { status: 'dang_thuc_hien' as TaskStatus } : {}) }, 'Đã cập nhật tiến độ')} />
            )}
          </section>

          <section className="card divide-y divide-line text-sm">
            <Row label="Người phụ trách chính">
              <Person p={task.primary_owner_id ? lookups.profileById.get(task.primary_owner_id) : undefined} />
            </Row>
            <Row label="Người được giao">
              <div className="flex flex-col items-end gap-1">
                {people.length ? people.map((id) => <Person key={id} p={lookups.profileById.get(id)} />) : <span className="text-ink-muted">Chưa giao</span>}
              </div>
            </Row>
            <Row label="Hạn chót">
              <div className="text-right">
                <p className={clsx(isOverdue(task) && 'font-medium text-danger')}>{fmtDate(task.due_at)}</p>
                {task.due_at && task.status !== 'hoan_thanh' && <p className="text-xs text-ink-muted">{relativeDue(task.due_at)}</p>}
                {task.original_due_at && task.due_at && task.original_due_at !== task.due_at && (
                  <p className="text-xs text-warn">Hạn gốc {fmtDate(task.original_due_at)} · do quản lý điều chỉnh</p>
                )}
              </div>
            </Row>
            <Row label="Ngày bắt đầu">{fmtDateKey(task.start_date)}</Row>
            <Row label="Độ ưu tiên">{PRIORITY_LABEL[task.priority]}</Row>
            <Row label="Độ phức tạp">{WEIGHT_OPTIONS.find((w) => w.value === task.weight)?.label}</Row>
            <Row label="Giờ ước tính">{task.estimated_hours != null ? `${Number(task.estimated_hours).toLocaleString('vi-VN')} giờ` : '—'}</Row>
            <Row label="Cần duyệt">{task.requires_approval ? 'Có' : 'Không'}</Row>
          </section>

          <section className="card divide-y divide-line text-sm">
            <Row label="Ngày tạo">{fmtDateTime(task.created_at)}</Row>
            <Row label="Nộp lần đầu">{fmtDateTime(task.first_submitted_at)}</Row>
            <Row label="Nộp gần nhất">{fmtDateTime(task.submitted_at)}</Row>
            <Row label="Quản lý duyệt lúc">{fmtDateTime(task.approved_at)}</Row>
            <Row label="Hoàn thành (tính KPI)">
              <div className="text-right">
                <p>{fmtDateTime(task.completed_at)}</p>
                {isOnTime(task) != null && (
                  <p className={clsx('text-xs', isOnTime(task) ? 'text-ok' : 'text-danger')}>{isOnTime(task) ? 'Đúng hạn' : 'Trễ hạn'}</p>
                )}
              </div>
            </Row>
            <Row label="Điểm chất lượng">
              {task.quality_score ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-4 fill-[#d9a227] text-[#d9a227]" /> {task.quality_score}/5
                </span>
              ) : (
                '—'
              )}
            </Row>
          </section>
        </aside>
      </div>

      {editing && <TaskFormModal open task={task} onClose={() => setEditing(false)} />}
      {submitting && <SubmitModal task={task} onClose={() => setSubmitting(false)} />}
      {reviewing && <ReviewModal task={task} onClose={() => setReviewing(false)} />}
      {blocking && <NoteModal task={task} initialKind="vuong_mac" onClose={() => setBlocking(false)} />}
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-2.5">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}

function Person({ p }: { p?: Profile }) {
  if (!p) return <span className="text-ink-muted">—</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar profile={p} size={20} /> {p.full_name}
    </span>
  )
}

function ProgressSlider({ task, onSave }: { task: Task; onSave: (v: number) => void }) {
  const [v, setV] = useState(task.progress)
  return (
    <div className="mt-4 flex items-center gap-3">
      <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => setV(Number(e.target.value))} className="flex-1 accent-[#2b2724]" aria-label="Tiến độ" />
      <Button size="sm" disabled={v === task.progress} onClick={() => onSave(v)}>
        Lưu {v}%
      </Button>
    </div>
  )
}

function linkify(text: string): ReactNode {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all text-info underline">
        {part}
      </a>
    ) : (
      part
    ),
  )
}

function RevisionNotice({ taskId }: { taskId: string }) {
  const approvals = useApprovals(taskId)
  const latest = (approvals.data ?? []).find((a) => a.decision === 'yeu_cau_sua')
  if (!latest) return null
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm">
      <p className="font-medium text-danger">Quản lý yêu cầu chỉnh sửa · {fmtDateTime(latest.reviewed_at)}</p>
      <p className="mt-1 whitespace-pre-wrap">{latest.feedback}</p>
    </div>
  )
}

function Checklist({ task, canWork }: { task: Task; canWork: boolean }) {
  const q = useChecklist(task.id)
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const me = useMe()
  const toast = useToast()
  const invalidate = useInvalidateTask()
  const [text, setText] = useState('')
  const items = q.data ?? []
  const done = items.filter((i) => i.is_done).length

  const toggle = async (id: string, is_done: boolean) => {
    // Cập nhật lạc quan để tích nhanh, hoàn tác nếu lỗi
    const key = qk.taskPart('checklist', task.id)
    qc.setQueryData<ChecklistItem[]>(key, (old) => old?.map((i) => (i.id === id ? { ...i, is_done } : i)))
    const { error } = await db().from('checklist_items').update({ is_done }).eq('id', id)
    if (error) toast.error(error)
    invalidate(task.id)
  }
  const add = async () => {
    if (!text.trim()) return
    const { error } = await db().from('checklist_items').insert({ task_id: task.id, title: text.trim(), sort_order: items.length + 1 })
    if (error) return toast.error(error)
    setText('')
    invalidate(task.id)
  }
  const del = async (id: string) => {
    const { error } = await db().from('checklist_items').delete().eq('id', id)
    if (error) return toast.error(error)
    invalidate(task.id)
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Checklist</h2>
        {items.length > 0 && <span className="num text-xs text-ink-muted">{done}/{items.length} đã xong</span>}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">Chưa có bước nào.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-sunken">
              <input type="checkbox" className="size-4 accent-[#2f7d4f]" checked={i.is_done} disabled={!canWork} onChange={(e) => toggle(i.id, e.target.checked)} />
              <span className={clsx('flex-1 text-sm', i.is_done && 'text-ink-muted line-through')}>{i.title}</span>
              {(isAdmin || (canWork && i.created_by === me.id)) && (
                <button onClick={() => del(i.id)} className="rounded p-1 text-ink-muted opacity-0 group-hover:opacity-100 hover:text-danger" aria-label="Xóa bước">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWork && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input className="input" placeholder="Thêm bước nhỏ…" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" icon={<Plus className="size-4" />}>
            Thêm
          </Button>
        </form>
      )}
    </section>
  )
}

function Subtasks({ task, canWork }: { task: Task; canWork: boolean }) {
  const q = useSubtasks(task.id)
  const qc = useQueryClient()
  const { isAdmin } = useAuth()
  const me = useMe()
  const { profileById, profiles } = useLookups()
  const toast = useToast()
  const invalidate = useInvalidateTask()
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const items = q.data ?? []
  if (!isAdmin && items.length === 0) return null

  const toggle = async (id: string, is_done: boolean) => {
    qc.setQueryData<Subtask[]>(qk.taskPart('subtasks', task.id), (old) => old?.map((i) => (i.id === id ? { ...i, is_done } : i)))
    const { error } = await db().from('subtasks').update({ is_done }).eq('id', id)
    if (error) toast.error(error)
    invalidate(task.id)
  }
  const add = async () => {
    if (!title.trim()) return
    const { error } = await db()
      .from('subtasks')
      .insert({ task_id: task.id, title: title.trim(), assignee_id: assignee || null, due_date: due || null, sort_order: items.length + 1 })
    if (error) return toast.error(error)
    setTitle('')
    setDue('')
    invalidate(task.id)
  }
  const del = async (id: string) => {
    const { error } = await db().from('subtasks').delete().eq('id', id)
    if (error) return toast.error(error)
    invalidate(task.id)
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-semibold">Việc con</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Chưa có việc con.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((s) => (
            <li key={s.id} className="group flex items-center gap-2.5 py-2">
              <input type="checkbox" className="size-4 accent-[#2f7d4f]" checked={s.is_done} disabled={!(canWork || s.assignee_id === me.id)} onChange={(e) => toggle(s.id, e.target.checked)} />
              <span className={clsx('flex-1 text-sm', s.is_done && 'text-ink-muted line-through')}>{s.title}</span>
              {s.due_date && <span className="text-xs text-ink-muted">{fmtDateKey(s.due_date)}</span>}
              {s.assignee_id && <Avatar profile={profileById.get(s.assignee_id)} size={22} />}
              {isAdmin && (
                <button onClick={() => del(s.id)} className="rounded p-1 text-ink-muted opacity-0 group-hover:opacity-100 hover:text-danger" aria-label="Xóa việc con">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_9rem_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input className="input" placeholder="Tên việc con…" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Người làm">
            <option value="">Người làm</option>
            {profiles
              .filter((p) => p.is_active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
          <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Hạn việc con" />
          <Button type="submit" icon={<Plus className="size-4" />}>
            Thêm
          </Button>
        </form>
      )}
    </section>
  )
}

function Attachments({ task, canWork }: { task: Task; canWork: boolean }) {
  const q = useAttachments(task.id)
  const { isAdmin } = useAuth()
  const me = useMe()
  const { profileById } = useLookups()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidateTask()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        if (f.size > 50 * 1024 * 1024) throw new Error(`Tệp "${f.name}" vượt quá 50 MB`)
        const safe = f.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
        const path = `${task.id}/${Date.now()}-${safe}`
        const { error: e1 } = await db().storage.from(STORAGE_BUCKET).upload(path, f, { contentType: f.type || undefined })
        if (e1) throw e1
        const { error: e2 } = await db()
          .from('task_attachments')
          .insert({ task_id: task.id, storage_path: path, file_name: f.name, mime_type: f.type || null, size_bytes: f.size, is_evidence: task.status !== 'hoan_thanh' })
        if (e2) {
          await db().storage.from(STORAGE_BUCKET).remove([path])
          throw e2
        }
      }
      toast.ok('Đã tải tệp lên')
      invalidate(task.id)
    } catch (e) {
      toast.error(e)
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  const download = async (path: string) => {
    const { data, error } = await db().storage.from(STORAGE_BUCKET).createSignedUrl(path, 60)
    if (error) return toast.error(error)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const del = async (id: string, path: string, name: string) => {
    if (!(await confirm({ title: 'Xóa tệp?', message: `Tệp "${name}" sẽ bị xóa vĩnh viễn.`, confirmLabel: 'Xóa tệp', danger: true }))) return
    const { error: e1 } = await db().storage.from(STORAGE_BUCKET).remove([path])
    if (e1) return toast.error(e1)
    const { error } = await db().from('task_attachments').delete().eq('id', id)
    if (error) return toast.error(error)
    invalidate(task.id)
    toast.ok('Đã xóa tệp')
  }

  const items = q.data ?? []
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tệp đính kèm</h2>
        {canWork && (
          <>
            <input ref={input} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button size="sm" icon={<FileUp className="size-3.5" />} loading={uploading} onClick={() => input.current?.click()}>
              Tải tệp lên
            </Button>
          </>
        )}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-muted">Chưa có tệp nào.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{a.file_name}</p>
                <p className="text-xs text-ink-muted">
                  {profileById.get(a.uploaded_by)?.full_name} · {fmtDateTime(a.created_at)}
                  {a.size_bytes != null && ` · ${(a.size_bytes / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`}
                </p>
              </div>
              <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => download(a.storage_path)}>
                Tải về
              </Button>
              {(isAdmin || a.uploaded_by === me.id) && (
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => del(a.id, a.storage_path, a.file_name)} aria-label="Xóa tệp" icon={<Trash2 className="size-3.5" />} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const KIND_LABEL: Record<CommentKind, string> = { binh_luan: 'Bình luận', tien_do: 'Tiến độ', vuong_mac: 'Vướng mắc' }
const KIND_STYLE: Record<CommentKind, string> = { binh_luan: 'bg-sunken text-ink-soft', tien_do: 'bg-info-soft text-info', vuong_mac: 'bg-danger-soft text-danger' }

function Comments({ task }: { task: Task }) {
  const q = useComments(task.id)
  const me = useMe()
  const { isAdmin } = useAuth()
  const { profileById, profiles } = useLookups()
  const toast = useToast()
  const invalidate = useInvalidateTask()
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<CommentKind>('binh_luan')
  const [mentions, setMentions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const mentionable = profiles.filter((p) => p.is_active && p.id !== me.id && (taskPeople(task).includes(p.id) || p.role === 'admin'))

  const send = async () => {
    if (!body.trim()) return
    setSaving(true)
    const { error } = await db().from('task_comments').insert({ task_id: task.id, author_id: me.id, body: body.trim(), kind, mentions })
    setSaving(false)
    if (error) return toast.error(error)
    setBody('')
    setMentions([])
    setKind('binh_luan')
    invalidate(task.id)
  }
  const del = async (id: string) => {
    const { error } = await db().from('task_comments').delete().eq('id', id)
    if (error) return toast.error(error)
    invalidate(task.id)
  }

  return (
    <div>
      {q.isLoading ? (
        <Loading />
      ) : (q.data ?? []).length === 0 ? (
        <p className="mb-4 text-sm text-ink-muted">Chưa có trao đổi nào.</p>
      ) : (
        <ul className="mb-4 space-y-4">
          {(q.data ?? []).map((c) => {
            const author = profileById.get(c.author_id)
            return (
              <li key={c.id} className="group flex gap-3">
                <Avatar profile={author} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <b className="text-sm">{author?.full_name ?? 'Người dùng'}</b>
                    {c.kind !== 'binh_luan' && <Badge className={KIND_STYLE[c.kind]}>{KIND_LABEL[c.kind]}</Badge>}
                    <span className="text-ink-muted">{fmtDateTime(c.created_at)}</span>
                    {(isAdmin || c.author_id === me.id) && (
                      <button onClick={() => del(c.id)} aria-label="Xóa bình luận" className="text-ink-muted hover:text-danger sm:opacity-0 sm:group-hover:opacity-100">
                        Xóa
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    {c.mentions.length > 0 && <span className="mr-1 text-info">{c.mentions.map((m) => `@${profileById.get(m)?.full_name ?? ''}`).join(' ')}</span>}
                    {linkify(c.body)}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="rounded-xl border border-line-strong p-3">
        <textarea className="w-full resize-y bg-transparent text-sm outline-none" rows={3} placeholder="Viết trao đổi, cập nhật tiến độ…" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="input w-auto py-1 text-xs" value={kind} onChange={(e) => setKind(e.target.value as CommentKind)} aria-label="Loại trao đổi">
            {(Object.keys(KIND_LABEL) as CommentKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          {mentionable.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setMentions((m) => (m.includes(p.id) ? m.filter((x) => x !== p.id) : [...m, p.id]))}
              className={clsx('rounded-full px-2 py-0.5 text-xs', mentions.includes(p.id) ? 'bg-info text-white' : 'bg-sunken text-ink-soft hover:bg-line')}
            >
              @{p.full_name}
            </button>
          ))}
          <Button size="sm" variant="primary" className="ml-auto" loading={saving} disabled={!body.trim()} onClick={send}>
            Gửi
          </Button>
        </div>
      </div>
    </div>
  )
}

function ApprovalHistory({ taskId }: { taskId: string }) {
  const q = useApprovals(taskId)
  const { profileById } = useLookups()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const list = q.data ?? []
  if (!list.length) return <p className="text-sm text-ink-muted">Chưa có lần nộp duyệt nào.</p>
  return (
    <ol className="space-y-3">
      {list.map((a, i) => (
        <li key={a.id} className="rounded-xl border border-line p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              Lần nộp {list.length - i} · {profileById.get(a.submitted_by ?? '')?.full_name}
            </p>
            <Badge className={a.decision === 'da_duyet' ? 'bg-ok-soft text-ok' : a.decision === 'yeu_cau_sua' ? 'bg-danger-soft text-danger' : 'bg-violet-soft text-violet'}>
              {a.decision === 'da_duyet' ? 'Đã duyệt' : a.decision === 'yeu_cau_sua' ? 'Yêu cầu sửa' : 'Chờ duyệt'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Nộp: {fmtDateTime(a.submitted_at)}
            {a.reviewed_at && ` · Xử lý: ${fmtDateTime(a.reviewed_at)} bởi ${profileById.get(a.reviewed_by ?? '')?.full_name ?? 'quản lý'}`}
          </p>
          {a.evidence && <p className="mt-2 whitespace-pre-wrap text-ink-soft">{a.evidence}</p>}
          {a.feedback && <p className="mt-2 rounded-lg bg-sunken p-2 whitespace-pre-wrap">{a.feedback}</p>}
          {a.quality_score && <p className="mt-1 text-xs">Chất lượng: {a.quality_score}/5</p>}
        </li>
      ))}
    </ol>
  )
}

function describeActivity(a: ActivityLog, name: (id: unknown) => string): string {
  const d = a.details as Record<string, unknown>
  switch (a.action) {
    case 'doi_trang_thai':
      return `từ "${STATUS_LABEL[d.from as TaskStatus] ?? d.from}" sang "${STATUS_LABEL[d.to as TaskStatus] ?? d.to}"`
    case 'doi_han_chot':
      return `từ ${fmtDate(d.from as string)} sang ${fmtDate(d.to as string)}`
    case 'cap_nhat_tien_do':
      return `${d.from}% → ${d.to}%`
    case 'giao_viec':
    case 'bo_giao_viec':
      return name(d.user_id)
    case 'tai_tep':
    case 'xoa_tep':
      return String(d.file_name ?? '')
    case 'bao_vuong_mac':
      return d.note ? `: ${d.note}` : ''
    case 'duyet':
      return d.quality_score ? `(chất lượng ${d.quality_score}/5)` : ''
    case 'yeu_cau_sua':
      return d.feedback ? `: ${d.feedback}` : ''
    case 'sua_thong_tin':
      return Object.keys(d)
        .map((k) => FIELD_LABEL[k] ?? k)
        .join(', ')
    default:
      return ''
  }
}

function ActivityList({ taskId }: { taskId: string }) {
  const q = useActivity(taskId)
  const { profileById } = useLookups()
  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} />
  const list = q.data ?? []
  if (!list.length) return <p className="text-sm text-ink-muted">Chưa có nhật ký.</p>
  const name = (id: unknown) => profileById.get(String(id))?.full_name ?? 'người dùng'
  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {list.map((a) => (
        <li key={a.id} className="text-sm">
          <span className="absolute -left-1 mt-1.5 size-2 rounded-full bg-line-strong" />
          <span className="font-medium">{a.actor_id ? name(a.actor_id) : 'Hệ thống'}</span>{' '}
          {a.actor_role === 'admin' && <Badge className="bg-sunken px-1 text-[10px] text-ink-muted">Quản lý</Badge>}{' '}
          <span className="text-ink-soft">
            {ACTIVITY_LABEL[a.action] ?? a.action} {describeActivity(a, name)}
          </span>
          <p className="text-xs text-ink-muted">{fmtDateTime(a.created_at)}</p>
        </li>
      ))}
    </ol>
  )
}
