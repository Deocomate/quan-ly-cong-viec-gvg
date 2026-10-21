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
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth, useMe } from '../contexts/AuthContext'
import { qk, useBrands, useNotifications } from '../hooks/queries'
import { db } from '../lib/backend'
import { BRAND_STYLE } from '../lib/constants'
import { TaskFormModal } from './TaskFormModal'
import { Avatar, Modal } from './ui'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  adminOnly?: boolean
  badge?: number
}

const ic = 'size-5 lg:size-4'

export function AppLayout() {
  const me = useMe()
  const { isAdmin, signOut } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
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

  const visible = (list: NavItem[]) => list.filter((i) => !i.adminOnly || isAdmin)

  // Việc hằng ngày
  const primary = visible([
    { to: '/', label: 'Tổng quan', icon: <LayoutDashboard className={ic} />, adminOnly: true },
    { to: '/cong-viec-cua-toi', label: 'Công việc của tôi', icon: <CheckSquare className={ic} /> },
    { to: '/lich-cong-viec', label: 'Lịch công việc', icon: <CalendarDays className={ic} /> },
    { to: '/du-an', label: 'Dự án', icon: <FolderKanban className={ic} /> },
    { to: '/thong-bao', label: 'Thông báo', icon: <Bell className={ic} />, badge: unread },
  ])
  // Lập kế hoạch & quản lý — dùng ít hơn
  const manage = visible([
    { to: '/lich-noi-dung', label: 'Lịch nội dung', icon: <CalendarRange className={ic} /> },
    { to: '/muc-tieu', label: 'Mục tiêu & KPI', icon: <Target className={ic} /> },
    { to: '/nhan-vien', label: 'Nhân viên', icon: <Users className={ic} /> },
    { to: '/bao-cao', label: 'Báo cáo', icon: <BarChart3 className={ic} />, adminOnly: true },
    { to: '/viec-lap-lai', label: 'Việc lặp lại', icon: <Repeat className={ic} />, adminOnly: true },
  ])

  // Thanh dưới trên điện thoại: tối đa 4 mục + nút tạo việc (quản trị viên)
  const tabs = visible([
    { to: '/', label: 'Tổng quan', icon: <LayoutDashboard className={ic} />, adminOnly: true },
    { to: '/cong-viec-cua-toi', label: 'Việc của tôi', icon: <CheckSquare className={ic} /> },
    ...(isAdmin ? [] : [{ to: '/lich-cong-viec', label: 'Lịch', icon: <CalendarDays className={ic} /> }]),
    { to: '/thong-bao', label: 'Thông báo', icon: <Bell className={ic} />, badge: unread },
  ])
  const onTab = tabs.some((t) => (t.to === '/' ? location.pathname === '/' : location.pathname.startsWith(t.to)))
  // Trang chi tiết công việc có thanh hành động riêng ở đáy màn hình
  const hideTabBar = location.pathname.startsWith('/cong-viec/')

  const sideLink = (i: NavItem) => (
    <NavLink
      key={i.to}
      to={i.to}
      end={i.to === '/'}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
          isActive ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-line' : 'text-ink-soft hover:bg-[#efe9e1] hover:text-ink',
        )
      }
    >
      {i.icon}
      <span className="flex-1">{i.label}</span>
      {!!i.badge && <span className="num rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{i.badge}</span>}
    </NavLink>
  )

  const groupTitle = (t: string) => <p className="px-2.5 pt-5 pb-1.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{t}</p>

  return (
    <div className="min-h-dvh lg:flex">
      {/* Thanh bên trên máy tính */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 self-start border-r border-line bg-[#f5f1eb] lg:block">
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
                onClick={() => setCreating(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#3d3733]"
              >
                <Plus className="size-4" /> Tạo công việc
              </button>
            </div>
          )}
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
            {primary.map(sideLink)}
            {groupTitle('Quản lý')}
            {manage.map(sideLink)}
            {groupTitle('Thương hiệu')}
            {(brands.data ?? []).map((b) => (
              <NavLink
                key={b.id}
                to={`/thuong-hieu/${b.slug}`}
                className={({ isActive }) =>
                  clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors', isActive ? 'bg-surface font-medium shadow-sm ring-1 ring-line' : 'text-ink-soft hover:bg-[#efe9e1]')
                }
              >
                <span className={clsx('size-2.5 rounded-full', BRAND_STYLE[b.color]?.bg)} />
                {b.name}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1 border-t border-line px-3 py-3">
            <Link to="/cai-dat" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-[#efe9e1]" title="Cài đặt">
              <Avatar profile={me} size={32} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-medium">{me.full_name}</span>
                <span className="block truncate text-xs text-ink-muted">{isAdmin ? 'Quản trị viên' : (me.job_title ?? 'Nhân viên')}</span>
              </span>
            </Link>
            <NavLink to="/cai-dat" className="rounded-lg p-1.5 text-ink-muted hover:bg-sunken hover:text-ink" title="Cài đặt" aria-label="Cài đặt">
              <Settings className="size-4" />
            </NavLink>
            <button onClick={signOut} className="rounded-lg p-1.5 text-ink-muted hover:bg-sunken hover:text-ink" title="Đăng xuất" aria-label="Đăng xuất">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Chừa chỗ cho thanh dưới (hoặc thanh hành động của trang chi tiết) và tai thỏ */}
      <main
        key={location.pathname}
        className="min-w-0 flex-1 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:py-8"
      >
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>

      {/* Thanh điều hướng dưới trên điện thoại / máy tính bảng */}
      {!hideTabBar && (
        <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden" aria-label="Điều hướng chính">
          <div className="mx-auto flex max-w-lg items-stretch">
            {tabs.slice(0, isAdmin ? 2 : tabs.length).map((t) => (
              <TabLink key={t.to} item={t} />
            ))}
            {isAdmin && (
              <div className="flex flex-1 items-center justify-center">
                <button
                  onClick={() => setCreating(true)}
                  className="flex size-12 items-center justify-center rounded-2xl bg-ink text-white shadow-md active:scale-95"
                  aria-label="Tạo công việc"
                >
                  <Plus className="size-6" />
                </button>
              </div>
            )}
            {isAdmin && tabs.slice(2).map((t) => <TabLink key={t.to} item={t} />)}
            <button
              onClick={() => setMoreOpen(true)}
              className={clsx('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', !onTab ? 'font-semibold text-ink' : 'text-ink-muted')}
              aria-label="Thêm"
            >
              <Menu className={ic} />
              Thêm
            </button>
          </div>
        </nav>
      )}

      {moreOpen && (
        <Modal open onClose={() => setMoreOpen(false)} title="Menu">
          <Link to="/cai-dat" onClick={() => setMoreOpen(false)} className="-mx-2 mb-3 flex items-center gap-3 rounded-xl p-2 hover:bg-sunken">
            <Avatar profile={me} size={40} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate font-medium">{me.full_name}</span>
              <span className="block truncate text-xs text-ink-muted">{isAdmin ? 'Quản trị viên' : (me.job_title ?? 'Nhân viên')} · Cài đặt</span>
            </span>
            <Settings className="size-5 text-ink-muted" />
          </Link>
          <div className="grid grid-cols-3 gap-2">
            {[...primary.filter((p) => !tabs.some((t) => t.to === p.to)), ...manage].map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  clsx('flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center text-xs', isActive ? 'bg-ink text-white' : 'bg-sunken text-ink hover:bg-line')
                }
              >
                {i.icon}
                {i.label}
              </NavLink>
            ))}
          </div>
          <p className="mt-5 mb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Thương hiệu</p>
          <div className="grid grid-cols-2 gap-2">
            {(brands.data ?? []).map((b) => (
              <Link key={b.id} to={`/thuong-hieu/${b.slug}`} onClick={() => setMoreOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm hover:bg-sunken">
                <span className={clsx('size-2.5 shrink-0 rounded-full', BRAND_STYLE[b.color]?.bg)} />
                <span className="truncate">{b.name}</span>
              </Link>
            ))}
          </div>
          <button onClick={signOut} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm text-danger hover:bg-danger-soft">
            <LogOut className="size-4" /> Đăng xuất
          </button>
        </Modal>
      )}

      {creating && <TaskFormModal open onClose={() => setCreating(false)} />}
    </div>
  )
}

function TabLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => clsx('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'font-semibold text-ink' : 'text-ink-muted')}
    >
      <span className="relative">
        {item.icon}
        {!!item.badge && (
          <span className="num absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-semibold text-white">
            {item.badge > 99 ? '99+' : item.badge}
          </span>
        )}
      </span>
      {item.label}
    </NavLink>
  )
}
