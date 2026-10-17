import clsx from 'clsx'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBrandMembers, useInvalidateTask, useLookups } from '../hooks/queries'
import { PRIORITY_LABEL, PRIORITY_STYLE, WEIGHT_OPTIONS } from '../lib/constants'
import { dateKeyFromIso, dueAtFromDateKey } from '../lib/dates'
import { db } from '../lib/backend'
import type { LinkItem, Task, TaskPriority } from '../lib/types'
import { Avatar, Button, Field, Modal, useToast } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  task?: Task
  defaultBrandId?: string
  defaultProjectId?: string
}

export function TaskFormModal({ open, onClose, task, defaultBrandId, defaultProjectId }: Props) {
  const { brands, projects, profiles } = useLookups()
  const members = useBrandMembers()
  const toast = useToast()
  const invalidate = useInvalidateTask()
  const navigate = useNavigate()
  const editing = Boolean(task)

  const [brandId, setBrandId] = useState(task?.brand_id ?? defaultBrandId ?? '')
  const [projectId, setProjectId] = useState(task?.project_id ?? defaultProjectId ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assignees, setAssignees] = useState<string[]>(task?.task_assignments?.map((a) => a.user_id) ?? [])
  const [primary, setPrimary] = useState(task?.primary_owner_id ?? '')
  const [startDate, setStartDate] = useState(task?.start_date ?? '')
  const [dueDate, setDueDate] = useState(dateKeyFromIso(task?.due_at))
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'trung_binh')
  const [weight, setWeight] = useState<number>(task?.weight ?? 1)
  const [hours, setHours] = useState(task?.estimated_hours?.toString() ?? '')
  const [requiresApproval, setRequiresApproval] = useState(task?.requires_approval ?? true)
  const [links, setLinks] = useState<LinkItem[]>(task?.links ?? [])
  const [checklist, setChecklist] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const brandProjects = projects.filter((p) => p.brand_id === brandId && p.status !== 'da_huy')
  const staff = profiles.filter((p) => p.is_active)
  const memberSet = useMemo(
    () => new Set((members.data ?? []).filter((m) => m.brand_id === brandId).map((m) => m.user_id)),
    [members.data, brandId],
  )
  const sortedStaff = [...staff].sort((a, b) => Number(memberSet.has(b.id)) - Number(memberSet.has(a.id)))

  const toggleAssignee = (id: string) => {
    const next = assignees.includes(id) ? assignees.filter((x) => x !== id) : [...assignees, id]
    setAssignees(next)
    if (!primary || !next.includes(primary)) setPrimary(next[0] ?? '')
  }

  const save = async (openAfter = false) => {
    setError('')
    if (!brandId) return setError('Vui lòng chọn thương hiệu.')
    if (!title.trim()) return setError('Vui lòng nhập tên công việc.')
    if (startDate && dueDate && dueDate < startDate) return setError('Hạn chót không được trước ngày bắt đầu.')
    const hoursNum = hours === '' ? null : Number(hours.replace(',', '.'))
    if (hoursNum != null && (Number.isNaN(hoursNum) || hoursNum < 0)) return setError('Số giờ ước tính không hợp lệ.')
    setSaving(true)
    try {
      const payload = {
        brand_id: brandId,
        project_id: projectId || null,
        title: title.trim(),
        description: description.trim() || null,
        primary_owner_id: primary || null,
        start_date: startDate || null,
        due_at: dueDate ? dueAtFromDateKey(dueDate) : null,
        priority,
        weight,
        estimated_hours: hoursNum,
        requires_approval: requiresApproval,
        links: links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() })),
      }
      let id = task?.id
      if (editing && id) {
        // Chỉ gửi hạn chót khi thay đổi để nhật ký không ghi nhầm
        const p: Record<string, unknown> = { ...payload }
        if (dateKeyFromIso(task!.due_at) === dueDate) delete p.due_at
        const { error: e } = await db().from('tasks').update(p).eq('id', id)
        if (e) throw e
      } else {
        const { data, error: e } = await db().from('tasks').insert(payload).select('id').single()
        if (e) throw e
        id = (data as { id: string }).id
      }
      const { error: ea } = await db().rpc('set_task_assignees', { p_task: id, p_users: assignees })
      if (ea) throw ea
      const items = checklist.map((c) => c.trim()).filter(Boolean)
      if (!editing && items.length) {
        const { error: ec } = await db()
          .from('checklist_items')
          .insert(items.map((t, i) => ({ task_id: id, title: t, sort_order: i + 1 })))
        if (ec) throw ec
      }
      invalidate(id)
      toast.ok(editing ? 'Đã lưu thay đổi' : 'Đã tạo công việc')
      onClose()
      if (openAfter && id) navigate(`/cong-viec/${id}`)
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? 'Sửa công việc' : 'Tạo công việc mới'}
      footer={
        <>
          {error && <p className="mr-auto self-center text-sm text-danger">{error}</p>}
          <Button onClick={onClose}>Hủy</Button>
          {!editing && (
            <Button onClick={() => save(true)} loading={saving}>
              Tạo và mở
            </Button>
          )}
          <Button variant="primary" onClick={() => save(false)} loading={saving}>
            {editing ? 'Lưu thay đổi' : 'Tạo công việc'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên công việc *" className="sm:col-span-2">
          <input autoFocus className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Quay 3 video TikTok tuần này" />
        </Field>
        <Field label="Thương hiệu *">
          <select
            className="input"
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value)
              setProjectId('')
            }}
          >
            <option value="">— Chọn thương hiệu —</option>
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
            {brandProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Hướng dẫn chi tiết" className="sm:col-span-2">
          <textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả yêu cầu, tiêu chí hoàn thành…" />
        </Field>

        <div className="sm:col-span-2">
          <span className="label">Giao cho (có thể chọn nhiều người)</span>
          <div className="flex flex-wrap gap-2">
            {sortedStaff.map((p) => {
              const on = assignees.includes(p.id)
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => toggleAssignee(p.id)}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm transition-colors',
                    on ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-sunken',
                  )}
                >
                  <Avatar profile={p} size={20} />
                  {p.full_name}
                  {brandId && !memberSet.has(p.id) && <span className={clsx('text-[10px]', on ? 'text-white/70' : 'text-ink-muted')}>(khác TH)</span>}
                </button>
              )
            })}
          </div>
        </div>
        <Field label="Người phụ trách chính">
          <select className="input" value={primary} onChange={(e) => setPrimary(e.target.value)} disabled={!assignees.length}>
            <option value="">— Chưa chọn —</option>
            {assignees.map((id) => (
              <option key={id} value={id}>
                {profiles.find((p) => p.id === id)?.full_name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="label">Độ ưu tiên</span>
          <div className="grid grid-cols-4 gap-1">
            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setPriority(p)}
                className={clsx(
                  'rounded-lg px-1 py-2 text-xs font-medium transition',
                  priority === p ? clsx(PRIORITY_STYLE[p], 'ring-2 ring-current') : 'bg-sunken text-ink-soft hover:bg-line',
                )}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Ngày bắt đầu">
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Hạn chót" hint="Tính đến 23:59 ngày đã chọn (giờ Việt Nam)">
          <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Độ phức tạp (trọng số)">
          <select className="input" value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
            {WEIGHT_OPTIONS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Giờ làm ước tính">
          <input className="input" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="VD: 4" />
        </Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#2b2724]" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
          <span>
            Cần quản lý duyệt trước khi tính là hoàn thành
            <span className="block text-xs text-ink-muted">Bỏ chọn nếu việc đơn giản, nhân viên nộp là hoàn thành ngay.</span>
          </span>
        </label>

        <div className="sm:col-span-2">
          <span className="label">Liên kết liên quan</span>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input className="input w-1/3" placeholder="Tên" value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className="input" placeholder="https://…" value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <Button variant="ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Xóa liên kết" icon={<Trash2 className="size-4" />} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setLinks([...links, { label: '', url: '' }])}>
              Thêm liên kết
            </Button>
          </div>
        </div>

        {!editing && (
          <div className="sm:col-span-2">
            <span className="label">Danh sách việc cần làm (checklist)</span>
            <div className="space-y-2">
              {checklist.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input className="input" value={c} placeholder={`Bước ${i + 1}`} onChange={(e) => setChecklist(checklist.map((x, j) => (j === i ? e.target.value : x)))} />
                  <Button variant="ghost" onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} aria-label="Xóa bước" icon={<Trash2 className="size-4" />} />
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setChecklist([...checklist, ''])}>
                Thêm bước
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
