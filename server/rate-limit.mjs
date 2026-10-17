/** Giới hạn tần suất trong bộ nhớ: cho phép `max` lần mỗi `windowMs` cho mỗi khóa. Trả về true nếu được phép. */
export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map()
  let lastSweep = 0
  return (key) => {
    const t = now()
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs)
    if (recent.length >= max) {
      hits.set(key, recent)
      return false
    }
    recent.push(t)
    hits.set(key, recent)
    // Dọn khóa hết hạn tối đa mỗi cửa sổ một lần, tránh quét toàn bộ bảng ở mọi yêu cầu khi có nhiều khóa.
    if (hits.size > 5000 && t - lastSweep > windowMs) {
      lastSweep = t
      for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k)
    }
    return true
  }
}
