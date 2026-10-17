import clsx from 'clsx'
import { Mail, Pencil, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { WorkloadChart } from './Phase2Pages'
import { useQueryClient } from '@tanstack/react-query'
import { Avatar, Badge, Button, DemoTag, EmptyState, ErrorBox, Field, fmtNum, Loading, Modal, PageHeader, useConfirm, useToast } from '../components/ui'
import { useAuth, useMe } from '../contexts/AuthContext'
import { qk, useBrandMembers, useInvitations, useLookups, useTasks } from '../hooks/queries'
import { BRAND_STYLE } from '../lib/constants'
import { fmtDate, presetRange } from '../lib/dates'
import { employeeStat } from '../lib/metrics'
import { api, ApiUnavailable } from '../lib/backend'
import { db } from '../lib/backend'
import type { Invitation, Profile, UserRole } from '../lib/types'

export function EmployeesPage() {
  const { profiles, brands, brandById, isLoading, error } = useLookups()
  const members = useBrandMembers()
  const tasksQ = useTasks()
  const { isAdmin } = useAuth()
  const me = useMe()
  const invitations = useInvitations(isAdmin)
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()

  if (isLoading || tasksQ.isLoading) return <Loading />
  if (error || tasksQ.error) return <ErrorBox error={error || tasksQ.error} />

  const list = profiles.filter((p) => showInactive || p.is_active)
  const pending = (invitations.data ?? []).filter((i) => !i.accepted_at)
  const month = presetRange('month')
  const tasks = tasksQ.data ?? []
  const hours = profiles.filter((p) => p.is_active && p.role === 'employee').map((p) => employeeStat(tasks, p.id, month).activeHours)
  const avgHours = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0

  const copyInvite = (i: Invitation) => {
    navigator.clipboard?.writeText(`${window.location.origin}/dang-ky?email=${encodeURIComponent(i.email)}&invite=${encodeURIComponent(i.token)}`)
    toast.ok('Đã sao chép liên kết đăng ký')
  }

  const resendInvite = async (email: string) => {
    try {
      await api('/api/invitations/send', { body: { email } })
      toast.ok(`Đã gửi email mời tới ${email}`)
    } catch (e) {
      toast.error(e instanceof ApiUnavailable ? 'Máy chủ chưa cấu hình gửi email (SMTP). Hãy gửi đường dẫn đăng ký thủ công.' : e)
    }
  }

  const cancelInvite = async (email: string) => {
    if (!(await confirm({ title: 'Hủy lời mời?', message: `Lời mời gửi ${email} sẽ bị hủy. Nếu người này đăng ký sau đó, tài khoản sẽ không được kích hoạt.`, confirmLabel: 'Hủy lời mời', danger: true }))) return
    const { error: e } = await db().from('invitations').delete().eq('email', email)
    if (e) return toast.error(e)
    qc.invalidateQueries({ queryKey: qk.invitations })
    toast.ok('Đã hủy lời mời')
  }

  return (
    <>
      <PageHeader
        title="Nhân viên"
        subtitle="Danh sách thành viên, vai trò, thương hiệu phụ trách và khối lượng việc hiện tại."
        actions={
          isAdmin && (
            <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>
              Mời nhân viên
            </Button>
          )
        }
      />
      {isAdmin && (
        <label className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="accent-[#2b2724]" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Hiện cả tài khoản đã khóa / chưa kích hoạt
        </label>
      )}
      {isAdmin && <WorkloadChart />}
      <div className="card divide-y divide-line">
        {list.map((p) => {
          const s = employeeStat(tasks, p.id, month)
          const myBrands = (members.data ?? []).filter((m) => m.user_id === p.id).map((m) => brandById.get(m.brand_id))
          const load = avgHours > 0 ? s.activeHours / avgHours : 0
          return (
            <div key={p.id} className={clsx('flex flex-col gap-3 p-4 md:flex-row md:items-center', !p.is_active && 'opacity-60')}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar profile={p} size={40} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">
                    {isAdmin || p.id === me.id ? (
                      <Link to={`/nhan-vien/${p.id}`} className="hover:underline">
                        {p.full_name}
                      </Link>
                    ) : (
                      p.full_name
                    )}
                    {p.role === 'admin' && <Badge className="bg-ink text-white">Quản trị</Badge>}
                    {!p.is_active && <Badge className="bg-danger-soft text-danger">Chưa kích hoạt / đã khóa</Badge>}
                    {p.is_demo && <DemoTag />}
                  </p>
                  <p className="truncate text-sm text-ink-soft">{p.job_title ?? '—'}</p>
                  <p className="truncate text-xs text-ink-muted">{p.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 md:w-64">
                {myBrands.filter(Boolean).map((b) => (
                  <Badge key={b!.id} className={clsx(BRAND_STYLE[b!.color].soft, BRAND_STYLE[b!.color].text)}>
                    {b!.name}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-4 text-sm md:w-72">
                <div className="num">
                  <b>{s.activeNow}</b> <span className="text-ink-muted">việc mở</span>
                </div>
                <div className="num">
                  <b>{fmtNum(s.activeHours)}</b> <span className="text-ink-muted">giờ</span>
                </div>
                {p.is_active && p.role === 'employee' && (
                  <Badge className={load > 1.4 ? 'bg-danger-soft text-danger' : load < 0.6 ? 'bg-info-soft text-info' : 'bg-ok-soft text-ok'}>
                    {load > 1.4 ? 'Quá tải' : load < 0.6 ? 'Còn trống' : 'Cân bằng'}
                  </Badge>
                )}
              </div>
              {isAdmin && (
                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(p)}>
                  Sửa
                </Button>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        "Quá tải / Còn trống" so giờ ước tính của việc đang mở với mức trung bình của cả nhóm. Bảng phân bổ khối lượng chi tiết theo thương hiệu sẽ có ở Giai đoạn 2.
      </p>

      {isAdmin && pending.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-sm font-semibold text-ink-soft">Lời mời đang chờ ({pending.length})</h2>
          <div className="card divide-y divide-line">
            {pending.map((i) => (
              <div key={i.email} className="flex flex-wrap items-center gap-3 p-4">
                <Mail className="size-4 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {i.full_name} <span className="font-normal text-ink-muted">· {i.email}</span>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {i.role === 'admin' ? 'Quản trị viên' : (i.job_title ?? 'Nhân viên')} · mời ngày {fmtDate(i.created_at)} ·{' '}
                    {i.brand_ids.map((id) => brandById.get(id)?.name).filter(Boolean).join(', ') || 'chưa gán thương hiệu'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => copyInvite(i)}>
                  Sao chép liên kết
                </Button>
                <Button size="sm" variant="ghost" icon={<Mail className="size-3.5" />} onClick={() => resendInvite(i.email)}>
                  Gửi lại email
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" />} onClick={() => cancelInvite(i.email)}>
                  Hủy mời
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {list.length === 0 && <EmptyState title="Chưa có thành viên" />}
      {inviting && <InviteModal brands={brands} onClose={() => setInviting(false)} />}
      {editing && <EditEmployeeModal profile={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function BrandPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { brands } = useLookups()
  return (
    <div className="flex flex-wrap gap-2">
      {brands.map((b) => {
        const on = value.includes(b.id)
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== b.id) : [...value, b.id])}
            className={clsx('flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm', on ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-sunken')}
          >
            <span className={clsx('size-2 rounded-full', BRAND_STYLE[b.color].bg)} />
            {b.name}
          </button>
        )
      })}
    </div>
  )
}

function InviteModal({ onClose }: { brands: unknown[]; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [job, setJob] = useState('')
  const [role, setRole] = useState<UserRole>('employee')
  const [brandIds, setBrandIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<null | { mailed: boolean; reason?: string; link: string }>(null)
  const toast = useToast()
  const qc = useQueryClient()
  const me = useMe()

  const save = async () => {
    const e = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(e)) return toast.error('Email không hợp lệ')
    if (!name.trim()) return toast.error('Vui lòng nhập họ tên')
    setSaving(true)
    const { data: inv, error } = await db()
      .from('invitations')
      .insert({ email: e, full_name: name.trim(), job_title: job.trim() || null, role, brand_ids: brandIds, invited_by: me.id })
      .select('token')
      .single()
    if (error) {
      setSaving(false)
      return toast.error(error)
    }
    qc.invalidateQueries({ queryKey: qk.invitations })
    const link = `${window.location.origin}/dang-ky?email=${encodeURIComponent(e)}&invite=${encodeURIComponent(inv.token)}`
    try {
      await api('/api/invitations/send', { body: { email: e } })
      setDone({ mailed: true, link })
    } catch (err) {
      setDone({ mailed: false, link, reason: err instanceof ApiUnavailable ? undefined : err instanceof Error ? err.message : String(err) })
    }
    setSaving(false)
  }

  const link = done?.link ?? ''
  if (done)
    return (
      <Modal open onClose={onClose} title="Đã tạo lời mời" footer={<Button variant="primary" onClick={onClose}>Xong</Button>}>
        {done.mailed && <p className="mb-3 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">Đã gửi email mời tới {email.trim().toLowerCase()}.</p>}
        {done.reason && <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Lời mời đã tạo nhưng chưa gửi được email: {done.reason}</p>}
        <p className="text-sm text-ink-soft">
          {done.mailed ? 'Bạn cũng có thể gửi thêm đường dẫn đăng ký cho' : 'Hãy gửi cho'} <b className="text-ink">{name}</b> đường dẫn đăng ký dưới đây (qua Zalo, email…). Họ cần đăng ký đúng email <b className="text-ink">{email.trim().toLowerCase()}</b>; tài khoản sẽ tự được kích hoạt với vai trò và thương hiệu bạn đã chọn.
        </p>
        <div className="mt-3 flex gap-2">
          <input readOnly className="input" value={link} onFocus={(e) => e.target.select()} />
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(link)
              toast.ok('Đã sao chép')
            }}
          >
            Sao chép
          </Button>
        </div>
        {!done.mailed && !done.reason && (
          <p className="mt-3 text-xs text-ink-muted">Máy chủ chưa cấu hình SMTP nên không tự gửi email mời — hãy gửi đường dẫn trên cho nhân viên. Liên kết chứa mã riêng của lời mời, chỉ gửi cho đúng người.</p>
        )}
      </Modal>
    )

  return (
    <Modal
      open
      onClose={onClose}
      title="Mời nhân viên"
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Tạo lời mời
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Email *">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@congty.vn" />
        </Field>
        <Field label="Họ và tên *">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Chức danh">
          <input className="input" value={job} onChange={(e) => setJob(e.target.value)} placeholder="VD: Chuyên viên nội dung" />
        </Field>
        <Field label="Vai trò">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="employee">Nhân viên</option>
            <option value="admin">Quản trị viên</option>
          </select>
        </Field>
        <div>
          <span className="label">Thương hiệu phụ trách</span>
          <BrandPicker value={brandIds} onChange={setBrandIds} />
        </div>
      </div>
    </Modal>
  )
}

function EditEmployeeModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const members = useBrandMembers()
  const me = useMe()
  const initialBrands = (members.data ?? []).filter((m) => m.user_id === profile.id).map((m) => m.brand_id)
  const [name, setName] = useState(profile.full_name)
  const [job, setJob] = useState(profile.job_title ?? '')
  const [resp, setResp] = useState(profile.responsibilities ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [role, setRole] = useState<UserRole>(profile.role)
  const [active, setActive] = useState(profile.is_active)
  const [brandIds, setBrandIds] = useState<string[]>(initialBrands)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const isSelf = profile.id === me.id
  const [resetLink, setResetLink] = useState('')

  const makeResetLink = async () => {
    try {
      const r = await api<{ url: string }>('/api/admin/reset-link', { body: { user_id: profile.id } })
      setResetLink(r.url)
    } catch (e) {
      toast.error(e)
    }
  }

  const save = async () => {
    if (!name.trim()) return toast.error('Vui lòng nhập họ tên')
    if (profile.is_active && !active) {
      const ok = await confirm({
        title: 'Khóa tài khoản?',
        message: `${profile.full_name} sẽ không truy cập được dữ liệu nữa. Lịch sử công việc vẫn được giữ nguyên để đối chiếu hiệu suất.`,
        confirmLabel: 'Khóa tài khoản',
        danger: true,
      })
      if (!ok) return
    }
    setSaving(true)
    try {
      const { error } = await db()
        .from('profiles')
        .update({ full_name: name.trim(), job_title: job.trim() || null, responsibilities: resp.trim() || null, phone: phone.trim() || null, role, is_active: active })
        .eq('id', profile.id)
      if (error) throw error
      const remove = initialBrands.filter((b) => !brandIds.includes(b))
      const add = brandIds.filter((b) => !initialBrands.includes(b))
      if (remove.length) {
        const { error: e } = await db().from('brand_members').delete().eq('user_id', profile.id).in('brand_id', remove)
        if (e) throw e
      }
      if (add.length) {
        const { error: e } = await db().from('brand_members').insert(add.map((b) => ({ brand_id: b, user_id: profile.id })))
        if (e) throw e
      }
      qc.invalidateQueries({ queryKey: qk.profiles })
      qc.invalidateQueries({ queryKey: qk.brandMembers })
      toast.ok('Đã lưu thông tin nhân viên')
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
      title={`Sửa: ${profile.full_name}`}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Họ và tên">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chức danh">
            <input className="input" value={job} onChange={(e) => setJob(e.target.value)} />
          </Field>
          <Field label="Số điện thoại">
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Trách nhiệm chính">
          <textarea className="input min-h-20" value={resp} onChange={(e) => setResp(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vai trò">
            <select className="input" value={role} disabled={isSelf} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="employee">Nhân viên</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </Field>
          <Field label="Trạng thái tài khoản">
            <select className="input" value={active ? '1' : '0'} disabled={isSelf} onChange={(e) => setActive(e.target.value === '1')}>
              <option value="1">Đang hoạt động</option>
              <option value="0">Khóa / chưa kích hoạt</option>
            </select>
          </Field>
        </div>
        <div>
          <span className="label">Thương hiệu phụ trách</span>
          <BrandPicker value={brandIds} onChange={setBrandIds} />
        </div>
        {!isSelf && (
          <div className="rounded-xl bg-sunken p-3 text-sm">
            <p className="mb-2 text-ink-soft">Nhân viên quên mật khẩu và chưa nhận được email? Tạo liên kết đặt lại (hiệu lực 24 giờ) và gửi trực tiếp cho họ.</p>
            {resetLink ? (
              <div className="flex gap-2">
                <input readOnly className="input" value={resetLink} onFocus={(e) => e.target.select()} />
                <Button
                  onClick={() => {
                    navigator.clipboard?.writeText(resetLink)
                    toast.ok('Đã sao chép')
                  }}
                >
                  Sao chép
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={makeResetLink}>
                Tạo liên kết đặt lại mật khẩu
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
