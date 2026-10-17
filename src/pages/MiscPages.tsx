import clsx from 'clsx'
import { Bell, CheckCheck, Construction, Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { KpiSettingsCard } from './Phase2Pages'
import { useSetting } from '../hooks/queries'
import { Badge, Button, EmptyState, ErrorBox, Field, Loading, PageHeader, PhaseBadge, useConfirm, useToast } from '../components/ui'
import { useAuth, useMe } from '../contexts/AuthContext'
import { qk, useNotifications, useTasks } from '../hooks/queries'
import { fmtDateTime } from '../lib/dates'
import { api, ApiUnavailable, auth, downloadBackup } from '../lib/backend'
import { db } from '../lib/backend'

// ---------- Thông báo ----------
export function NotificationsPage() {
  const me = useMe()
  const q = useNotifications(me.id)
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [onlyUnread, setOnlyUnread] = useState(false)

  const markRead = async (ids: string[]) => {
    if (!ids.length) return
    const { error } = await db().from('notifications').update({ is_read: true }).in('id', ids)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: qk.notifications })
  }

  if (q.isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />
  const all = q.data ?? []
  const list = onlyUnread ? all.filter((n) => !n.is_read) : all
  const unread = all.filter((n) => !n.is_read)

  return (
    <>
      <PageHeader
        title="Thông báo"
        subtitle="Giao việc mới, nộp duyệt, yêu cầu chỉnh sửa, được duyệt, nhắc tên, nhắc sắp đến hạn và cảnh báo quá hạn."
        actions={
          <Button icon={<CheckCheck className="size-4" />} disabled={!unread.length} onClick={() => markRead(unread.map((n) => n.id))}>
            Đánh dấu đã đọc tất cả
          </Button>
        }
      />
      <div className="mb-3 flex gap-1">
        {[false, true].map((v) => (
          <button key={String(v)} onClick={() => setOnlyUnread(v)} className={clsx('rounded-lg px-3 py-1.5 text-sm', onlyUnread === v ? 'bg-surface font-medium shadow-sm ring-1 ring-line' : 'text-ink-soft')}>
            {v ? `Chưa đọc (${unread.length})` : 'Tất cả'}
          </button>
        ))}
      </div>
      <div className="card divide-y divide-line">
        {list.length === 0 ? (
          <EmptyState icon={<Bell className="size-5" />} title="Không có thông báo" />
        ) : (
          list.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                markRead([n.id])
                if (n.task_id) navigate(`/cong-viec/${n.task_id}`)
                else if (n.link?.startsWith('/')) navigate(n.link)
              }}
              className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#fcfaf7]', !n.is_read && 'bg-[#fbf7f1]')}
            >
              <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', n.is_read ? 'bg-transparent' : 'bg-danger')} />
              <span className="min-w-0 flex-1">
                <span className={clsx('block text-sm', !n.is_read && 'font-semibold')}>{n.title}</span>
                {n.body && <span className="block truncate text-sm text-ink-soft">{n.body}</span>}
                <span className="text-xs text-ink-muted">{fmtDateTime(n.created_at)}</span>
              </span>
            </button>
          ))
        )}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Nhắc hạn chạy tự động mỗi giờ (nếu bật pg_cron) và mỗi khi có người mở ứng dụng; số ngày nhắc trước chỉnh trong Cài đặt. Email: chỉ gửi khi quản trị viên đã cài dịch vụ gửi thư (xem trạng thái trong Cài đặt); bạn có thể tắt email của mình trong Cài đặt. Danh sách tự làm mới mỗi phút.
      </p>
    </>
  )
}

// ---------- Cài đặt ----------
export function SettingsPage() {
  const me = useMe()
  const { isAdmin, refreshProfile } = useAuth()
  const tasksQ = useTasks()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [name, setName] = useState(me.full_name)
  const [phone, setPhone] = useState(me.phone ?? '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const demoCount = (tasksQ.data ?? []).filter((t) => t.is_demo).length

  const saveProfile = async () => {
    if (!name.trim()) return toast.error('Vui lòng nhập họ tên')
    setBusy('profile')
    const { error } = await db().from('profiles').update({ full_name: name.trim(), phone: phone.trim() || null }).eq('id', me.id)
    setBusy(null)
    if (error) return toast.error(error)
    await refreshProfile()
    qc.invalidateQueries({ queryKey: qk.profiles })
    toast.ok('Đã lưu thông tin cá nhân')
  }

  const changePw = async () => {
    if (pw.length < 8) return toast.error('Mật khẩu cần ít nhất 8 ký tự')
    if (pw !== pw2) return toast.error('Hai mật khẩu không khớp')
    setBusy('pw')
    try {
      await auth.changePassword(pw)
    } catch (e) {
      setBusy(null)
      return toast.error(e)
    }
    setBusy(null)
    setPw('')
    setPw2('')
    toast.ok('Đã đổi mật khẩu')
  }

  const purge = async () => {
    const ok = await confirm({
      title: 'Xóa toàn bộ dữ liệu mẫu?',
      message: (
        <>
          Sẽ xóa vĩnh viễn <b>mọi dự án và công việc có nhãn "Mẫu"</b> (kèm bình luận, tệp, lịch sử) và khóa các tài khoản nhân viên mẫu. Dữ liệu thật không bị ảnh hưởng. Không thể hoàn tác.
        </>
      ),
      confirmLabel: 'Xóa dữ liệu mẫu',
      danger: true,
    })
    if (!ok) return
    setBusy('purge')
    const { data, error } = await db().rpc('purge_demo_data')
    setBusy(null)
    if (error) return toast.error(error)
    const r = data as { tasks: number; projects: number; users_deactivated: number }
    qc.invalidateQueries()
    toast.ok(`Đã xóa ${r.tasks} công việc, ${r.projects} dự án mẫu; khóa ${r.users_deactivated} tài khoản mẫu`)
  }

  return (
    <>
      <PageHeader title="Cài đặt" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Thông tin cá nhân</h2>
          <div className="space-y-4">
            <Field label="Email đăng nhập">
              <input className="input" value={me.email} disabled />
            </Field>
            <Field label="Họ và tên">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Số điện thoại">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <p className="text-xs text-ink-muted">Chức danh, vai trò và thương hiệu phụ trách do quản trị viên quản lý.</p>
            <Button variant="primary" loading={busy === 'profile'} onClick={saveProfile}>
              Lưu
            </Button>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Đổi mật khẩu</h2>
          <div className="space-y-4">
            <Field label="Mật khẩu mới">
              <input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </Field>
            <Field label="Nhập lại mật khẩu mới">
              <input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
            <Button variant="primary" loading={busy === 'pw'} onClick={changePw}>
              Đổi mật khẩu
            </Button>
          </div>
        </section>

        {isAdmin && (
          <section className="card p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              Dữ liệu mẫu <Badge className="bg-[#efe7dc] text-[#7a6650]">Mẫu</Badge>
            </h2>
            <p className="mb-4 text-sm text-ink-soft">
              Dữ liệu mẫu luôn được gắn nhãn "Mẫu" và tách biệt với dữ liệu thật. Hiện có <b className="num">{demoCount}</b> công việc mẫu.
            </p>
            <Button variant="danger" disabled={!demoCount} loading={busy === 'purge'} onClick={purge}>
              Xóa toàn bộ dữ liệu mẫu
            </Button>
            {me.is_demo && <p className="mt-2 text-xs text-warn">Bạn đang dùng tài khoản quản trị mẫu — hãy đăng nhập bằng tài khoản thật để xóa.</p>}
          </section>
        )}

        {isAdmin && <BackupCard />}
        <EmailSettingsCard />
        <KpiSettingsCard />
      </div>
    </>
  )
}

// ---------- Tính năng giai đoạn sau ----------
export function ComingSoonPage({ title, phase, items }: { title: string; phase: 2 | 3; items: string[] }) {
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2">{title} <PhaseBadge phase={phase} /></span>} />
      <div className="card flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-4 rounded-2xl bg-sunken p-4 text-ink-muted">
          <Construction className="size-7" />
        </div>
        <p className="font-semibold">Chưa triển khai — sẽ có ở Giai đoạn {phase}</p>
        <p className="mt-1 max-w-md text-sm text-ink-soft">Trang này chưa có chức năng để tránh hiển thị nút bấm không hoạt động. Dự kiến bao gồm:</p>
        <ul className="mt-4 space-y-1.5 text-left text-sm text-ink-soft">
          {items.map((i) => (
            <li key={i}>• {i}</li>
          ))}
        </ul>
        <Link to="/cong-viec-cua-toi" className="mt-6">
          <Button>Về Công việc của tôi</Button>
        </Link>
      </div>
    </>
  )
}

interface ImportResult {
  counts: Record<string, number>
  createdUsers: { email: string }[]
  snapshot: string
  mails: { sent: number; failed: number } | null
  ignored: string[]
}

function BackupCard() {
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const unavailable = () => toast.error('Không kết nối được dịch vụ sao lưu của máy chủ.')

  const exportData = async () => {
    setBusy('export')
    try {
      await downloadBackup()
      toast.ok('Đã tải bản sao lưu')
    } catch (e) {
      if (e instanceof ApiUnavailable) unavailable()
      else toast.error(e)
    }
    setBusy(null)
  }

  const importData = async () => {
    if (!file) return
    const ok = await confirm({
      title: mode === 'replace' ? 'Thay thế toàn bộ dữ liệu?' : 'Nhập dữ liệu từ tệp?',
      message:
        mode === 'replace' ? (
          <>
            Sẽ <b>xóa toàn bộ</b> thương hiệu, dự án, công việc, thông báo… hiện có rồi nạp lại từ <b>{file.name}</b>. Hệ thống tự lưu một bản sao lưu trên máy chủ trước khi nhập. Tệp đính kèm trong Storage không bị ảnh hưởng.
          </>
        ) : (
          <>
            Dữ liệu trong <b>{file.name}</b> sẽ được thêm vào; dòng nào trùng mã sẽ bị ghi đè bằng bản trong tệp, dòng khác giữ nguyên. Hệ thống tự lưu một bản sao lưu trên máy chủ trước khi nhập.
          </>
        ),
      confirmLabel: mode === 'replace' ? 'Thay thế dữ liệu' : 'Nhập dữ liệu',
      danger: mode === 'replace',
    })
    if (!ok) return
    setBusy('import')
    setResult(null)
    try {
      const r = await api<ImportResult>(`/api/admin/import?mode=${mode}${notify ? '&notify=1' : ''}`, { rawBody: await file.text(), headers: { 'Content-Type': 'application/json' } })
      setResult(r)
      qc.invalidateQueries()
      toast.ok('Đã nhập dữ liệu')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      if (e instanceof ApiUnavailable) unavailable()
      else toast.error(e)
    }
    setBusy(null)
  }

  return (
    <section className="card p-5 lg:col-span-2">
      <h2 className="mb-1 font-semibold">Sao lưu & khôi phục dữ liệu</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Tệp JSON chứa thương hiệu, nhân viên, dự án, công việc, thông báo, cài đặt… Không gồm mật khẩu và tệp đính kèm. Tệp xuất ra nhập lại được vào chính hệ thống này hoặc một hệ thống mới.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">Xuất</h3>
          <Button icon={<Download className="size-4" />} loading={busy === 'export'} onClick={exportData}>
            Tải bản sao lưu (.json)
          </Button>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Nhập</h3>
          <input ref={fileRef} type="file" accept="application/json,.json" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <div className="space-y-1.5 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1 accent-[#2b2724]" checked={mode === 'merge'} onChange={() => setMode('merge')} />
              <span><b>Gộp</b> — thêm mới và cập nhật theo mã, giữ lại dữ liệu hiện có.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1 accent-[#2b2724]" checked={mode === 'replace'} onChange={() => setMode('replace')} />
              <span><b>Thay thế</b> — xóa dữ liệu hiện có rồi nạp lại đúng như trong tệp.</span>
            </label>
            <label className="flex items-start gap-2 pt-1">
              <input type="checkbox" className="mt-1 size-4 accent-[#2b2724]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <span>Gửi email đặt mật khẩu cho tài khoản được tạo lại (nếu máy chủ đã cấu hình SMTP).</span>
            </label>
          </div>
          <Button variant={mode === 'replace' ? 'danger' : 'primary'} icon={<Upload className="size-4" />} disabled={!file} loading={busy === 'import'} onClick={importData}>
            Nhập dữ liệu
          </Button>
        </div>
      </div>
      {result && (
        <div className="mt-5 rounded-xl bg-ok-soft p-3 text-sm text-ok">
          <p className="font-medium">Đã nhập: {Object.entries(result.counts).filter(([, n]) => n > 0).map(([t, n]) => `${t} (${n})`).join(', ') || 'không có dòng nào'}.</p>
          {result.createdUsers.length > 0 && (
            <p className="mt-1">
              Đã tạo lại {result.createdUsers.length} tài khoản chưa có mật khẩu: {result.createdUsers.map((u) => u.email).join(', ')}.{' '}
              {result.mails ? `Đã gửi ${result.mails.sent} email đặt mật khẩu${result.mails.failed ? `, lỗi ${result.mails.failed}` : ''}.` : 'Họ dùng "Quên mật khẩu" ở trang đăng nhập để đặt mật khẩu.'}
            </p>
          )}
          {result.ignored.length > 0 && <p className="mt-1">Bỏ qua các mục không thuộc ứng dụng: {result.ignored.join(', ')}.</p>}
          <p className="mt-1 text-xs">Bản sao lưu trước khi nhập nằm trên máy chủ: {result.snapshot}</p>
        </div>
      )}
    </section>
  )
}

function EmailSettingsCard() {
  const me = useMe()
  const { isAdmin, refreshProfile } = useAuth()
  const toast = useToast()
  const status = useSetting<{ last_run_at?: string; sent?: number; failed?: number; error?: string } | null>('email_status', null)
  const [busy, setBusy] = useState(false)
  const on = me.email_notifications !== false
  const toggle = async () => {
    setBusy(true)
    const { error } = await db().from('profiles').update({ email_notifications: !on }).eq('id', me.id)
    setBusy(false)
    if (error) return toast.error(error)
    await refreshProfile()
    toast.ok(on ? 'Đã tắt thông báo qua email' : 'Đã bật thông báo qua email')
  }
  const st = status.data
  return (
    <section className="card p-5">
      <h2 className="mb-1 font-semibold">Thông báo qua email</h2>
      <p className="mb-4 text-sm text-ink-soft">Gửi các thông báo trong ứng dụng (giao việc, nhắc hạn, quá hạn, duyệt…) tới {me.email}.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[#2b2724]" checked={on} disabled={busy} onChange={toggle} />
        Nhận thông báo qua email
      </label>
      <div className={clsx('mt-4 rounded-xl p-3 text-sm', st?.last_run_at ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
        {status.isLoading ? (
          'Đang kiểm tra…'
        ) : st?.last_run_at ? (
          <>
            Dịch vụ gửi email đang hoạt động. Lần chạy gần nhất: {fmtDateTime(st.last_run_at)} — đã gửi {st.sent ?? 0}
            {st.failed ? `, lỗi ${st.failed}` : ''}.{st.error ? ` Lỗi gần nhất: ${st.error}` : ''}
          </>
        ) : (
          <>
            <b>Chưa kích hoạt gửi email.</b> Hệ thống chưa ghi nhận lần gửi nào.{' '}
            {isAdmin ? 'Cần đặt SMTP_HOST, EMAIL_FROM, APP_URL cho máy chủ (Coolify) — xem docs/07-trien-khai-coolify.md.' : 'Quản trị viên cần cài đặt dịch vụ gửi thư.'}
          </>
        )}
      </div>
    </section>
  )
}
