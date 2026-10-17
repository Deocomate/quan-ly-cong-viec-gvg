import clsx from 'clsx'
import { ChevronDown, MessageSquarePlus, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TaskRow } from '../components/TaskList'
import { Button, EmptyState, ErrorBox, Field, fmtPct, Loading, Modal, PageHeader, StatCard, useToast } from '../components/ui'
import { SubmitModal } from '../components/WorkflowModals'
import { useMe } from '../contexts/AuthContext'
import { useInvalidateTask, useLookups, useTasks } from '../hooks/queries'
import { EMPLOYEE_EDITABLE_FROM, EMPLOYEE_SETTABLE_STATUSES, STATUS_LABEL, SUBMITTABLE_FROM } from '../lib/constants'
import { addDays, presetRange, vnStartOfDay } from '../lib/dates'
import { employeeStat, isAssignedTo, myBucket, type MyBucket } from '../lib/metrics'
import { db } from '../lib/backend'
import type { CommentKind, Task, TaskStatus } from '../lib/types'

const SECTIONS: { key: MyBucket; label: string; hint: string; tone: string }[] = [
  { key: 'qua_han', label: 'Quá hạn', hint: 'Đã qua hạn chót, chưa nộp', tone: 'text-danger' },
  { key: 'hom_nay', label: 'Việc hôm nay', hint: 'Hạn chót hôm nay', tone: 'text-warn' },
  { key: 'can_chinh_sua', label: 'Cần chỉnh sửa', hint: 'Quản lý yêu cầu sửa lại', tone: 'text-danger' },
  { key: 'sap_den_han', label: 'Sắp đến hạn', hint: 'Trong 3 ngày tới', tone: 'text-ink' },
  { key: 'dang_thuc_hien', label: 'Đang thực hiện', hint: 'Đang làm hoặc chờ phản hồi', tone: 'text-info' },
  { key: 'khac', label: 'Chưa đến lượt', hint: 'Chưa bắt đầu, tạm dừng hoặc hạn còn xa', tone: 'text-ink-soft' },
  { key: 'cho_duyet', label: 'Chờ duyệt', hint: 'Đã nộp, chờ quản lý duyệt', tone: 'text-violet' },
  { key: 'da_hoan_thanh', label: 'Đã hoàn thành', hint: '30 ngày gần nhất', tone: 'text-ok' },
]

export function MyWorkPage() {
  const me = useMe()
  const tasksQ = useTasks()
  const { brands, isLoading } = useLookups()
  const [brandId, setBrandId] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ da_hoan_thanh: true, khac: true })
  const [submitting, setSubmitting] = useState<Task | null>(null)
  const [noting, setNoting] = useState<Task | null>(null)
  const toast = useToast()
  const invalidate = useInvalidateTask()

  const mine = useMemo(
    () => (tasksQ.data ?? []).filter((t) => isAssignedTo(t, me.id) && t.status !== 'da_huy' && (!brandId || t.brand_id === brandId)),
    [tasksQ.data, me.id, brandId],
  )
  const month = presetRange('month')
  const stat = employeeStat(tasksQ.data ?? [], me.id, month)

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

  const update = async (t: Task, patch: Partial<Pick<Task, 'status' | 'progress'>>) => {
    const { error } = await db().from('tasks').update(patch).eq('id', t.id)
    if (error) return toast.error(error)
    invalidate(t.id)
    toast.ok('Đã cập nhật')
  }

  if (tasksQ.isLoading || isLoading) return <Loading />
  if (tasksQ.error) return <ErrorBox error={tasksQ.error} onRetry={() => tasksQ.refetch()} />

  return (
    <>
      <PageHeader
        title="Công việc của tôi"
        subtitle={`Xin chào ${me.full_name.split(' ').slice(-1)[0]}, đây là những việc bạn đang phụ trách.`}
        actions={
          <select className="input w-auto" value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Lọc thương hiệu">
            <option value="">Tất cả thương hiệu</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Hoàn thành việc đến hạn" value={fmtPct(stat.completionRate)} hint={`${stat.completedOfDue}/${stat.dueInPeriod} · tháng này`} tone="ok" />
        <StatCard label="Đúng hạn" value={fmtPct(stat.onTimeOfDue)} hint="trên việc đến hạn tháng này" tone="warn" />
        <StatCard label="Quá hạn hiện tại" value={stat.overdueNow} hint={stat.maxOverdueDays ? `Lâu nhất ${stat.maxOverdueDays} ngày` : 'Tuyệt vời!'} tone="danger" />
        <StatCard label="Chất lượng TB" value={stat.qualityAvg != null ? `${stat.qualityAvg}/5` : '—'} hint={`${stat.qualityCount} việc được chấm`} tone="violet" />
        <StatCard label="Đang phụ trách" value={stat.activeNow} hint={`${stat.activeHours.toLocaleString('vi-VN')} giờ ước tính`} tone="info" />
      </div>

      {mine.length === 0 ? (
        <div className="card">
          <EmptyState title="Bạn chưa được giao việc nào" hint="Khi quản lý giao việc, công việc sẽ xuất hiện ở đây và bạn nhận được thông báo." />
        </div>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map((s) => {
            const list = grouped[s.key]
            if (!list.length) return null
            const isCollapsed = collapsed[s.key]
            return (
              <section key={s.key} className="card overflow-hidden">
                <button
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-[#fcfaf7]"
                  onClick={() => setCollapsed((c) => ({ ...c, [s.key]: !c[s.key] }))}
                >
                  <ChevronDown className={clsx('size-4 text-ink-muted transition', isCollapsed && '-rotate-90')} />
                  <span className={clsx('font-semibold', s.tone)}>{s.label}</span>
                  <span className="num rounded-full bg-sunken px-2 text-xs">{list.length}</span>
                  <span className="hidden text-xs text-ink-muted sm:inline">· {s.hint}</span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-line border-t border-line">
                    {list.map((t) => (
                      <div key={t.id}>
                        <TaskRow task={t} />
                        <QuickBar task={t} onUpdate={update} onSubmit={() => setSubmitting(t)} onNote={() => setNoting(t)} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {submitting && <SubmitModal task={submitting} onClose={() => setSubmitting(null)} />}
      {noting && <NoteModal task={noting} onClose={() => setNoting(null)} />}
    </>
  )
}

function QuickBar({
  task,
  onUpdate,
  onSubmit,
  onNote,
}: {
  task: Task
  onUpdate: (t: Task, p: Partial<Pick<Task, 'status' | 'progress'>>) => void
  onSubmit: () => void
  onNote: () => void
}) {
  const editable = EMPLOYEE_EDITABLE_FROM.includes(task.status)
  if (!editable) return null
  return (
    <div className="flex flex-wrap items-center gap-2 bg-[#fcfaf7] px-4 pb-3 pl-9 text-xs">
      <select
        className="input w-auto py-1 text-xs"
        value={EMPLOYEE_SETTABLE_STATUSES.includes(task.status) ? task.status : ''}
        onChange={(e) => onUpdate(task, { status: e.target.value as TaskStatus })}
        aria-label="Đổi trạng thái"
      >
        {!EMPLOYEE_SETTABLE_STATUSES.includes(task.status) && <option value="">{STATUS_LABEL[task.status]}</option>}
        {EMPLOYEE_SETTABLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5">
        <span className="text-ink-muted">Tiến độ</span>
        <select
          className="input w-auto py-1 text-xs"
          value={Math.round(task.progress / 10) * 10}
          onChange={(e) => onUpdate(task, { progress: Number(e.target.value), ...(task.status === 'chua_bat_dau' ? { status: 'dang_thuc_hien' as TaskStatus } : {}) })}
        >
          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
            <option key={v} value={v}>
              {v}%
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" variant="ghost" icon={<MessageSquarePlus className="size-3.5" />} onClick={onNote}>
        Ghi chú / vướng mắc
      </Button>
      {SUBMITTABLE_FROM.includes(task.status) && (
        <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} onClick={onSubmit} className="ml-auto">
          {task.requires_approval ? 'Nộp duyệt' : 'Hoàn thành'}
        </Button>
      )}
    </div>
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
            ['tien_do', 'Ghi chú tiến độ hôm nay'],
            ['vuong_mac', 'Báo vướng mắc / chậm trễ'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={clsx('rounded-xl border px-3 py-2 text-sm', kind === k ? (k === 'vuong_mac' ? 'border-danger bg-danger-soft text-danger' : 'border-ink bg-sunken') : 'border-line-strong')}
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
