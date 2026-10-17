import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskTable } from '../components/TaskList'
import { Avatar, Button, EmptyState, ErrorBox, Loading, StatCard } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useBrandMembers, useLookups, useTasks } from '../hooks/queries'
import { BRAND_STYLE } from '../lib/constants'
import { presetRange } from '../lib/dates'
import { brandStat, inRangeCompleted } from '../lib/metrics'
import { ProjectCard } from './ProjectsPage'

export function BrandPage() {
  const { slug = '' } = useParams()
  const { brands, projects, profileById, isLoading, error } = useLookups()
  const tasksQ = useTasks()
  const members = useBrandMembers()
  const { isAdmin } = useAuth()
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)

  if (isLoading || tasksQ.isLoading) return <Loading />
  if (error || tasksQ.error) return <ErrorBox error={error || tasksQ.error} />
  const brand = brands.find((b) => b.slug === slug)
  if (!brand)
    return (
      <div className="card">
        <EmptyState title="Không tìm thấy thương hiệu" action={<Link to="/"><Button>Về trang chủ</Button></Link>} />
      </div>
    )
  const style = BRAND_STYLE[brand.color]
  const tasks = (tasksQ.data ?? []).filter((t) => t.brand_id === brand.id)
  const s = brandStat(tasks)
  const week = presetRange('week')
  const doneWeek = tasks.filter((t) => inRangeCompleted(t, week)).length
  const brandProjects = projects.filter((p) => p.brand_id === brand.id && p.status !== 'da_huy')
  const team = (members.data ?? []).filter((m) => m.brand_id === brand.id).map((m) => profileById.get(m.user_id)).filter((p) => p && p.is_active)

  return (
    <>
      <div className={clsx('relative mb-6 overflow-hidden rounded-2xl p-6', style.soft)}>
        <span className={clsx('absolute inset-y-0 left-0 w-1.5', style.bg)} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className={clsx('text-xs font-semibold tracking-wide uppercase', style.text)}>Không gian thương hiệu</p>
            <h1 className={clsx('mt-1 text-2xl font-semibold', style.text)}>{brand.name}</h1>
            <p className="mt-1 text-sm text-ink-soft">{brand.industry}</p>
            {brand.description && <p className="mt-2 max-w-2xl text-sm text-ink-soft">{brand.description}</p>}
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Button icon={<Plus className="size-4" />} onClick={() => setCreatingProject(true)}>
                Dự án
              </Button>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreatingTask(true)}>
                Công việc
              </Button>
            </div>
          )}
        </div>
        <div className="mt-5 flex items-center gap-2">
          {team.map((p) => (
            <span key={p!.id} className="flex items-center gap-1.5 rounded-full bg-surface/70 py-0.5 pr-2.5 pl-0.5 text-xs">
              <Avatar profile={p} size={22} /> {p!.full_name}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Tiến độ (trọng số)" value={`${s.progress}%`} />
        <StatCard label="Tổng công việc" value={s.total} hint="Không tính việc đã hủy" />
        <StatCard label="Đang mở" value={s.open} tone="info" />
        <StatCard label="Hoàn thành" value={s.completed} hint={`${doneWeek} việc trong tuần này`} tone="ok" />
        <StatCard label="Quá hạn" value={s.overdue} tone="danger" />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-ink-soft">Dự án & chiến dịch</h2>
      {brandProjects.length === 0 ? (
        <div className="card mb-8">
          <EmptyState title="Chưa có dự án" action={isAdmin && <Button onClick={() => setCreatingProject(true)}>Tạo dự án</Button>} />
        </div>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {brandProjects.map((p) => (
            <ProjectCard key={p.id} project={p} tasks={tasks.filter((t) => t.project_id === p.id)} />
          ))}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-ink-soft">Công việc của {brand.name}</h2>
      <TaskTable tasks={tasks} />

      {creatingProject && <ProjectFormModal defaultBrandId={brand.id} onClose={() => setCreatingProject(false)} />}
      {creatingTask && <TaskFormModal open defaultBrandId={brand.id} onClose={() => setCreatingTask(false)} />}
    </>
  )
}
