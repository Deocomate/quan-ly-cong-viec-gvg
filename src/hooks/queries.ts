import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { db } from '../lib/backend'
import type {
  ActivityLog,
  AppNotification,
  Brand,
  BrandMember,
  ChecklistItem,
  Invitation,
  Profile,
  Project,
  Subtask,
  Task,
  TaskApproval,
  TaskAttachment,
  TaskComment,
  Goal,
  GoalLog,
  ContentItem,
} from '../lib/types'

async function run<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export const qk = {
  brands: ['brands'] as const,
  brandMembers: ['brand_members'] as const,
  profiles: ['profiles'] as const,
  invitations: ['invitations'] as const,
  projects: ['projects'] as const,
  tasks: ['tasks'] as const,
  task: (id: string) => ['task', id] as const,
  taskPart: (part: string, id: string) => ['task', id, part] as const,
  notifications: ['notifications'] as const,
}

const TASK_SELECT = '*, task_assignments(user_id)'

export const useBrands = () =>
  useQuery({
    queryKey: qk.brands,
    queryFn: () => run<Brand[]>(db().from('brands').select('*').eq('is_archived', false).order('sort_order')),
    staleTime: 5 * 60_000,
  })

export const useBrandMembers = () =>
  useQuery({
    queryKey: qk.brandMembers,
    queryFn: () => run<BrandMember[]>(db().from('brand_members').select('brand_id, user_id')),
  })

export const useProfiles = () =>
  useQuery({
    queryKey: qk.profiles,
    queryFn: () => run<Profile[]>(db().from('profiles').select('*').order('full_name')),
  })

export const useInvitations = (enabled: boolean) =>
  useQuery({
    queryKey: qk.invitations,
    enabled,
    queryFn: () => run<Invitation[]>(db().from('invitations').select('*').order('created_at', { ascending: false })),
  })

export const useProjects = () =>
  useQuery({
    queryKey: qk.projects,
    queryFn: () => run<Project[]>(db().from('projects').select('*').order('created_at', { ascending: false })),
  })

export const useTasks = () =>
  useQuery({
    queryKey: qk.tasks,
    queryFn: () => run<Task[]>(db().from('tasks').select(TASK_SELECT).order('due_at', { ascending: true, nullsFirst: false })),
  })

export const useTask = (id: string) =>
  useQuery({
    queryKey: qk.task(id),
    queryFn: () => run<Task | null>(db().from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()),
  })

export const useChecklist = (taskId: string) =>
  useQuery({
    queryKey: qk.taskPart('checklist', taskId),
    queryFn: () =>
      run<ChecklistItem[]>(db().from('checklist_items').select('*').eq('task_id', taskId).order('sort_order').order('created_at')),
  })

export const useSubtasks = (taskId: string) =>
  useQuery({
    queryKey: qk.taskPart('subtasks', taskId),
    queryFn: () => run<Subtask[]>(db().from('subtasks').select('*').eq('task_id', taskId).order('sort_order').order('created_at')),
  })

export const useComments = (taskId: string) =>
  useQuery({
    queryKey: qk.taskPart('comments', taskId),
    queryFn: () => run<TaskComment[]>(db().from('task_comments').select('*').eq('task_id', taskId).order('created_at')),
  })

export const useAttachments = (taskId: string) =>
  useQuery({
    queryKey: qk.taskPart('attachments', taskId),
    queryFn: () =>
      run<TaskAttachment[]>(db().from('task_attachments').select('*').eq('task_id', taskId).order('created_at', { ascending: false })),
  })

export const useApprovals = (taskId: string) =>
  useQuery({
    queryKey: qk.taskPart('approvals', taskId),
    queryFn: () =>
      run<TaskApproval[]>(db().from('task_approvals').select('*').eq('task_id', taskId).order('submitted_at', { ascending: false })),
  })

export const useActivity = (taskId: string) =>
  useQuery({
    queryKey: qk.taskPart('activity', taskId),
    queryFn: () =>
      run<ActivityLog[]>(db().from('activity_logs').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(200)),
  })

export const useNotifications = (userId: string | undefined) =>
  useQuery({
    queryKey: qk.notifications,
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    queryFn: () =>
      run<AppNotification[]>(
        db().from('notifications').select('*').eq('user_id', userId!).order('created_at', { ascending: false }).limit(100),
      ),
  })

/** Tra cứu nhanh theo id */
export function useLookups() {
  const brands = useBrands()
  const profiles = useProfiles()
  const projects = useProjects()
  const maps = useMemo(
    () => ({
      brandById: new Map((brands.data ?? []).map((b) => [b.id, b])),
      profileById: new Map((profiles.data ?? []).map((p) => [p.id, p])),
      projectById: new Map((projects.data ?? []).map((p) => [p.id, p])),
    }),
    [brands.data, profiles.data, projects.data],
  )
  return {
    ...maps,
    brands: brands.data ?? [],
    profiles: profiles.data ?? [],
    projects: projects.data ?? [],
    isLoading: brands.isLoading || profiles.isLoading || projects.isLoading,
    error: brands.error || profiles.error || projects.error,
  }
}

/** Làm mới mọi dữ liệu liên quan đến công việc sau khi thay đổi */
export function useInvalidateTask() {
  const qc = useQueryClient()
  return (taskId?: string) => {
    qc.invalidateQueries({ queryKey: qk.tasks })
    qc.invalidateQueries({ queryKey: qk.notifications })
    if (taskId) qc.invalidateQueries({ queryKey: qk.task(taskId) })
  }
}

export interface RecurringRule {
  id: string
  brand_id: string
  project_id: string | null
  title: string
  description: string | null
  frequency: 'daily' | 'weekly' | 'monthly'
  weekdays: number[]
  day_of_month: number | null
  due_time: string
  assignee_ids: string[]
  primary_owner_id: string | null
  priority: Task['priority']
  weight: number
  estimated_hours: number | null
  requires_approval: boolean
  starts_on: string
  ends_on: string | null
  is_active: boolean
  last_generated_on: string | null
  created_at: string
}

export const useRecurringRules = () =>
  useQuery({
    queryKey: ['recurring_rules'],
    queryFn: () => run<RecurringRule[]>(db().from('recurring_task_rules').select('*').order('created_at', { ascending: false })),
  })

export const useSetting = <T,>(key: string, fallback: T) =>
  useQuery({
    queryKey: ['setting', key],
    queryFn: async () => {
      const row = await run<{ value: T } | null>(db().from('app_settings').select('value').eq('key', key).maybeSingle())
      return row?.value ?? fallback
    },
  })

export const useGoals = () =>
  useQuery({
    queryKey: ['goals'],
    queryFn: () =>
      run<Goal[]>(db().from('goals').select('*, goal_members(user_id), goal_tasks(task_id)').order('period_start', { ascending: false }).order('created_at')),
  })

export const useGoalLogs = (goalId: string) =>
  useQuery({
    queryKey: ['goal_logs', goalId],
    queryFn: () => run<GoalLog[]>(db().from('goal_progress_logs').select('*').eq('goal_id', goalId).order('recorded_at')),
  })

export const useContent = () =>
  useQuery({
    queryKey: ['content'],
    queryFn: () => run<ContentItem[]>(db().from('content_items').select('*').order('publish_date', { ascending: true, nullsFirst: false })),
  })
