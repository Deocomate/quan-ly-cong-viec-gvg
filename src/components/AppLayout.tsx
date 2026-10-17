import clsx from 'clsx'
import {
  BarChart3,
  Bell,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Repeat,
  Settings,
  Target,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth, useMe } from '../contexts/AuthContext'
import { qk, useBrands, useNotifications } from '../hooks/queries'
import { db } from '../lib/backend'
import { BRAND_STYLE } from '../lib/constants'
import { TaskFormModal } from './TaskFormModal'
import { Avatar, PhaseBadge } from './ui'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  phase?: 2 | 3
  adminOnly?: boolean
  badge?: number
}

export function AppLayout() {
  const me = useMe()
  const { isAdmin, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const brands = useBrands()
  const notifications = useNotifications(me.id)
  const unread = (notifications.data ?? []).filter((n) => !n.is_read).length
  const location = useLocation()
  const qc = useQueryClient()

  // Dự phòng khi chưa bật pg_cron: mỗi phiên chạy 1 lần việc lặp lại + nhắc hạn (idempotent)
  useEffect(() => {
    const k = 'jobs-ran'
    try {
      if (sessionStorage.getItem(k)) return
      sessionStorage.setItem(k, '1')
    } catch {
      /* bỏ qua */
    }
    db()
      .rpc('run_scheduled_jobs')
      .then(({ data, error }) => {
        if (error) return
        const r = data as { generated?: number; reminders?: number } | null
        if (r?.generated) qc.invalidateQueries({ queryKey: qk.tasks })
        if (r?.reminders) qc.invalidateQueries({ queryKey: qk.notifications })
      })
  }, [qc])

  const items: NavItem[] = [
    { to: '/', label: 'Tổng quan', icon: <LayoutDashboard className="size-4" />, adminOnly: true },
    { to: '/cong-viec-cua-toi', label: 'Công việc của tôi', icon: <CheckSquare className="size-4" /> },
    { to: '/du-an', label: 'Dự án', icon: <FolderKanban className="size-4" /> },
    { to: '/lich-cong-viec', label: 'Lịch công việc', icon: <CalendarDays className="size-4" /> },
    { to: '/viec-lap-lai', label: 'Việc lặp lại', icon: <Repeat className="size-4" />, adminOnly: true },
    { to: '/lich-noi-dung', label: 'Lịch nội dung', icon: <CalendarRange className="size-4" /> },
    { to: '/muc-tieu', label: 'Mục tiêu & KPI', icon: <Target className="size-4" /> },
    { to: '/nhan-vien', label: 'Nhân viên', icon: <Users className="size-4" /> },
    { to: '/bao-cao', label: 'Báo cáo', icon: <BarChart3 className="size-4" />, adminOnly: true },
    { to: '/thong-bao', label: 'Thông báo', icon: <Bell className="size-4" />, badge: unread },
    { to: '/cai-dat', label: 'Cài đặt', icon: <Settings className="size-4" /> },
  ]

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <img src="/favicon.svg" alt="" className="size-8" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">Trung tâm điều hành</p>
          <p className="text-xs text-ink-muted">4 thương hiệu</p>
        </div>
      </div>

      {isAdmin && (
        <div className="px-3 pb-3">
          <button
            onClick={() => {
              setCreating(true)
              setOpen(false)
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#3d3733]"
          >
            <Plus className="size-4" /> Tạo công việc
          </button>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items
          .filter((i) => !i.adminOnly || isAdmin)
          .map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                  isActive ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-ink-soft hover:bg-[#efe9e1] hover:text-ink',
                )
              }
            >
              {i.icon}
              <span className="flex-1">{i.label}</span>
              {i.phase && <PhaseBadge phase={i.phase} />}
              {!!i.badge && (
                <span className="num rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{i.badge}</span>
              )}
            </NavLink>
          ))}

        <p className="px-2.5 pt-5 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Thương hiệu</p>
        {(brands.data ?? []).map((b) => (
          <NavLink
            key={b.id}
            to={`/thuong-hieu/${b.slug}`}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                isActive ? 'bg-surface font-medium shadow-sm ring-1 ring-line' : 'text-ink-soft hover:bg-[#efe9e1]',
              )
            }
          >
            <span className={clsx('size-2.5 rounded-full', BRAND_STYLE[b.color]?.bg)} />
            {b.name}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-line px-4 py-3">
        <Avatar profile={me} size={32} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{me.full_name}</p>
          <p className="truncate text-xs text-ink-muted">{isAdmin ? 'Quản trị viên' : (me.job_title ?? 'Nhân viên')}</p>
        </div>
        <button onClick={signOut} className="rounded-lg p-1.5 text-ink-muted hover:bg-sunken hover:text-ink" title="Đăng xuất" aria-label="Đăng xuất">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 self-start shrink-0 border-r border-line bg-[#f5f1eb] lg:block">{sidebar}</aside>

      {/* Thanh trên cho điện thoại / máy tính bảng */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 hover:bg-sunken" aria-label="Mở menu">
          <Menu className="size-5" />
        </button>
        <p className="text-sm font-semibold">Trung tâm điều hành</p>
        <NavLink to="/thong-bao" className="relative rounded-lg p-1.5 hover:bg-sunken" aria-label="Thông báo">
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-danger" />}
        </NavLink>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[rgba(43,39,36,0.35)]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-[#f5f1eb] shadow-2xl">
            <button onClick={() => setOpen(false)} className="absolute top-4 right-3 rounded-lg p-1 hover:bg-sunken" aria-label="Đóng menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main key={location.pathname} className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>

      {creating && <TaskFormModal open onClose={() => setCreating(false)} />}
    </div>
  )
}
