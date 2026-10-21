import clsx from 'clsx'
import { AlertOctagon, ChevronDown, ChevronRight, ExternalLink, MessageSquarePlus, MoreHorizontal, Play, Send } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DueText } from '../components/TaskList'
import { ActionSheet, BrandChips, Button, DemoTag, EmptyState, ErrorBox, Field, fmtPct, Loading, Modal, PageHeader, ProgressBar, useToast } from '../components/ui'
import { SubmitModal } from '../components/WorkflowModals'
import { useMe } from '../contexts/AuthContext'
import { useInvalidateTask, useLookups, useTasks } from '../hooks/queries'
import { BRAND_STYLE, EMPLOYEE_EDITABLE_FROM, EMPLOYEE_SETTABLE_STATUSES, PRIORITY_LABEL, STATUS_LABEL, SUBMITTABLE_FROM } from '../lib/constants'
import { addDays, presetRange, vnStartOfDay } from '../lib/dates'
import { effectiveProgress, employeeStat, isAssignedTo, myBucket, type MyBucket } from '../lib/metrics'
import { db } from '../lib/backend'
import type { CommentKind, Task, TaskStatus } from '../lib/types'

type Tab = 'todo' | 'review' | 'done'

// Các nhóm trong tab "Cần làm", xếp theo mức gấp
const TODO_GROUPS: { key: MyBucket; label: string; tone: string }[] = [
  { key: 'qua_han', label: 'Quá hạn', tone: 'text-danger' },
  { key: 'can_chinh_sua', label: 'Cần chỉnh sửa', tone: 'text-danger' },
  { key: 'hom_nay', label: 'Hạn hôm nay', tone: 'text-warn' },
  { key: 'sap_den_han', label: 'Sắp đến hạn (3 ngày)', tone: 'text-ink' },
  { key: 'dang_thuc_hien', label: 'Đang thực hiện', tone: 'text-info' },
  { key: 'khac', label: 'Chưa đến lượt', tone: 'text-ink-soft' },
]

type Patch = Partial<Pick<Task, 'status' | 'progress'>>

export function MyWorkPage() {
  const me = useMe()
  const tasksQ = useTasks()
  const { brands, isLoading } = useLookups()
  const [brandId, setBrandId] = useState('')
  const [tab, setTab] = useState<Tab>('todo')
  const [showLater, setShowLater] = useState(false)
  const [submitting, setSubmitting] = useState<Task | null>(null)
  const [noting, setNoting] = useState<{ task: Task; kind: CommentKind } | null>(null)
  const [menu, setMenu] = useState<Task | null>(null)
  const toast = useToast()
  const invalidate = useInvalidateTask()

  const mine = useMemo(
    () => (tasksQ.data ?? []).filter((t) => isAssignedTo(t, me.id) && t.status !== 'da_huy' && (!brandId || t.brand_id === brandId)),
    [tasksQ.data, me.id, brandId],
  )
  const stat = employeeStat(tasksQ.data ?? [], me.id, presetRange('month'))

  const grouped = useMemo(() => {
    const g: Record<MyBucket, Task[]> = {
      hom_nay: [], sap_den_han: [], dang_thuc_hien: [], cho_duyet: [], can_chinh_sua: [], qua_han: [], da_hoan_thanh: [], khac: [],
    }
    const cutoff = addDays(vnStartOfDay(new Date()), -30)
    for (const t of mine) {
      const b = myBucket(t)
      if (b === 'da_hoan_thanh' && t.completed_at && new Date(t.completed_at) < cutoff) continue
      g[b].push(t)
    }
    for (const k of Object.keys(g) as MyBucket[]) g[k].sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))
    g.da_hoan_thanh.reverse()
    return g
  }, [mine])

  const todoCount = TODO_GROUPS.reduce((n, s) => n + grouped[s.key].length, 0)
  const urgent = grouped.qua_han.length + grouped.can_chinh_sua.length

  const update = async (t: Task, patch: Patch) => {
    const { error } = await db().from('tasks').update(patch).eq('id', t.id)
    if (error) return toast.error(error)
    invalidate(t.id)
    toast.ok('Đã cập nhật')
  }

  if (tasksQ.isLoading || isLoading) return <Loading />
  if (tasksQ.error) return <ErrorBox error={tasksQ.error} onRetry={() => tasksQ.refetch()} />

  const card = (t: Task) => (
    <MyTaskCard key={t.id} task={t} onStart={() => update(t, { status: 'dang_thuc_hien' })} onSubmit={() => setSubmitting(t)} onMenu={() => setMenu(t)} />
  )
  const tabs: [Tab, string, number][] = [
    ['todo', 'Cần làm', todoCount],
    ['review', 'Chờ duyệt', grouped.cho_duyet.length],
    ['done', 'Đã xong', grouped.da_hoan_thanh.length],
  ]

  return (
    <>
      <PageHeader title="Công việc của tôi" subtitle={`Xin chào ${me.full_name.split(' ').slice(-1)[0]}, đây là những việc bạn đang phụ trách.`} />

      {/* Chỉ số tháng: gọn trong 1 dòng, chi tiết ở trang hiệu suất */}
      <Link to={`/nhan-vien/${me.id}`} className="card mb-4 flex items-center gap-3 px-4 py-3 hover:bg-[#fcfaf7]">
        <span className="text-xs font-medium text-ink-muted">Tháng này</span>
        <span className="num flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-0.5 text-sm">
          <span>
            <b>{fmtPct(stat.completionRate)}</b> <span className="text-ink-muted">hoàn thành</span>
          </span>
          <span>
            <b>{fmtPct(stat.onTimeOfDue)}</b> <span className="text-ink-muted">đúng hạn</span>
          </span>
          {stat.qualityAvg != null && (
            <span>
              <b>{stat.qualityAvg}/5</b> <span className="text-ink-muted">chất lượng</span>
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-muted" />
      </Link>

      {brands.length > 1 && (
        <div className="mb-4">
          <BrandChips brands={brands} value={brandId} onChange={setBrandId} />
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-sunken p-1" role="tablist">
        {tabs.map(([k, l, n]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={clsx('flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-sm', tab === k ? 'bg-surface font-semibold shadow-sm' : 'text-ink-soft')}
          >
            {l}
            <span className={clsx('num rounded-full px-1.5 text-xs', k === 'todo' && urgent ? 'bg-danger text-white' : 'bg-line/70 text-ink-soft')}>{n}</span>
          </button>
        ))}
      </div>

      {mine.length === 0 ? (
        <div className="card">
          <EmptyState title="Bạn chưa được giao việc nào" hint="Khi quản lý giao việc, công việc sẽ xuất hiện ở đây và bạn nhận được thông báo." />
        </div>
      ) : tab === 'todo' ? (
        todoCount === 0 ? (
          <div className="card">
            <EmptyState title="Không còn việc cần làm" hint="Tuyệt vời! Việc mới được giao sẽ hiện ở đây." />
          </div>
        ) : (
          <div className="space-y-5">
            {TODO_GROUPS.map((s) => {
              const list = grouped[s.key]
              if (!list.length) return null
              const later = s.key === 'khac'
              return (
                <section key={s.key}>
                  {later ? (
                    <button onClick={() => setShowLater((v) => !v)} className="mb-2 flex min-h-9 items-center gap-1.5 px-1 text-sm font-semibold text-ink-soft">
                      <ChevronDown className={clsx('size-4 transition', !showLater && '-rotate-90')} />
                      {s.label} <span className="num font-normal text-ink-muted">{list.length}</span>
                    </button>
                  ) : (
                    <h2 className={clsx('mb-2 px-1 text-sm font-semibold', s.tone)}>
                      {s.label} <span className="num font-normal text-ink-muted">{list.length}</span>
                    </h2>
                  )}
                  {(!later || showLater) && <div className="card divide-y divide-line overflow-hidden">{list.map(card)}</div>}
                </section>
              )
            })}
          </div>
        )
      ) : (
        <TaskListCard tasks={tab === 'review' ? grouped.cho_duyet : grouped.da_hoan_thanh} render={card} empty={tab === 'review' ? 'Không có việc đang chờ duyệt' : 'Chưa có việc hoàn thành trong 30 ngày qua'} />
      )}

      {menu && (
        <TaskQuickSheet
          task={menu}
          onClose={() => setMenu(null)}
          onUpdate={(p) => update(menu, p)}
          onNote={(kind) => setNoting({ task: menu, kind })}
        />
      )}
      {submitting && <SubmitModal task={submitting} onClose={() => setSubmitting(null)} />}
      {noting && <NoteModal task={noting.task} initialKind={noting.kind} onClose={() => setNoting(null)} />}
    </>
  )
}

function TaskListCard({ tasks, render, empty }: { tasks: Task[]; render: (t: Task) => ReactNode; empty: string }) {
  if (!tasks.length)
    return (
      <div className="card">
        <EmptyState title={empty} />
      </div>
    )
  return <div className="card divide-y divide-line overflow-hidden">{tasks.map(render)}</div>
}

/** Một việc: chạm để mở chi tiết; 1 nút hành động chính + menu "⋯" cho thao tác phụ */
function MyTaskCard({ task, onStart, onSubmit, onMenu }: { task: Task; onStart: () => void; onSubmit: () => void; onMenu: () => void }) {
  const { brandById } = useLookups()
  const brand = brandById.get(task.brand_id)
  const editable = EMPLOYEE_EDITABLE_FROM.includes(task.status)
  const progress = effectiveProgress(task)
  const urgentPriority = task.priority === 'cao' || task.priority === 'khan_cap'
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2">
        <Link to={`/cong-viec/${task.id}`} className="min-w-0 flex-1 py-0.5">
          <span className="flex items-start gap-2">
            <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', brand ? BRAND_STYLE[brand.color]?.bg : 'bg-line')} />
            <span className="min-w-0">
              <span className="line-clamp-2 text-[15px] leading-snug font-medium">{task.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                <span>{brand?.name}</span>
                <span aria-hidden>·</span>
                <DueText task={task} />
                {urgentPriority && task.status !== 'hoan_thanh' && (
                  <span className={task.priority === 'khan_cap' ? 'font-medium text-danger' : 'font-medium text-warn'}>{PRIORITY_LABEL[task.priority]}</span>
                )}
                {task.status === 'cho_phan_hoi' && <span className="text-warn">{STATUS_LABEL[task.status]}</span>}
                {task.is_blocked && (
                  <span className="inline-flex items-center gap-0.5 text-danger">
                    <AlertOctagon className="size-3.5" /> Vướng mắc
                  </span>
                )}
                {task.is_demo && <DemoTag />}
              </span>
            </span>
          </span>
        </Link>
        {editable && (
          <button onClick={onMenu} className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-sunken" aria-label="Cập nhật nhanh">
            <MoreHorizontal className="size-5" />
          </button>
        )}
      </div>
      {editable && (
        <div className="mt-2.5 flex items-center gap-3 pl-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ProgressBar value={progress} className="max-w-40" />
            <span className="num text-xs text-ink-muted">{progress}%</span>
          </div>
          {task.status === 'chua_bat_dau' ? (
            <Button size="sm" icon={<Play className="size-3.5" />} onClick={onStart}>
              Bắt đầu
            </Button>
          ) : (
            SUBMITTABLE_FROM.includes(task.status) && (
              <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} onClick={onSubmit}>
                {task.requires_approval ? 'Nộp duyệt' : 'Hoàn thành'}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}

/** Cập nhật nhanh không cần mở trang chi tiết: tiến độ, trạng thái, ghi chú, vướng mắc */
function TaskQuickSheet({
  task,
  onClose,
  onUpdate,
  onNote,
}: {
  task: Task
  onClose: () => void
  onUpdate: (p: Patch) => void
  onNote: (kind: CommentKind) => void
}) {
  const navigate = useNavigate()
  const current = Math.round(task.progress / 10) * 10
  return (
    <ActionSheet
      title={task.title}
      onClose={onClose}
      actions={[
        { label: 'Ghi chú tiến độ', hint: 'Báo quản lý hôm nay đã làm được gì', icon: <MessageSquarePlus className="size-5" />, onClick: () => onNote('tien_do') },
        { label: 'Báo vướng mắc', hint: 'Quản lý sẽ thấy ngay trên Tổng quan', icon: <AlertOctagon className="size-5" />, onClick: () => onNote('vuong_mac'), danger: true },
        { label: 'Mở chi tiết công việc', icon: <ExternalLink className="size-5" />, onClick: () => navigate(`/cong-viec/${task.id}`) },
      ]}
    >
      <p className="label">Tiến độ</p>
      <div className="mb-4 grid grid-cols-5 gap-1.5">
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              onUpdate({ progress: v, ...(task.status === 'chua_bat_dau' && v > 0 ? { status: 'dang_thuc_hien' as TaskStatus } : {}) })
              onClose()
            }}
            className={clsx('num min-h-11 rounded-xl text-sm', current === v ? 'bg-ink font-semibold text-white' : 'bg-sunken hover:bg-line')}
          >
            {v}%
          </button>
        ))}
      </div>
      <p className="label">Trạng thái</p>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {EMPLOYEE_SETTABLE_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              if (s !== task.status) onUpdate({ status: s })
              onClose()
            }}
            className={clsx('min-h-11 rounded-xl px-1 text-xs sm:text-sm', task.status === s ? 'bg-ink font-semibold text-white' : 'bg-sunken hover:bg-line')}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="-mx-5 mb-2 border-t border-line" />
    </ActionSheet>
  )
}

export function NoteModal({ task, onClose, initialKind = 'tien_do' }: { task: Task; onClose: () => void; initialKind?: CommentKind }) {
  const me = useMe()
  const [kind, setKind] = useState<CommentKind>(initialKind)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const invalidate = useInvalidateTask()
  const save = async () => {
    if (!body.trim()) return toast.error('Vui lòng nhập nội dung')
    setSaving(true)
    try {
      const { error } = await db().from('task_comments').insert({ task_id: task.id, author_id: me.id, kind, body: body.trim() })
      if (error) throw error
      if (kind === 'vuong_mac') {
        const { error: e2 } = await db().from('tasks').update({ is_blocked: true, blocker_note: body.trim() }).eq('id', task.id)
        if (e2) throw e2
      }
      invalidate(task.id)
      toast.ok(kind === 'vuong_mac' ? 'Đã báo vướng mắc cho quản lý' : 'Đã ghi chú tiến độ')
      onClose()
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Cập nhật nhanh"
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant={kind === 'vuong_mac' ? 'danger' : 'primary'} loading={saving} onClick={save}>
            {kind === 'vuong_mac' ? 'Báo vướng mắc' : 'Lưu ghi chú'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm font-medium">{task.title}</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {(
          [
            ['tien_do', 'Ghi chú tiến độ'],
            ['vuong_mac', 'Báo vướng mắc'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={clsx('min-h-11 rounded-xl border px-3 py-2 text-sm', kind === k ? (k === 'vuong_mac' ? 'border-danger bg-danger-soft text-danger' : 'border-ink bg-sunken') : 'border-line-strong')}
          >
            {l}
          </button>
        ))}
      </div>
      <Field label="Nội dung">
        <textarea
          autoFocus
          className="input min-h-24"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === 'vuong_mac' ? 'VD: Chưa nhận được ảnh sản phẩm từ xưởng…' : 'VD: Đã quay xong 2/3 video…'}
        />
      </Field>
    </Modal>
  )
}
