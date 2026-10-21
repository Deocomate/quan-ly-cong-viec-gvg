import clsx from 'clsx'
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskTable } from '../components/TaskList'
import { TaskViews, ViewTabs, type ViewKey } from '../components/TaskViews'
import { Avatar, Badge, BrandChips, BrandTag, Button, DemoTag, EmptyState, ErrorBox, Loading, PageHeader, ProgressBar, useConfirm, useToast } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { qk, useLookups, useTasks } from '../hooks/queries'
import { BRAND_STYLE, PROJECT_STATUS_LABEL } from '../lib/constants'
import { fmtDateKey } from '../lib/dates'
import { brandStat } from '../lib/metrics'
import { db } from '../lib/backend'
import type { Project, Task } from '../lib/types'

export function ProjectCard({ project, tasks }: { project: Project; tasks: Task[] }) {
  const { brandById, profileById } = useLookups()
  const brand = brandById.get(project.brand_id)
  const s = brandStat(tasks)
  const owner = project.owner_id ? profileById.get(project.owner_id) : undefined
  return (
    <Link to={`/du-an/${project.id}`} className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <BrandTag brand={brand} />
        <Badge className="bg-sunken text-ink-soft">{PROJECT_STATUS_LABEL[project.status]}</Badge>
        {project.is_demo && <DemoTag />}
      </div>
      <p className="font-semibold">{project.name}</p>
      {project.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{project.description}</p>}
      <div className="mt-4 flex items-center gap-3">
        <ProgressBar value={s.progress} color={brand ? BRAND_STYLE[brand.color].bar : undefined} />
        <span className="num text-sm font-semibold">{s.progress}%</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
        <span className="num">
          {s.completed}/{s.total} việc xong{s.overdue ? <span className="text-danger"> · {s.overdue} quá hạn</span> : ''}
        </span>
        <span className="flex items-center gap-1.5">
          {project.due_date && <>Hạn {fmtDateKey(project.due_date)}</>}
          {owner && <Avatar profile={owner} size={20} />}
        </span>
      </div>
    </Link>
  )
}

export function ProjectsPage() {
  const { projects, brands, isLoading, error } = useLookups()
  const tasksQ = useTasks()
  const { isAdmin } = useAuth()
  const [brandId, setBrandId] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [creating, setCreating] = useState(false)

  if (isLoading || tasksQ.isLoading) return <Loading />
  if (error || tasksQ.error) return <ErrorBox error={error || tasksQ.error} />

  const list = projects.filter(
    (p) => (!brandId || p.brand_id === brandId) && (showClosed || (p.status !== 'hoan_thanh' && p.status !== 'da_huy')),
  )
  const tasks = tasksQ.data ?? []

  return (
    <>
      <PageHeader
        title="Dự án"
        subtitle="Các dự án và chiến dịch của từng thương hiệu. Tiến độ tính theo trọng số công việc."
        actions={
          isAdmin && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Tạo dự án
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <BrandChips brands={brands} value={brandId} onChange={setBrandId} />
        <label className="flex min-h-9 items-center gap-2 text-sm text-ink-soft sm:ml-auto">
          <input type="checkbox" className="accent-[#2b2724]" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Hiện dự án đã đóng
        </label>
      </div>
      {list.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Chưa có dự án"
            hint={isAdmin ? 'Tạo dự án đầu tiên để nhóm các công việc theo chiến dịch.' : 'Bạn chưa tham gia dự án nào.'}
            action={isAdmin && <Button onClick={() => setCreating(true)}>Tạo dự án</Button>}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} tasks={tasks.filter((t) => t.project_id === p.id)} />
          ))}
        </div>
      )}
      {creating && <ProjectFormModal defaultBrandId={brandId || undefined} onClose={() => setCreating(false)} />}
    </>
  )
}

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const { projectById, brandById, profileById, isLoading } = useLookups()
  const tasksQ = useTasks()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const [view, setView] = useState<ViewKey>('list')
  const toast = useToast()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [quick, setQuick] = useState('')
  const [adding, setAdding] = useState(false)

  if (isLoading || tasksQ.isLoading) return <Loading />
  const project = projectById.get(id)
  if (!project)
    return (
      <div className="card">
        <EmptyState title="Không tìm thấy dự án" hint="Dự án có thể đã bị xóa hoặc bạn không có quyền xem." action={<Link to="/du-an"><Button>Về danh sách dự án</Button></Link>} />
      </div>
    )
  const brand = brandById.get(project.brand_id)
  const tasks = (tasksQ.data ?? []).filter((t) => t.project_id === project.id)
  const s = brandStat(tasks)
  const owner = project.owner_id ? profileById.get(project.owner_id) : undefined

  const quickAdd = async () => {
    if (!quick.trim()) return
    setAdding(true)
    const { error } = await db().from('tasks').insert({ brand_id: project.brand_id, project_id: project.id, title: quick.trim() })
    setAdding(false)
    if (error) return toast.error(error)
    setQuick('')
    qc.invalidateQueries({ queryKey: qk.tasks })
    toast.ok('Đã thêm công việc — mở công việc để giao người và đặt hạn')
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Xóa dự án?',
      message: (
        <>
          Dự án <b>{project.name}</b> và <b>{tasks.length} công việc</b> bên trong (kèm bình luận, tệp, lịch sử) sẽ bị xóa vĩnh viễn. Nếu chỉ muốn kết thúc, hãy đổi trạng thái thành "Hoàn thành" hoặc "Đã hủy".
        </>
      ),
      confirmLabel: 'Xóa vĩnh viễn',
      danger: true,
    })
    if (!ok) return
    const { error } = await db().from('projects').delete().eq('id', project.id)
    if (error) return toast.error(error)
    qc.invalidateQueries({ queryKey: qk.projects })
    qc.invalidateQueries({ queryKey: qk.tasks })
    toast.ok('Đã xóa dự án')
    navigate('/du-an')
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {project.name} {project.is_demo && <DemoTag />}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <BrandTag brand={brand} />
            <Badge className="bg-sunken text-ink-soft">{PROJECT_STATUS_LABEL[project.status]}</Badge>
            <span>
              {fmtDateKey(project.start_date)} → {fmtDateKey(project.due_date)}
            </span>
            {owner && (
              <span className="flex items-center gap-1">
                · Phụ trách <Avatar profile={owner} size={18} /> {owner.full_name}
              </span>
            )}
          </span>
        }
        actions={
          isAdmin && (
            <>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreatingTask(true)}>
                Thêm công việc
              </Button>
              <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                Sửa
              </Button>
              <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
                Xóa
              </Button>
            </>
          )
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="label">Mô tả</p>
              <p className="text-sm whitespace-pre-wrap text-ink-soft">{project.description || '—'}</p>
            </div>
            <div>
              <p className="label">Mục tiêu</p>
              <p className="text-sm whitespace-pre-wrap text-ink-soft">{project.goals || '—'}</p>
            </div>
            {project.notes && (
              <div className="sm:col-span-2">
                <p className="label">Ghi chú</p>
                <p className="text-sm whitespace-pre-wrap text-ink-soft">{project.notes}</p>
              </div>
            )}
          </div>
          {project.links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {project.links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-sunken px-2.5 py-1.5 text-xs hover:bg-line">
                  {l.label} <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="card p-5">
          <p className="label">Tiến độ có trọng số</p>
          <p className="num text-3xl font-semibold">{s.progress}%</p>
          <ProgressBar value={s.progress} className="mt-2 h-2" color={brand ? BRAND_STYLE[brand.color].bar : undefined} />
          <div className="mt-4 grid grid-cols-3 text-center text-xs text-ink-muted">
            <div>
              <p className="num text-lg font-semibold text-ink">{s.total}</p>Tổng việc
            </div>
            <div>
              <p className="num text-lg font-semibold text-ok">{s.completed}</p>Hoàn thành
            </div>
            <div>
              <p className={clsx('num text-lg font-semibold', s.overdue ? 'text-danger' : 'text-ink')}>{s.overdue}</p>Quá hạn
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <ViewTabs view={view} onChange={setView} />
      </div>

      {isAdmin && (
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            quickAdd()
          }}
        >
          <input className="input" placeholder="Thêm nhanh công việc: gõ tên rồi nhấn Enter…" value={quick} onChange={(e) => setQuick(e.target.value)} />
          <Button type="submit" loading={adding} icon={<Plus className="size-4" />}>
            Thêm
          </Button>
        </form>
      )}

      {view === 'list' ? (
        <TaskTable tasks={tasks} showProject={false} emptyTitle="Dự án chưa có công việc" emptyHint={isAdmin ? 'Thêm công việc để bắt đầu theo dõi tiến độ.' : undefined} />
      ) : (
        <TaskViews tasks={tasks} view={view} showProject={false} />
      )}

      {editing && <ProjectFormModal project={project} onClose={() => setEditing(false)} />}
      {creatingTask && <TaskFormModal open defaultBrandId={project.brand_id} defaultProjectId={project.id} onClose={() => setCreatingTask(false)} />}
    </>
  )
}
