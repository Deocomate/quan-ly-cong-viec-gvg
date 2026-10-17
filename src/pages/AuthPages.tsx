import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Field } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { ApiUnavailable, auth, db, friendlyError } from '../lib/backend'

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-10" />
          <div>
            <p className="font-semibold">Trung tâm điều hành</p>
            <p className="text-xs text-ink-muted">TH Ceramics · Anam Tile · Gốm Vũ Gia · Klayy</p>
          </div>
        </div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return <p className={kind === 'error' ? 'rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger' : 'rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok'}>{children}</p>
}

export function LoginPage() {
  const [params] = useSearchParams()
  useEffect(() => auth.rememberInvite(params.get('invite')), [params])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await auth.signIn(email.trim(), password)
    } catch (err) {
      setError(friendlyError(err))
    }
    setLoading(false)
  }
  return (
    <AuthShell title="Đăng nhập" subtitle="Dùng tài khoản được quản trị viên cấp.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mật khẩu">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          Đăng nhập
        </Button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/quen-mat-khau" className="text-ink-soft hover:underline">
          Quên mật khẩu?
        </Link>
        <Link to="/dang-ky" className="text-ink-soft hover:underline">
          Tôi được mời → Đăng ký
        </Link>
      </div>
    </AuthShell>
  )
}

export function RegisterPage() {
  const [params] = useSearchParams()
  useEffect(() => auth.rememberInvite(params.get('invite')), [params])
  const [name, setName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự.')
    setLoading(true)
    try {
      await auth.signUp({ email: email.trim(), password, full_name: name.trim(), invite: params.get('invite') })
    } catch (err) {
      setError(friendlyError(err))
    }
    setLoading(false)
  }
  return (
    <AuthShell title="Đăng ký tài khoản" subtitle="Dành cho người đã được quản trị viên mời. Dùng đúng email trong lời mời.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Họ và tên">
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email được mời">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mật khẩu (ít nhất 8 ký tự)">
          <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          Đăng ký
        </Button>
      </form>
      <Link to={`/dang-nhap${window.location.search}`} className="mt-4 block text-sm text-ink-soft hover:underline">
        Đã có tài khoản? Đăng nhập
      </Link>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    let failure: unknown = null
    try {
      await auth.forgotPassword(email.trim())
    } catch (err) {
      failure = err instanceof ApiUnavailable ? new Error('Máy chủ chưa cấu hình gửi email. Hãy nhờ quản trị viên tạo liên kết đặt lại mật khẩu cho bạn.') : err
    }
    setLoading(false)
    setMsg(failure ? { kind: 'error', text: friendlyError(failure) } : { kind: 'ok', text: 'Nếu email tồn tại, bạn sẽ nhận được thư đặt lại mật khẩu trong ít phút. Hãy kiểm tra cả thư mục spam.' })
  }
  return (
    <AuthShell title="Quên mật khẩu">
      <form onSubmit={submit} className="space-y-4">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Field label="Email">
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          Gửi thư đặt lại mật khẩu
        </Button>
      </form>
      <Link to="/dang-nhap" className="mt-4 block text-sm text-ink-soft hover:underline">
        Về trang đăng nhập
      </Link>
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  if (!token)
    return (
      <AuthShell title="Liên kết không hợp lệ">
        <Notice kind="error">Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ.</Notice>
        <Link to="/quen-mat-khau" className="mt-4 block text-sm underline">
          Gửi lại thư
        </Link>
      </AuthShell>
    )
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) return setError('Mật khẩu cần ít nhất 8 ký tự.')
    if (pw !== pw2) return setError('Hai mật khẩu không khớp.')
    setLoading(true)
    try {
      await auth.resetPassword(token, pw)
      navigate('/')
    } catch (err) {
      setError(friendlyError(err))
      setLoading(false)
    }
  }
  return (
    <AuthShell title="Đặt mật khẩu mới">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Mật khẩu mới">
          <input className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Field label="Nhập lại mật khẩu mới">
          <input className="input" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          Lưu mật khẩu
        </Button>
      </form>
    </AuthShell>
  )
}

export function InactivePage({ error }: { error?: string | null }) {
  const { signOut, session, refreshProfile } = useAuth()
  const [params] = useSearchParams()
  const urlInvite = params.get('invite')
  const [accepting, setAccepting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const tried = useRef(new Set<string>()) // mỗi mã chỉ gửi một lần dù effect chạy lại

  // Người đã có tài khoản nhận lời mời bằng mã trong liên kết: mở liên kết khi đang đăng nhập (mã trên URL),
  // hoặc mở liên kết rồi mới đăng nhập (mã đã ghi nhớ ở trang đăng nhập / đăng ký).
  useEffect(() => {
    const remembered = auth.takeInvite()
    const token = urlInvite ?? remembered
    if (!token || tried.current.has(token)) return
    tried.current.add(token)
    setAccepting(true)
    db()
      .rpc('accept_invitation', { p_token: token })
      .then(async ({ error: err }) => {
        if (err) setInviteError(friendlyError(err))
        else await refreshProfile()
        setAccepting(false)
      })
  }, [refreshProfile, urlInvite])

  if (accepting)
    return (
      <AuthShell title="Đang nhận lời mời…">
        <p className="text-sm text-ink-soft">Vui lòng chờ trong giây lát.</p>
      </AuthShell>
    )
  return (
    <AuthShell title="Tài khoản chưa được kích hoạt">
      {inviteError && <Notice kind="error">{inviteError}</Notice>}
      <p className="mt-3 text-sm text-ink-soft">
        Tài khoản <b className="text-ink">{session?.user.email}</b> chưa được quản trị viên mời hoặc đã bị khóa. Hãy liên hệ quản trị viên để được cấp quyền, sau đó đăng nhập lại.
      </p>
      {error && <p className="mt-3 text-xs text-danger">{friendlyError(error)}</p>}
      <Button className="mt-5 w-full" onClick={signOut}>
        Đăng xuất
      </Button>
    </AuthShell>
  )
}
