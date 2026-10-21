/**
 * Giới hạn tần suất trong bộ nhớ: cho phép `max` lần mỗi `windowMs` cho mỗi khóa.
 * Gọi trực tiếp `limit(key)` = kiểm tra và ghi nhận một lần; trả về true nếu được phép.
 * `limit.blocked(key)` chỉ kiểm tra, `limit.hit(key)` chỉ ghi nhận — dùng khi chỉ muốn đếm lần thất bại.
 */
export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map()
  let lastSweep = 0
  const recentOf = (key, t) => (hits.get(key) ?? []).filter((x) => t - x < windowMs)
  const sweep = (t) => {
    // Dọn khóa hết hạn tối đa mỗi cửa sổ một lần, tránh quét toàn bộ bảng ở mọi yêu cầu khi có nhiều khóa.
    if (hits.size > 5000 && t - lastSweep > windowMs) {
      lastSweep = t
      for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k)
    }
  }
  const blocked = (key) => recentOf(key, now()).length >= max
  const hit = (key) => {
    const t = now()
    const recent = recentOf(key, t)
    recent.push(t)
    hits.set(key, recent)
    sweep(t)
  }
  const limit = (key) => {
    if (blocked(key)) return false
    hit(key)
    return true
  }
  return Object.assign(limit, { blocked, hit })
}
