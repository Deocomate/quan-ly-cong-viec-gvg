// Khóa thư mục dữ liệu: CSDL nhúng chỉ cho phép một tiến trình ghi. Khi Coolify triển khai bản mới, container cũ
// còn chạy vài giây — bản mới chờ bản cũ nhả khóa (hoặc ngừng "nhịp tim" quá lâu) rồi mới mở CSDL.
import { randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rename, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * - Nhịp tim 5 giây; khóa coi là bỏ rơi sau 2 phút không cập nhật — đủ rộng cho một truy vấn dài chặn vòng lặp sự kiện.
 * - Chiếm khóa bỏ rơi bằng `rename` (nguyên tử): khi hai tiến trình cùng thấy khóa cũ, chỉ một bên đổi tên được.
 * - Mỗi nhịp tim kiểm tra khóa vẫn mang mã của mình; nếu bị chiếm thì gọi `onLost` để dừng ngay, không ghi song song.
 */
export async function acquireDataLock(dir, { staleMs = 120_000, waitMs = 180_000, beatMs = 5_000, onLost } = {}) {
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'server.lock')
  const id = `${randomUUID()} ${hostname()} ${process.pid}`
  const deadline = Date.now() + waitMs
  let warned = false
  for (;;) {
    try {
      await writeFile(file, id, { flag: 'wx' })
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      const age = await stat(file).then((s) => Date.now() - s.mtimeMs, () => null)
      if (age === null) continue // vừa bị xóa: thử tạo lại ngay
      if (age > staleMs) {
        const grave = `${file}.stale-${randomUUID()}`
        if (await rename(file, grave).then(() => true, () => false)) {
          // Giữa lúc kiểm tra và đổi tên, tiến trình khác có thể vừa tạo khóa mới: nếu vậy trả khóa lại cho nó.
          const fresh = await stat(grave).then((s) => Date.now() - s.mtimeMs <= staleMs, () => false)
          if (fresh) await link(grave, file).catch(() => {})
          await unlink(grave).catch(() => {})
        }
        continue
      }
      if (Date.now() > deadline) throw new Error('Thư mục dữ liệu đang được một tiến trình khác sử dụng. Hãy tắt bản cũ rồi chạy lại.')
      if (!warned) console.log('[khóa] Đang chờ tiến trình cũ nhả thư mục dữ liệu…')
      warned = true
      await sleep(2000)
    }
  }

  const stillMine = () => readFile(file, 'utf8').then((v) => v === id, () => false)
  const beat = setInterval(async () => {
    if (!(await stillMine())) {
      clearInterval(beat)
      console.error('[khóa] Tiến trình khác đã chiếm thư mục dữ liệu — dừng để tránh hai bên cùng ghi CSDL.')
      return onLost ? onLost() : process.exit(1)
    }
    const now = new Date()
    utimes(file, now, now).catch(() => {})
  }, beatMs)
  beat.unref()

  return async () => {
    clearInterval(beat)
    if (await stillMine()) await unlink(file).catch(() => {})
  }
}
