import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarRange, ChevronLeft, ChevronRight, ExternalLink, List, Plus, Send, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, Badge, Button, DemoTag, EmptyState, ErrorBox, Field, fmtNum, Loading, Modal, PageHeader, ProgressBar, StatCard, useConfirm, useToast } from '../components/ui'
import { useAuth, useMe } from '../contexts/AuthContext'
import { qk, useBrandMembers, useContent, useLookups } from '../hooks/queries'
import { BRAND_STYLE } from '../lib/constants'
import { addDays, dueAtFromDateKey, fmtDateKey, fmtDateTime, vnDateKey, vnStartOfDateKey, vnWeekday } from '../lib/dates'
import {
  APPROVAL_LABEL,
  APPROVAL_STYLE,
  CONTENT_STATE_LABEL,
  contentProgress,
  contentState,
  contentSummary,
  PLATFORM_LABEL,
  STAGE_LABEL,
  STAGE_STYLE,
} from '../lib/phase3'
import { db } from '../lib/backend'
import type { ContentItem, ContentPlatform, ContentStage } from '../lib/types'

const STATE_STYLE: Record<ReturnType<typeof contentState>, string> = {
  da_dang: 'bg-ok-soft text-ok',
  san_sang: 'bg-info-soft text-info',
  dang_san_xuat: 'bg-sunken text-ink-soft',
  tre: 'bg-danger-soft text-danger',
  chua_len_lich: 'bg-sunken text-ink-muted',
}
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const monthBounds = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}
const shiftMonth = (ym: string, d: number) => {
  const [y, m] = ym.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1 + d, 1))
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`
}

export function ContentCalendarPage() {
  const q = useContent()
  const { isAdmin } = useAuth()
  const me = useMe()
  const { brands, brandById, profiles, isLoading } = useLookups()
  const [params, setParams] = useSearchParams()
  const [month, setMonth] = useState(vnDateKey(new Date()).slice(0, 7))
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [brandId, setBrandId] = useState('')
  const [platform, setPlatform] = useState('')
  const [person, setPerson] = useState('')
  const [creating, setCreating] = useState<string | null>(null) // ngày mặc định
  const openId = params.get('id')

  const items = useMemo(
    () =>
      (q.data ?? []).filter(
        (c) => (!brandId || c.brand_id === brandId) && (!platform || c.platform === platform) && (!person || c.responsible_id === person),
      ),
    [q.data, brandId, platform, person],
  )
  if (q.isLoading || isLoading) return <Loading />
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />

  const { from, to } = monthBounds(month)
  const sum = contentSummary(items, from, to)
  const todayKey = vnDateKey(new Date())
  const first = vnStartOfDateKey(from)
  const gridStart = addDays(first, -(vnWeekday(first) - 1))
  const days = Array.from({ length: 42 }, (_, i) => vnDateKey(addDays(gridStart, i)))
  const weeks = days[35] > to ? 5 : 6
  const byDay = new Map<string, ContentItem[]>()
  for (const c of items) if (c.publish_date) byDay.set(c.publish_date, [...(byDay.get(c.publish_date) ?? []), c])
  const listItems = items.filter((c) => !c.publish_date || (c.publish_date >= from && c.publish_date <= to))
  const unscheduled = items.filter((c) => !c.publish_date)
  const current = openId ? (q.data ?? []).find((c) => c.id === openId) : undefined
  const open = (id: string) => setParams({ id })
  const close = () => setParams({})
  const [y, m] = month.split('-')

  const chip = (c: ContentItem) => {
    const b = brandById.get(c.brand_id)
    const st = b ? BRAND_STYLE[b.color] : BRAND_STYLE.terracotta
    const state = contentState(c)
    return (
      <button
        key={c.id}
        onClick={() => open(c.id)}
        title={`${c.topic} · ${PLATFORM_LABEL[c.platform]} · ${CONTENT_STATE_LABEL[state]}`}
        style={{ borderLeftColor: st.hex }}
        className={clsx('block w-full truncate rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight', st.soft, state === 'tre' && 'ring-1 ring-danger/50')}
      >
        <span className="font-semibold text-ink-soft">{PLATFORM_LABEL[c.platform]}</span> <span className={clsx('font-medium', st.text)}>{c.topic}</span>
        {state === 'da_dang' && ' ✓'}
      </button>
    )
  }

  return (
    <>
      <PageHeader
        title="Lịch nội dung"
        subtitle="Kế hoạch đăng bài theo màu thương hiệu: kịch bản → quay → dựng → duyệt → đăng, kèm số liệu sau đăng."
        actions={
          <>
            <div className="inline-flex rounded-xl bg-sunken p-1">
              {(
                [
                  ['calendar', 'Lịch', <CalendarRange key="c" className="size-4" />],
                  ['list', 'Danh sách', <List key="l" className="size-4" />],
                ] as const
              ).map(([k, l, ic]) => (
                <button key={k} onClick={() => setView(k)} className={clsx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm', view === k ? 'bg-surface font-medium shadow-sm' : 'text-ink-soft')}>
                  {ic} {l}
                </button>
              ))}
            </div>
            {isAdmin && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(todayKey)}>
                Thêm nội dung
              </Button>
            )}
          </>
        }
      />

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Tháng trước" icon={<ChevronLeft className="size-4" />} onClick={() => setMonth(shiftMonth(month, -1))} />
          <span className="min-w-28 text-center text-sm font-semibold">
            Tháng {Number(m)}/{y}
          </span>
          <Button size="sm" variant="ghost" aria-label="Tháng sau" icon={<ChevronRight className="size-4" />} onClick={() => setMonth(shiftMonth(month, 1))} />
        </div>
        <select className="input w-auto" value={brandId} onChange={(e) => setBrandId(e.target.value)} aria-label="Lọc thương hiệu">
          <option value="">Tất cả thương hiệu</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Lọc kênh">
          <option value="">Mọi kênh</option>
          {Object.entries(PLATFORM_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Lọc người phụ trách">
          <option value="">Mọi người</option>
          <option value={me.id}>Nội dung của tôi</option>
          {profiles
            .filter((p) => p.is_active && p.id !== me.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
        </select>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Bài dự kiến trong tháng" value={sum.planned} />
        <StatCard label="Đã đăng" value={sum.published} tone="ok" />
        <StatCard label="Trễ lịch đăng" value={sum.late} tone="danger" />
        <StatCard label="Chờ duyệt" value={sum.waiting} tone="violet" />
        <StatCard label="Lượt xem (bài đã đăng)" value={fmtNum(sum.views)} hint={sum.engagementRate != null ? `Tỷ lệ tương tác ${fmtNum(sum.engagementRate)}%` : undefined} tone="info" />
        <StatCard label="Khách tiềm năng" value={fmtNum(sum.leads)} tone="warn" />
      </div>

      {view === 'calendar' ? (
        <>
          <div className="card hidden overflow-hidden md:block">
            <div className="grid grid-cols-7 border-b border-line bg-sunken/50 text-center text-xs font-medium text-ink-soft">
              {WD.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.slice(0, weeks * 7).map((k) => {
                const list = byDay.get(k) ?? []
                const inMonth = k >= from && k <= to
                return (
                  <div key={k} className={clsx('group min-h-28 border-t border-l border-line p-1.5', !inMonth && 'bg-sunken/50')}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className={clsx('flex size-6 items-center justify-center rounded-full text-xs', k === todayKey ? 'bg-ink font-semibold text-white' : inMonth ? 'text-ink-soft' : 'text-ink-muted')}>
                        {Number(k.slice(8))}
                      </span>
                      {isAdmin && (
                        <button onClick={() => setCreating(k)} className="rounded p-0.5 text-ink-muted opacity-0 group-hover:opacity-100 hover:bg-sunken" aria-label={`Thêm nội dung ngày ${fmtDateKey(k)}`}>
                          <Plus className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">{list.map(chip)}</div>
                  </div>
                )
              })}
            </div>
          </div>
          {/* Điện thoại: danh sách theo ngày */}
          <div className="space-y-3 md:hidden">
            {days
              .filter((k) => k >= from && k <= to && byDay.has(k))
              .map((k) => (
                <div key={k} className="card p-3">
                  <p className={clsx('mb-2 text-sm font-semibold', k === todayKey && 'text-danger')}>
                    {k === todayKey ? 'Hôm nay · ' : ''}
                    {WD[vnWeekday(vnStartOfDateKey(k)) - 1]}, {fmtDateKey(k)}
                  </p>
                  <div className="space-y-1.5">{byDay.get(k)!.map(chip)}</div>
                </div>
              ))}
            {sum.planned === 0 && (
              <div className="card">
                <EmptyState title="Chưa có nội dung trong tháng" />
              </div>
            )}
          </div>
          {unscheduled.length > 0 && (
            <div className="card mt-4 p-3">
              <p className="mb-2 text-sm font-semibold">Chưa có ngày đăng ({unscheduled.length})</p>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{unscheduled.map(chip)}</div>
            </div>
          )}
        </>
      ) : (
        <ContentTable items={listItems} onOpen={open} />
      )}

      {creating && <ContentModal defaultDate={creating} onClose={() => setCreating(null)} />}
      {current && <ContentModal item={current} onClose={close} />}
      {openId && !current && !q.isFetching && (
        <Modal open onClose={close} title="Không tìm thấy nội dung">
          <p className="text-sm text-ink-soft">Nội dung đã bị xóa hoặc bạn không có quyền xem.</p>
        </Modal>
      )}
    </>
  )
}

function ContentTable({ items, onOpen }: { items: ContentItem[]; onOpen: (id: string) => void }) {
  const { brandById, profileById } = useLookups()
  if (!items.length)
    return (
      <div className="card">
        <EmptyState title="Chưa có nội dung trong tháng" />
      </div>
    )
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-line text-left text-xs text-ink-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Ngày đăng</th>
            <th className="px-2 py-2 font-medium">Chủ đề</th>
            <th className="px-2 py-2 font-medium">Kịch bản</th>
            <th className="px-2 py-2 font-medium">Quay</th>
            <th className="px-2 py-2 font-medium">Dựng</th>
            <th className="px-2 py-2 font-medium">Duyệt</th>
            <th className="px-2 py-2 font-medium">Trạng thái</th>
            <th className="px-4 py-2 text-right font-medium">Xem · Tương tác · Khách</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((c) => {
            const b = brandById.get(c.brand_id)
            const state = contentState(c)
            return (
              <tr key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer hover:bg-[#fcfaf7]">
                <td className="num px-4 py-2.5 whitespace-nowrap">{fmtDateKey(c.publish_date)}</td>
                <td className="max-w-72 px-2 py-2.5">
                  <p className="truncate font-medium">{c.topic}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-muted">
                    <span className={clsx('size-2 rounded-full', b ? BRAND_STYLE[b.color].bg : 'bg-line')} /> {b?.name} · {PLATFORM_LABEL[c.platform]}
                    {c.responsible_id && ` · ${profileById.get(c.responsible_id)?.full_name ?? ''}`}
                    {c.is_demo && <DemoTag />}
                  </p>
                </td>
                {[c.script_status, c.filming_status, c.editing_status].map((s, i) => (
                  <td key={i} className="px-2 py-2.5">
                    <Badge className={STAGE_STYLE[s]}>{STAGE_LABEL[s]}</Badge>
                  </td>
                ))}
                <td className="px-2 py-2.5">
                  <Badge className={APPROVAL_STYLE[c.approval_status]}>{APPROVAL_LABEL[c.approval_status]}</Badge>
                </td>
                <td className="px-2 py-2.5">
                  <Badge className={STATE_STYLE[state]}>{CONTENT_STATE_LABEL[state]}</Badge>
                </td>
                <td className="num px-4 py-2.5 text-right whitespace-nowrap text-ink-soft">
                  {c.published_at ? `${fmtNum(c.views ?? 0)} · ${fmtNum(c.engagements ?? 0)} · ${fmtNum(c.leads ?? 0)}` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const STAGES: [keyof Pick<ContentItem, 'script_status' | 'filming_status' | 'editing_status'>, string][] = [
  ['script_status', 'Kịch bản'],
  ['filming_status', 'Quay / chụp'],
  ['editing_status', 'Dựng / thiết kế'],
]

function ContentModal({ item, defaultDate, onClose }: { item?: ContentItem; defaultDate?: string; onClose: () => void }) {
  const { isAdmin } = useAuth()
  const me = useMe()
  const { brands, brandById, profiles, profileById } = useLookups()
  const members = useBrandMembers()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const isResponsible = item?.responsible_id === me.id
  const canEditAll = isAdmin
  const canWork = isAdmin || isResponsible
  const [f, setF] = useState({
    brand_id: item?.brand_id ?? '',
    platform: item?.platform ?? ('facebook' as ContentPlatform),
    topic: item?.topic ?? '',
    content_type: item?.content_type ?? '',
    publish_date: item?.publish_date ?? defaultDate ?? '',
    responsible_id: item?.responsible_id ?? '',
    script_status: item?.script_status ?? ('chua_bat_dau' as ContentStage),
    filming_status: item?.filming_status ?? ('chua_bat_dau' as ContentStage),
    editing_status: item?.editing_status ?? ('chua_bat_dau' as ContentStage),
    content_url: item?.content_url ?? '',
    views: item?.views?.toString() ?? '',
    engagements: item?.engagements?.toString() ?? '',
    leads: item?.leads?.toString() ?? '',
    notes: item?.notes ?? '',
  })
  const [reviewNote, setReviewNote] = useState('')
  const [busy, setBusy] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })
  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s.replace(/[.\s]/g, '').replace(',', '.')))))
  const memberIds = new Set((members.data ?? []).filter((m) => m.brand_id === f.brand_id).map((m) => m.user_id))
  const brand = brandById.get(f.brand_id)

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['content'] })
    qc.invalidateQueries({ queryKey: qk.notifications })
  }
  const workFields = () => ({
    script_status: f.script_status,
    filming_status: f.filming_status,
    editing_status: f.editing_status,
    content_url: f.content_url.trim() || null,
    views: num(f.views),
    engagements: num(f.engagements),
    leads: num(f.leads),
    notes: f.notes.trim() || null,
  })
  const patch = async (key: string, values: Record<string, unknown>, ok: string, closeAfter = false) => {
    if (!item) return
    setBusy(key)
    const { error } = await db().from('content_items').update(values).eq('id', item.id)
    setBusy('')
    if (error) return toast.error(error)
    refresh()
    toast.ok(ok)
    if (closeAfter) onClose()
  }

  const save = async () => {
    if (!f.brand_id) return toast.error('Vui lòng chọn thương hiệu')
    if (!f.topic.trim()) return toast.error('Vui lòng nhập chủ đề')
    for (const k of ['views', 'engagements', 'leads'] as const) if (f[k].trim() && Number.isNaN(num(f[k]))) return toast.error('Số liệu phải là số')
    const values = canEditAll
      ? {
          ...workFields(),
          brand_id: f.brand_id,
          platform: f.platform,
          topic: f.topic.trim(),
          content_type: f.content_type.trim() || null,
          publish_date: f.publish_date || null,
          responsible_id: f.responsible_id || null,
        }
      : workFields()
    if (item) return patch('save', values, 'Đã lưu nội dung', true)
    setBusy('save')
    const { error } = await db().from('content_items').insert(values)
    setBusy('')
    if (error) return toast.error(error)
    refresh()
    toast.ok('Đã thêm nội dung')
    onClose()
  }

  const createTask = async () => {
    if (!item) return
    setBusy('task')
    const { data, error } = await db()
      .from('tasks')
      .insert({
        brand_id: item.brand_id,
        title: `${PLATFORM_LABEL[item.platform]}: ${item.topic}`,
        description: [item.content_type, item.notes].filter(Boolean).join('\n') || null,
        primary_owner_id: item.responsible_id,
        due_at: item.publish_date ? dueAtFromDateKey(item.publish_date) : null,
      })
      .select('id')
      .single()
    if (error) {
      setBusy('')
      return toast.error(error)
    }
    const taskId = (data as { id: string }).id
    if (item.responsible_id) await db().rpc('set_task_assignees', { p_task: taskId, p_users: [item.responsible_id] })
    const { error: e2 } = await db().from('content_items').update({ task_id: taskId }).eq('id', item.id)
    setBusy('')
    if (e2) return toast.error(e2)
    refresh()
    qc.invalidateQueries({ queryKey: qk.tasks })
    toast.ok('Đã tạo công việc và liên kết với nội dung')
  }

  const remove = async () => {
    if (!item) return
    if (!(await confirm({ title: 'Xóa nội dung?', message: 'Nội dung sẽ bị xóa khỏi lịch. Công việc liên kết (nếu có) vẫn giữ nguyên.', confirmLabel: 'Xóa', danger: true }))) return
    const { error } = await db().from('content_items').delete().eq('id', item.id)
    if (error) return toast.error(error)
    refresh()
    toast.ok('Đã xóa nội dung')
    onClose()
  }

  const stageSelect = (k: (typeof STAGES)[number][0], label: string) => (
    <Field key={k} label={label}>
      <select className="input" disabled={!canWork} value={f[k]} onChange={(e) => set(k, e.target.value as ContentStage)}>
        {(Object.keys(STAGE_LABEL) as ContentStage[]).map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
    </Field>
  )

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={item ? item.topic : 'Thêm nội dung'}
      footer={
        <>
          {item && isAdmin && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              Xóa
            </Button>
          )}
          <Button onClick={onClose}>{canWork ? 'Hủy' : 'Đóng'}</Button>
          {canWork && (
            <Button variant="primary" loading={busy === 'save'} onClick={save}>
              {item ? 'Lưu' : 'Thêm nội dung'}
            </Button>
          )}
        </>
      }
    >
      {item && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge className={STATE_STYLE[contentState(item)]}>{CONTENT_STATE_LABEL[contentState(item)]}</Badge>
          <Badge className={APPROVAL_STYLE[item.approval_status]}>{APPROVAL_LABEL[item.approval_status]}</Badge>
          <span className="w-28">
            <ProgressBar value={contentProgress(item)} />
          </span>
          <span className="num text-xs text-ink-muted">{contentProgress(item)}% sản xuất</span>
          {item.is_demo && <DemoTag />}
          {item.published_at && <span className="text-xs text-ink-muted">· Đăng lúc {fmtDateTime(item.published_at)}</span>}
        </div>
      )}
      {item?.approval_status === 'can_sua' && item.approval_note && (
        <p className="mb-4 rounded-xl bg-warn-soft p-3 text-sm text-warn">Quản lý yêu cầu sửa: {item.approval_note}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Chủ đề *" className="sm:col-span-2">
          <input autoFocus={!item} className="input" disabled={!canEditAll} value={f.topic} onChange={(e) => set('topic', e.target.value)} placeholder="VD: Ý nghĩa bình hút lộc đặt phòng khách" />
        </Field>
        <Field label="Thương hiệu *">
          <select className="input" disabled={!canEditAll} value={f.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
            <option value="">— Chọn —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kênh">
          <select className="input" disabled={!canEditAll} value={f.platform} onChange={(e) => set('platform', e.target.value as ContentPlatform)}>
            {Object.entries(PLATFORM_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngày đăng dự kiến">
          <input type="date" className="input" disabled={!canEditAll} value={f.publish_date} onChange={(e) => set('publish_date', e.target.value)} />
        </Field>
        <Field label="Loại nội dung">
          <input className="input" disabled={!canEditAll} value={f.content_type} onChange={(e) => set('content_type', e.target.value)} placeholder="Video ngắn, bài viết, livestream…" />
        </Field>
        <Field label="Người phụ trách" className="sm:col-span-2">
          {canEditAll ? (
            <select className="input" value={f.responsible_id} onChange={(e) => set('responsible_id', e.target.value)}>
              <option value="">— Chưa giao —</option>
              {profiles
                .filter((p) => p.is_active && (!f.brand_id || memberIds.has(p.id) || p.id === f.responsible_id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
            </select>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              <Avatar profile={profileById.get(f.responsible_id)} size={22} /> {profileById.get(f.responsible_id)?.full_name ?? '—'}
            </span>
          )}
        </Field>
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">{STAGES.map(([k, l]) => stageSelect(k, l))}</div>
        <Field label="Đường dẫn bài đăng" className="sm:col-span-2">
          <div className="flex gap-2">
            <input className="input" disabled={!canWork} value={f.content_url} onChange={(e) => set('content_url', e.target.value)} placeholder="https://…" />
            {item?.content_url && (
              <a href={item.content_url} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-xl px-3 text-ink-soft hover:bg-sunken hover:text-ink" aria-label="Mở bài đăng">
                <ExternalLink className="size-4" />
              </a>
            )}
          </div>
        </Field>
        <Field label="Lượt xem">
          <input className="input" inputMode="numeric" disabled={!canWork} value={f.views} onChange={(e) => set('views', e.target.value)} />
        </Field>
        <Field label="Tương tác">
          <input className="input" inputMode="numeric" disabled={!canWork} value={f.engagements} onChange={(e) => set('engagements', e.target.value)} />
        </Field>
        <Field label="Khách tiềm năng">
          <input className="input" inputMode="numeric" disabled={!canWork} value={f.leads} onChange={(e) => set('leads', e.target.value)} />
        </Field>
        <Field label="Ghi chú" className="sm:col-span-2">
          <textarea className="input min-h-16" disabled={!canWork} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </div>

      {item && (
        <div className="mt-5 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {canWork && ['chua_bat_dau', 'can_sua'].includes(item.approval_status) && (
              <Button icon={<Send className="size-4" />} loading={busy === 'send'} onClick={() => patch('send', { ...workFields(), approval_status: 'cho_duyet' }, 'Đã gửi nội dung đi duyệt')}>
                Gửi duyệt
              </Button>
            )}
            {canWork && !item.published_at && (
              <Button loading={busy === 'pub'} onClick={() => patch('pub', { ...workFields(), published_at: new Date().toISOString() }, 'Đã đánh dấu đã đăng')}>
                Đánh dấu đã đăng
              </Button>
            )}
            {canWork && item.published_at && (
              <Button variant="ghost" loading={busy === 'unpub'} onClick={() => patch('unpub', { published_at: null }, 'Đã bỏ đánh dấu đã đăng')}>
                Bỏ đánh dấu đã đăng
              </Button>
            )}
            {item.task_id ? (
              <Link to={`/cong-viec/${item.task_id}`} className="text-sm text-info hover:underline">
                Xem công việc liên kết →
              </Link>
            ) : (
              isAdmin && (
                <Button variant="ghost" loading={busy === 'task'} onClick={createTask}>
                  Tạo công việc từ nội dung này
                </Button>
              )
            )}
          </div>
          {isAdmin && item.approval_status === 'cho_duyet' && (
            <div className="rounded-xl border border-line p-3">
              <p className="mb-2 text-sm font-medium">Duyệt nội dung</p>
              <textarea className="input mb-2 min-h-14" placeholder="Nội dung cần sửa (bắt buộc khi yêu cầu sửa)" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="primary" loading={busy === 'ok'} onClick={() => patch('ok', { approval_status: 'da_duyet', approval_note: reviewNote.trim() || null }, 'Đã duyệt nội dung')}>
                  Duyệt nội dung
                </Button>
                <Button
                  loading={busy === 'fix'}
                  onClick={() => (reviewNote.trim() ? patch('fix', { approval_status: 'can_sua', approval_note: reviewNote.trim() }, 'Đã gửi yêu cầu sửa') : toast.error('Nhập nội dung cần sửa'))}
                >
                  Yêu cầu sửa
                </Button>
              </div>
            </div>
          )}
          {!canWork && <p className="text-xs text-ink-muted">Bạn đang xem. Chỉ quản trị viên và người phụ trách được cập nhật nội dung này.</p>}
        </div>
      )}
      {!item && brand && <p className="mt-3 text-xs text-ink-muted">Người phụ trách sẽ nhận thông báo trong ứng dụng.</p>}
    </Modal>
  )
}
