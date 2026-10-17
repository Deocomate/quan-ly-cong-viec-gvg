import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { qk, useLookups } from '../hooks/queries'
import { PROJECT_STATUS_LABEL } from '../lib/constants'
import { db } from '../lib/backend'
import type { LinkItem, Project, ProjectStatus } from '../lib/types'
import { Button, Field, Modal, useToast } from './ui'

export function ProjectFormModal({ project, defaultBrandId, onClose }: { project?: Project; defaultBrandId?: string; onClose: () => void }) {
  const { brands, profiles } = useLookups()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [brandId, setBrandId] = useState(project?.brand_id ?? defaultBrandId ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [goals, setGoals] = useState(project?.goals ?? '')
  const [notes, setNotes] = useState(project?.notes ?? '')
  const [owner, setOwner] = useState(project?.owner_id ?? '')
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'dang_thuc_hien')
  const [start, setStart] = useState(project?.start_date ?? '')
  const [due, setDue] = useState(project?.due_date ?? '')
  const [links, setLinks] = useState<LinkItem[]>(project?.links ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setError('')
    if (!brandId) return setError('Vui lòng chọn thương hiệu.')
    if (!name.trim()) return setError('Vui lòng nhập tên dự án.')
    if (start && due && due < start) return setError('Ngày kết thúc không được trước ngày bắt đầu.')
    setSaving(true)
    const payload = {
      brand_id: brandId,
      name: name.trim(),
      description: description.trim() || null,
      goals: goals.trim() || null,
      notes: notes.trim() || null,
      owner_id: owner || null,
      status,
      start_date: start || null,
      due_date: due || null,
      links: links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() })),
    }
    const res = project
      ? await db().from('projects').update(payload).eq('id', project.id).select('id').single()
      : await db().from('projects').insert(payload).select('id').single()
    setSaving(false)
    if (res.error) return toast.error(res.error)
    qc.invalidateQueries({ queryKey: qk.projects })
    toast.ok(project ? 'Đã lưu dự án' : 'Đã tạo dự án')
    onClose()
    if (!project) navigate(`/du-an/${(res.data as { id: string }).id}`)
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={project ? 'Sửa dự án' : 'Tạo dự án / chiến dịch'}
      footer={
        <>
          {error && <p className="mr-auto self-center text-sm text-danger">{error}</p>}
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {project ? 'Lưu' : 'Tạo dự án'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên dự án *" className="sm:col-span-2">
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Chiến dịch Livestream Tết" />
        </Field>
        <Field label="Thương hiệu *">
          <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={Boolean(project)}>
            <option value="">— Chọn —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Người phụ trách dự án">
          <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">— Chưa chọn —</option>
            {profiles
              .filter((p) => p.is_active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Ngày bắt đầu">
          <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Hạn hoàn thành">
          <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Trạng thái">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mô tả" className="sm:col-span-2">
          <textarea className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Mục tiêu dự án" className="sm:col-span-2">
          <textarea className="input min-h-16" value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="VD: 20 video TikTok mỗi tháng" />
        </Field>
        <Field label="Ghi chú" className="sm:col-span-2">
          <textarea className="input min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Liên kết (thư mục Drive, tài liệu…)</span>
          <div className="space-y-2">
            {links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input className="input w-1/3" placeholder="Tên" value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <input className="input" placeholder="https://…" value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <Button variant="ghost" aria-label="Xóa liên kết" icon={<Trash2 className="size-4" />} onClick={() => setLinks(links.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setLinks([...links, { label: '', url: '' }])}>
              Thêm liên kết
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
