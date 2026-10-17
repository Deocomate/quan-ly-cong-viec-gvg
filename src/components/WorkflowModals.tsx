import clsx from 'clsx'
import { Star } from 'lucide-react'
import { useState } from 'react'
import { useInvalidateTask } from '../hooks/queries'
import { db } from '../lib/backend'
import type { Task } from '../lib/types'
import { Button, Field, Modal, useToast } from './ui'

/** Nhân viên nộp kết quả để quản lý duyệt */
export function SubmitModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [evidence, setEvidence] = useState(task.completion_evidence ?? '')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const invalidate = useInvalidateTask()
  const submit = async () => {
    setSaving(true)
    const { error } = await db().rpc('submit_task', { p_task: task.id, p_evidence: evidence })
    setSaving(false)
    if (error) return toast.error(error)
    invalidate(task.id)
    toast.ok(task.requires_approval ? 'Đã nộp, đang chờ quản lý duyệt' : 'Đã hoàn thành công việc')
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={task.requires_approval ? 'Nộp kết quả để duyệt' : 'Đánh dấu hoàn thành'}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {task.requires_approval ? 'Nộp duyệt' : 'Hoàn thành'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-soft">
        <b className="text-ink">{task.title}</b>
        <br />
        Thời điểm nộp được ghi nhận để tính đúng hạn — việc quản lý duyệt chậm không bị tính là bạn trễ.
      </p>
      <Field label="Bằng chứng hoàn thành" hint="Mô tả kết quả, dán link sản phẩm (Drive, TikTok, Facebook…). Tệp đính kèm tải ở mục Tệp của công việc.">
        <textarea className="input min-h-28" value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="VD: Đã đăng 3 video, link: https://…" />
      </Field>
    </Modal>
  )
}

/** Quản trị viên duyệt hoặc yêu cầu chỉnh sửa */
export function ReviewModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const [mode, setMode] = useState<'approve' | 'revise'>('approve')
  const [quality, setQuality] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const invalidate = useInvalidateTask()
  const submit = async () => {
    if (mode === 'revise' && !feedback.trim()) return toast.error('Vui lòng ghi rõ nội dung cần chỉnh sửa')
    setSaving(true)
    const { error } = await db().rpc('review_task', {
      p_task: task.id,
      p_approve: mode === 'approve',
      p_quality: mode === 'approve' ? quality : null,
      p_feedback: feedback,
    })
    setSaving(false)
    if (error) return toast.error(error)
    invalidate(task.id)
    toast.ok(mode === 'approve' ? 'Đã duyệt công việc' : 'Đã gửi yêu cầu chỉnh sửa')
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Duyệt công việc"
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant={mode === 'approve' ? 'success' : 'danger'} loading={saving} onClick={submit}>
            {mode === 'approve' ? 'Duyệt' : 'Yêu cầu chỉnh sửa'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm font-medium">{task.title}</p>
      {task.completion_evidence && (
        <div className="mb-4 rounded-xl bg-sunken p-3 text-sm whitespace-pre-wrap">
          <p className="mb-1 text-xs font-medium text-ink-soft">Bằng chứng nhân viên gửi</p>
          {task.completion_evidence}
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(['approve', 'revise'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={clsx(
              'rounded-xl border px-3 py-2.5 text-sm font-medium',
              mode === m ? (m === 'approve' ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger') : 'border-line-strong',
            )}
          >
            {m === 'approve' ? 'Đạt — Duyệt' : 'Chưa đạt — Cần sửa'}
          </button>
        ))}
      </div>
      {mode === 'approve' && (
        <div className="mb-4">
          <span className="label">Chấm chất lượng (không bắt buộc, tách riêng khỏi chỉ số năng suất)</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setQuality(quality === n ? null : n)} aria-label={`${n} điểm`} className="p-1">
                <Star className={clsx('size-7', quality && n <= quality ? 'fill-[#d9a227] text-[#d9a227]' : 'text-line-strong')} />
              </button>
            ))}
            <span className="ml-2 text-sm text-ink-soft">{quality ? `${quality}/5` : 'Chưa chấm'}</span>
          </div>
        </div>
      )}
      <Field label={mode === 'approve' ? 'Nhận xét (không bắt buộc)' : 'Nội dung cần chỉnh sửa *'}>
        <textarea className="input min-h-24" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </Field>
    </Modal>
  )
}
