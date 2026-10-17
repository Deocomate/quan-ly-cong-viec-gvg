import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ConfirmProvider, Loading, ToastProvider } from './components/ui'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ForgotPasswordPage, InactivePage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages'
import { BrandPage } from './pages/BrandPage'
import { DashboardPage } from './pages/DashboardPage'
import { EmployeesPage } from './pages/EmployeesPage'
import { NotificationsPage, SettingsPage } from './pages/MiscPages'
import { ContentCalendarPage } from './pages/ContentCalendarPage'
import { GoalsPage } from './pages/GoalsPage'
import { MonthlySummaryPage, ReportsPage } from './pages/ReportsPage'
import { MyWorkPage } from './pages/MyWorkPage'
import { ProjectDetailPage, ProjectsPage } from './pages/ProjectsPage'
import { TaskPage } from './pages/TaskPage'
import { EmployeePerformancePage, RecurringPage, WorkCalendarPage } from './pages/Phase2Pages'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
})

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  return isAdmin ? children : <Navigate to="/cong-viec-cua-toi" replace />
}

function Gate() {
  const { session, profile, loading, profileError } = useAuth()
  if (loading) return <Loading label="Đang khởi động…" />

  if (!session)
    return (
      <Routes>
        <Route path="/dang-nhap" element={<LoginPage />} />
        <Route path="/dang-ky" element={<RegisterPage />} />
        <Route path="/quen-mat-khau" element={<ForgotPasswordPage />} />
        <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
        <Route path="*" element={<Navigate to="/dang-nhap" replace />} />
      </Routes>
    )

  if (!profile || !profile.is_active)
    return (
      <Routes>
        <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
        <Route path="*" element={<InactivePage error={profileError} />} />
      </Routes>
    )

  return (
    <Routes>
      <Route path="/dat-lai-mat-khau" element={<ResetPasswordPage />} />
      <Route path="/dang-nhap" element={<Navigate to="/" replace />} />
      <Route path="/dang-ky" element={<Navigate to="/" replace />} />
      <Route element={<AppLayout />}>
        <Route
          index
          element={
            <AdminOnly>
              <DashboardPage />
            </AdminOnly>
          }
        />
        <Route path="cong-viec-cua-toi" element={<MyWorkPage />} />
        <Route path="cong-viec/:id" element={<TaskPage />} />
        <Route path="du-an" element={<ProjectsPage />} />
        <Route path="du-an/:id" element={<ProjectDetailPage />} />
        <Route path="thuong-hieu/:slug" element={<BrandPage />} />
        <Route path="nhan-vien" element={<EmployeesPage />} />
        <Route path="thong-bao" element={<NotificationsPage />} />
        <Route path="cai-dat" element={<SettingsPage />} />
        <Route path="lich-cong-viec" element={<WorkCalendarPage />} />
        <Route path="viec-lap-lai" element={<AdminOnly><RecurringPage /></AdminOnly>} />
        <Route path="nhan-vien/:id" element={<EmployeePerformancePage />} />
        <Route path="lich-noi-dung" element={<ContentCalendarPage />} />
        <Route path="muc-tieu" element={<GoalsPage />} />
        <Route path="bao-cao" element={<AdminOnly><ReportsPage /></AdminOnly>} />
        <Route path="bao-cao/nhan-vien/:id" element={<MonthlySummaryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <AuthProvider>
              <Gate />
            </AuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
