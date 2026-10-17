export type UserRole = 'admin' | 'employee'

export type TaskStatus =
  | 'chua_bat_dau'
  | 'dang_thuc_hien'
  | 'cho_phan_hoi'
  | 'cho_duyet'
  | 'can_chinh_sua'
  | 'hoan_thanh'
  | 'tam_dung'
  | 'da_huy'

export type TaskPriority = 'thap' | 'trung_binh' | 'cao' | 'khan_cap'
export type ProjectStatus = 'len_ke_hoach' | 'dang_thuc_hien' | 'tam_dung' | 'hoan_thanh' | 'da_huy'
export type ReviewDecision = 'cho_duyet' | 'da_duyet' | 'yeu_cau_sua'
export type CommentKind = 'binh_luan' | 'tien_do' | 'vuong_mac'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  job_title: string | null
  responsibilities: string | null
  phone: string | null
  is_active: boolean
  is_demo: boolean
  email_notifications?: boolean
  created_at: string
}

export interface Invitation {
  email: string
  full_name: string
  role: UserRole
  job_title: string | null
  brand_ids: string[]
  token: string
  created_at: string
  accepted_at: string | null
}

export interface Brand {
  id: string
  slug: string
  name: string
  industry: string | null
  description: string | null
  color: BrandColor
  sort_order: number
  is_archived: boolean
}

export type BrandColor = 'terracotta' | 'teal' | 'deepblue' | 'dustypink'

export interface BrandMember {
  brand_id: string
  user_id: string
}

export interface LinkItem {
  label: string
  url: string
}

export interface Project {
  id: string
  brand_id: string
  name: string
  description: string | null
  goals: string | null
  notes: string | null
  owner_id: string | null
  status: ProjectStatus
  start_date: string | null
  due_date: string | null
  links: LinkItem[]
  is_demo: boolean
  created_at: string
}

export interface Task {
  id: string
  brand_id: string
  project_id: string | null
  title: string
  description: string | null
  primary_owner_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  start_date: string | null
  due_at: string | null
  original_due_at: string | null
  priority: TaskPriority
  weight: 1 | 2 | 3 | 5
  estimated_hours: number | null
  status: TaskStatus
  progress: number
  requires_approval: boolean
  is_blocked: boolean
  blocker_note: string | null
  links: LinkItem[]
  completion_evidence: string | null
  first_submitted_at: string | null
  submitted_at: string | null
  approved_at: string | null
  approved_by: string | null
  completed_at: string | null
  quality_score: number | null
  revision_count: number
  is_demo: boolean
  task_assignments?: { user_id: string }[]
}

export interface Subtask {
  id: string
  task_id: string
  title: string
  assignee_id: string | null
  due_date: string | null
  is_done: boolean
  sort_order: number
}

export interface ChecklistItem {
  id: string
  task_id: string
  title: string
  is_done: boolean
  sort_order: number
  created_by: string | null
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  kind: CommentKind
  body: string
  mentions: string[]
  created_at: string
}

export interface TaskAttachment {
  id: string
  task_id: string
  uploaded_by: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  is_evidence: boolean
  created_at: string
}

export interface TaskApproval {
  id: string
  task_id: string
  submitted_by: string | null
  submitted_at: string
  evidence: string | null
  decision: ReviewDecision
  reviewed_by: string | null
  reviewed_at: string | null
  quality_score: number | null
  feedback: string | null
}

export interface ActivityLog {
  id: number
  task_id: string | null
  project_id: string | null
  actor_id: string | null
  actor_role: UserRole | null
  action: string
  details: Record<string, unknown>
  created_at: string
}

export interface AppNotification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  task_id: string | null
  link?: string | null
  is_read: boolean
  created_at: string
}

// ---------- Giai đoạn 3 ----------
export type GoalType = 'cong_viec' | 'ket_qua_kinh_doanh'
export type GoalMetric = 'thu_cong' | 'so_viec' | 'trong_so'
export interface Goal {
  id: string
  brand_id: string
  name: string
  description: string | null
  goal_type: GoalType
  metric: GoalMetric
  period_type: 'thang' | 'quy'
  period_start: string
  period_end: string
  target_value: number
  actual_value: number
  unit: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
  goal_members?: { user_id: string }[]
  goal_tasks?: { task_id: string }[]
}
export interface GoalLog {
  id: string
  goal_id: string
  value: number
  note: string | null
  recorded_by: string | null
  recorded_at: string
}

export type ContentPlatform = 'facebook' | 'tiktok' | 'instagram' | 'youtube' | 'website' | 'shopee' | 'zalo' | 'khac'
export type ContentStage = 'chua_bat_dau' | 'dang_lam' | 'xong' | 'khong_can'
export type ContentApproval = 'chua_bat_dau' | 'cho_duyet' | 'da_duyet' | 'can_sua'
export interface ContentItem {
  id: string
  brand_id: string
  task_id: string | null
  platform: ContentPlatform
  topic: string
  content_type: string | null
  script_status: ContentStage
  filming_status: ContentStage
  editing_status: ContentStage
  approval_status: ContentApproval
  approval_note: string | null
  publish_date: string | null
  published_at: string | null
  responsible_id: string | null
  content_url: string | null
  views: number | null
  engagements: number | null
  leads: number | null
  notes: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
}
