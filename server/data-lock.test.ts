import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireDataLock } from './data-lock.mjs'

const dirs: string[] = []
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'qlcv-lock-'))
  dirs.push(d)
  return d
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('khóa thư mục dữ liệu', () => {
  it('tiến trình thứ hai phải chờ; hết hạn chờ thì báo lỗi', async () => {
    const dir = tempDir()
    const release = await acquireDataLock(dir)
    await expect(acquireDataLock(dir, { waitMs: 100 })).rejects.toThrow(/đang được một tiến trình khác/)
    await release()
    const again = await acquireDataLock(dir, { waitMs: 100 })
    await again()
  })

  it('chiếm khóa bỏ rơi (không có nhịp tim quá lâu)', async () => {
    const dir = tempDir()
    const file = join(dir, 'server.lock')
    writeFileSync(file, 'tien-trinh-da-chet')
    const old = new Date(Date.now() - 10 * 60_000)
    utimesSync(file, old, old)
    const release = await acquireDataLock(dir, { waitMs: 100 })
    await release()
  })

  it('phát hiện bị chiếm khóa và báo ngay để dừng ghi', async () => {
    const dir = tempDir()
    let lost = false
    const release = await acquireDataLock(dir, { beatMs: 20, onLost: () => (lost = true) })
    writeFileSync(join(dir, 'server.lock'), 'tien-trinh-khac')
    await new Promise((r) => setTimeout(r, 120))
    expect(lost).toBe(true)
    await release() // không xóa khóa của tiến trình khác
  })
})
