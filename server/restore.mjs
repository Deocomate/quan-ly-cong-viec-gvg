// Quy trình khôi phục dùng chung cho API và dòng lệnh: sao lưu trước, nhập, rồi (tùy chọn) gửi thư đặt mật khẩu.
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { exportBackup, importBackup } from './backup.mjs'

const KEEP_SNAPSHOTS = 20

export const backupFileName = (d = new Date()) => `du-lieu-${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`

/** Ghi bản sao lưu hiện tại ra đĩa (DATA_DIR/backups) và giữ lại tối đa 20 bản gần nhất. */
export async function snapshotToDisk(svc, prefix) {
  const dir = svc.config.backupDir
  await mkdir(dir, { recursive: true })
  const file = join(dir, `${prefix}-${backupFileName()}`)
  await writeFile(file, JSON.stringify(await exportBackup(svc.db), null, 2))
  const old = (await readdir(dir)).filter((f) => f.startsWith(`${prefix}-`)).sort().slice(0, -KEEP_SNAPSHOTS)
  await Promise.all(old.map((f) => unlink(join(dir, f)).catch(() => {})))
  return file
}

export async function restoreFromData(svc, raw, { mode = 'merge', notify = false } = {}) {
  let snapshot
  try {
    snapshot = await snapshotToDisk(svc, 'truoc-khi-nhap')
  } catch (e) {
    throw new Error(`Không ghi được bản sao lưu an toàn trước khi nhập (${e.message}). Kiểm tra thư mục dữ liệu (volume /data) có quyền ghi.`)
  }
  const result = await importBackup(svc.db, raw, { mode, provisionUser: (c, u) => svc.provisionUser(c, u) })
  const mails = notify && svc.mailReady && result.createdUsers.length ? await svc.sendRestoredAccountMails(result.createdUsers) : null
  return { ...result, snapshot, mails }
}
