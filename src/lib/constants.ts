import type { BrandColor, ProjectStatus, TaskPriority, TaskStatus } from './types'

export const STATUS_ORDER: TaskStatus[] = [
  'chua_bat_dau',
  'dang_thuc_hien',
  'cho_phan_hoi',
  'cho_duyet',
  'can_chinh_sua',
  'hoan_thanh',
  'tam_dung',
  'da_huy',
]

export const STATUS_LABEL: Record<TaskStatus, string> = {
  chua_bat_dau: 'Chưa bắt đầu',
  dang_thuc_hien: 'Đang thực hiện',
  cho_phan_hoi: 'Chờ phản hồi',
  cho_duyet: 'Chờ duyệt',
  can_chinh_sua: 'Cần chỉnh sửa',
  hoan_thanh: 'Hoàn thành',
  tam_dung: 'Tạm dừng',
  da_huy: 'Đã hủy',
}

export const STATUS_STYLE: Record<TaskStatus, string> = {
  chua_bat_dau: 'bg-sunken text-ink-soft',
  dang_thuc_hien: 'bg-info-soft text-info',
  cho_phan_hoi: 'bg-warn-soft text-warn',
  cho_duyet: 'bg-violet-soft text-violet',
  can_chinh_sua: 'bg-danger-soft text-danger',
  hoan_thanh: 'bg-ok-soft text-ok',
  tam_dung: 'bg-sunken text-ink-muted',
  da_huy: 'bg-sunken text-ink-muted line-through',
}

/** Trạng thái nhân viên được tự chuyển (phải khớp trigger tasks_before_update). */
export const EMPLOYEE_SETTABLE_STATUSES: TaskStatus[] = ['chua_bat_dau', 'dang_thuc_hien', 'cho_phan_hoi']
export const EMPLOYEE_EDITABLE_FROM: TaskStatus[] = ['chua_bat_dau', 'dang_thuc_hien', 'cho_phan_hoi', 'can_chinh_sua']
export const SUBMITTABLE_FROM: TaskStatus[] = ['chua_bat_dau', 'dang_thuc_hien', 'cho_phan_hoi', 'can_chinh_sua']

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  thap: 'Thấp',
  trung_binh: 'Trung bình',
  cao: 'Cao',
  khan_cap: 'Khẩn cấp',
}

export const PRIORITY_STYLE: Record<TaskPriority, string> = {
  thap: 'bg-sunken text-ink-soft',
  trung_binh: 'bg-info-soft text-info',
  cao: 'bg-warn-soft text-warn',
  khan_cap: 'bg-danger-soft text-danger',
}

export const PRIORITY_RANK: Record<TaskPriority, number> = { khan_cap: 0, cao: 1, trung_binh: 2, thap: 3 }

export const WEIGHT_OPTIONS = [
  { value: 1, label: 'Đơn giản (1)' },
  { value: 2, label: 'Trung bình (2)' },
  { value: 3, label: 'Phức tạp (3)' },
  { value: 5, label: 'Lớn (5)' },
] as const

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  len_ke_hoach: 'Lên kế hoạch',
  dang_thuc_hien: 'Đang thực hiện',
  tam_dung: 'Tạm dừng',
  hoan_thanh: 'Hoàn thành',
  da_huy: 'Đã hủy',
}

export const BRAND_STYLE: Record<BrandColor, { text: string; bg: string; soft: string; hex: string; bar: string }> = {
  terracotta: { text: 'text-terracotta', bg: 'bg-terracotta', soft: 'bg-terracotta-soft', hex: '#b0532c', bar: 'bg-terracotta' },
  teal: { text: 'text-teal', bg: 'bg-teal', soft: 'bg-teal-soft', hex: '#1c7f79', bar: 'bg-teal' },
  deepblue: { text: 'text-deepblue', bg: 'bg-deepblue', soft: 'bg-deepblue-soft', hex: '#24427f', bar: 'bg-deepblue' },
  dustypink: { text: 'text-dustypink', bg: 'bg-dustypink', soft: 'bg-dustypink-soft', hex: '#b5707a', bar: 'bg-dustypink' },
}

export const ACTIVITY_LABEL: Record<string, string> = {
  tao_cong_viec: 'đã tạo công việc',
  doi_trang_thai: 'đã đổi trạng thái',
  doi_han_chot: 'đã đổi hạn chót',
  cap_nhat_tien_do: 'đã cập nhật tiến độ',
  bao_vuong_mac: 'đã báo vướng mắc',
  go_vuong_mac: 'đã gỡ vướng mắc',
  sua_thong_tin: 'đã sửa thông tin',
  giao_viec: 'đã giao việc cho',
  bo_giao_viec: 'đã bỏ giao việc của',
  binh_luan: 'đã bình luận',
  ghi_chu_tien_do: 'đã ghi chú tiến độ',
  tai_tep: 'đã tải tệp',
  xoa_tep: 'đã xóa tệp',
  duyet: 'đã duyệt công việc',
  yeu_cau_sua: 'đã yêu cầu chỉnh sửa',
}

export const FIELD_LABEL: Record<string, string> = {
  title: 'tiêu đề',
  description: 'mô tả',
  priority: 'độ ưu tiên',
  weight: 'trọng số',
  estimated_hours: 'giờ ước tính',
  start_date: 'ngày bắt đầu',
  project_id: 'dự án',
  primary_owner_id: 'người phụ trách chính',
  requires_approval: 'yêu cầu duyệt',
  quality_score: 'điểm chất lượng',
}
