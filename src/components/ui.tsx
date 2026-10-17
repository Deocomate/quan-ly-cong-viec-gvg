import clsx from 'clsx'
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { BRAND_STYLE, PRIORITY_LABEL, PRIORITY_STYLE, STATUS_LABEL, STATUS_STYLE } from '../lib/constants'
import { friendlyError } from '../lib/backend'
import type { Brand, Profile, TaskPriority, TaskStatus } from '../lib/types'

// ---------- Nút ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
const variantCls: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-[#3d3733] shadow-sm',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink',
  danger: 'bg-danger text-white hover:bg-[#9a2e27] shadow-sm',
  success: 'bg-ok text-white hover:bg-[#276a42] shadow-sm',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variantCls[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

// ---------- Nhãn ----------
export function Badge({ className, children, title }: { className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', className)}>
      {children}
    </span>
  )
}

export const StatusBadge = ({ status }: { status: TaskStatus }) => (
  <Badge className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Badge>
)

export const PriorityBadge = ({ priority }: { priority: TaskPriority }) => (
  <Badge className={PRIORITY_STYLE[priority]}>{PRIORITY_LABEL[priority]}</Badge>
)

export const DemoTag = () => (
  <Badge className="bg-[#efe7dc] text-[#7a6650]" title="Dữ liệu mẫu — có thể xóa trong Cài đặt">
    Mẫu
  </Badge>
)

export function BrandTag({ brand }: { brand?: Brand }) {
  if (!brand) return null
  const s = BRAND_STYLE[brand.color] ?? BRAND_STYLE.terracotta
  return (
    <Badge className={clsx(s.soft, s.text)}>
      <span className={clsx('size-1.5 rounded-full', s.bg)} />
      {brand.name}
    </Badge>
  )
}

export function PhaseBadge({ phase }: { phase: 2 | 3 }) {
  return <Badge className="bg-sunken text-ink-muted text-[10px] px-1.5">GĐ {phase}</Badge>
}

// ---------- Tiến độ ----------
export function ProgressBar({ value, className, color }: { value: number; className?: string; color?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}>
      <div className={clsx('h-full rounded-full transition-all', color ?? 'bg-ink')} style={{ width: `${v}%` }} />
    </div>
  )
}

// ---------- Ảnh đại diện ----------
const AVATAR_COLORS = ['#b0532c', '#1c7f79', '#24427f', '#b5707a', '#6b4fb0', '#a86a12', '#2f7d4f']
export function Avatar({ profile, size = 28 }: { profile?: Pick<Profile, 'id' | 'full_name'> | null; size?: number }) {
  if (!profile) return null
  const initials = profile.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  const color = AVATAR_COLORS[[...profile.id].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
  return (
    <span
      title={profile.full_name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-surface"
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  )
}

export function AvatarStack({ profiles, max = 3 }: { profiles: (Profile | undefined)[]; max?: number }) {
  const list = profiles.filter(Boolean) as Profile[]
  return (
    <span className="flex -space-x-1.5">
      {list.slice(0, max).map((p) => (
        <Avatar key={p.id} profile={p} size={24} />
      ))}
      {list.length > max && (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-sunken text-[10px] font-medium ring-2 ring-surface">
          +{list.length - max}
        </span>
      )}
    </span>
  )
}

// ---------- Trạng thái tải / lỗi / trống ----------
export function Loading({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="size-6 text-danger" />
      <div>
        <p className="font-medium">Không tải được dữ liệu</p>
        <p className="mt-1 text-sm text-ink-soft">{friendlyError(error)}</p>
      </div>
      {onRetry && <Button onClick={onRetry}>Thử lại</Button>}
    </div>
  )
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="mb-1 rounded-2xl bg-sunken p-3 text-ink-muted">{icon ?? <Inbox className="size-5" />}</div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-ink-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// ---------- Hộp thoại ----------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(43,39,36,0.35)] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          'flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-sunken" aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---------- Xác nhận trước thao tác nguy hiểm ----------
interface ConfirmOpts {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}
const ConfirmContext = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null)
  const resolver = useRef<(v: boolean) => void>(() => {})
  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o)
    return new Promise<boolean>((res) => {
      resolver.current = res
    })
  }, [])
  const close = (v: boolean) => {
    resolver.current(v)
    setOpts(null)
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title ?? ''}
        footer={
          <>
            <Button onClick={() => close(false)}>Hủy</Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {opts?.confirmLabel ?? 'Xác nhận'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-ink-soft">{opts?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  )
}
export const useConfirm = () => useContext(ConfirmContext)

// ---------- Thông báo nhanh ----------
interface Toast {
  id: number
  kind: 'ok' | 'error'
  text: string
}
const ToastContext = createContext<{ ok: (t: string) => void; error: (e: unknown) => void }>({ ok: () => {}, error: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])
  const api = useMemo(() => ({ ok: (t: string) => push('ok', t), error: (e: unknown) => push('error', friendlyError(e)) }), [push])
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-lg',
              t.kind === 'ok' ? 'bg-ink text-white' : 'bg-danger text-white',
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext)

// ---------- Ô nhập ----------
export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'danger' | 'violet' | 'info'
  icon?: ReactNode
}) {
  const toneCls = {
    default: 'text-ink-soft bg-sunken',
    ok: 'text-ok bg-ok-soft',
    warn: 'text-warn bg-warn-soft',
    danger: 'text-danger bg-danger-soft',
    violet: 'text-violet bg-violet-soft',
    info: 'text-info bg-info-soft',
  }[tone]
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        {icon && <span className={clsx('rounded-lg p-1.5', toneCls)}>{icon}</span>}
      </div>
      <p className="num mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-soft">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('vi-VN')}%`)
export const fmtNum = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
