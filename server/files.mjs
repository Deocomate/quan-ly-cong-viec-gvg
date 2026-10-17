// Tệp đính kèm lưu trên đĩa (DATA_DIR/files). Quyền tải lên / xem / xóa do chính sách RLS trên storage.objects quyết định.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const BUCKET = 'task-files'
const PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[\w.-]{1,200}$/
export const MAX_FILE_BYTES = 50 * 1024 * 1024
const SIGN_TTL_MS = 5 * 60_000

export class FileError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export function createFiles(db, filesDir) {
  const diskPath = (p) => {
    if (!PATH_RE.test(p) || p.includes('..')) throw new FileError('Đường dẫn tệp không hợp lệ.')
    return join(filesDir, p)
  }

  let secretPromise
  const secret = () =>
    (secretPromise ??= db
      .tx(async (c) => {
        const value = randomBytes(32).toString('hex')
        await c.query(`insert into app_private.secrets (name, value) values ('files_hmac', $1) on conflict (name) do nothing`, [value])
        return (await c.query(`select value from app_private.secrets where name = 'files_hmac'`)).rows[0].value
      })
      .catch((e) => {
        secretPromise = undefined // lỗi tạm thời không được chặn việc ký tệp đến khi khởi động lại
        throw e
      }))
  const mac = async (path, exp) => createHmac('sha256', await secret()).update(`${path}|${exp}`).digest('base64url')

  return {
    /**
     * Ghi tệp tạm TRƯỚC khi lấy khóa CSDL (ghi 50 MB không chặn người khác), rồi trong giao dịch: ghi bản ghi
     * storage.objects (RLS kiểm quyền, chỉ mục duy nhất chặn ghi đè) và đổi tên tệp tạm vào chỗ — thao tác tức thời.
     */
    async upload(userId, path, buffer) {
      const file = diskPath(path)
      if (buffer.length > MAX_FILE_BYTES) throw new FileError('Tệp vượt quá 50 MB.', 413)
      const tmp = join(filesDir, '.tmp', randomUUID())
      await mkdir(dirname(tmp), { recursive: true })
      await writeFile(tmp, buffer)
      let placed = false
      try {
        await db.asUser(userId, async (c) => {
          try {
            await c.query('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', [BUCKET, path, userId])
          } catch (e) {
            if (e.code === '23505') throw new FileError('Đã có tệp trùng đường dẫn này.', 409)
            throw new FileError('Bạn không có quyền tải tệp lên công việc này.', 403)
          }
          await mkdir(dirname(file), { recursive: true })
          await rename(tmp, file)
          placed = true
        })
      } catch (e) {
        if (placed) await unlink(file).catch(() => {}) // giao dịch không commit được: bỏ tệp vừa đặt
        throw e
      } finally {
        await unlink(tmp).catch(() => {})
      }
    },

    /** Trả về đường dẫn tải có chữ ký, hiệu lực 5 phút, nếu người dùng xem được tệp. */
    async sign(userId, path) {
      diskPath(path)
      const ok = await db.asUser(userId, (c) => c.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [BUCKET, path]))
      if (!ok.rows.length) throw new FileError('Không tìm thấy tệp hoặc bạn không có quyền xem.', 404)
      const exp = Date.now() + SIGN_TTL_MS
      return `/api/files/download?p=${encodeURIComponent(path)}&e=${exp}&s=${await mac(path, exp)}`
    },

    /** Kiểm tra chữ ký và trả về { file, name, mime } để phục vụ tệp. */
    async resolveDownload(path, exp, sig) {
      const file = diskPath(path)
      const good = await mac(path, exp)
      const a = Buffer.from(String(sig))
      const b = Buffer.from(good)
      if (!(Number(exp) > Date.now()) || a.length !== b.length || !timingSafeEqual(a, b)) throw new FileError('Liên kết tải tệp đã hết hạn.', 403)
      const meta = (await db.run((c) => c.query('select file_name, mime_type from public.task_attachments where storage_path = $1', [path]))).rows[0]
      return { file, name: meta?.file_name ?? 'tep', mime: meta?.mime_type || 'application/octet-stream' }
    },

    async remove(userId, paths) {
      for (const p of paths) diskPath(p)
      const { rows } = await db.asUser(userId, (c) => c.query('delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [BUCKET, paths]))
      await Promise.all(rows.map((r) => unlink(diskPath(r.name)).catch(() => {})))
      return rows.map((r) => r.name)
    },
  }
}
