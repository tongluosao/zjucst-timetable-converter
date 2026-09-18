/**
 * 周数集合的解析与格式化，兼容 Wakeup 课程表的写法：
 *   "1-5、7-11单、12-16双"、"1-16"、"2、5、8"
 */

/** 解析成 Set<number> */
export function parseWeeks(text, totalWeeks = 32) {
  const set = new Set()
  if (text == null) return set
  const raw = String(text).trim()
  if (!raw) return set
  const parts = raw.split(/[、,，;；\s]+/).filter(Boolean)
  for (const part of parts) {
    let mode = 'all'
    let body = part
    if (/[单 oddOdd]/.test(part.slice(-1)) && !/\d$/.test(part)) {
      // 结尾是「单/双」
      if (part.endsWith('单')) mode = 'odd'
      else if (part.endsWith('双')) mode = 'even'
      if (mode !== 'all') body = part.slice(0, -1)
    }
    const m = /^(\d+)\s*(?:[-~－—]\s*(\d+))?$/.exec(body.trim())
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    for (let w = lo; w <= hi; w++) {
      if (w < 1 || w > totalWeeks) continue
      if (mode === 'odd' && w % 2 === 0) continue
      if (mode === 'even' && w % 2 === 1) continue
      set.add(w)
    }
  }
  return set
}

/**
 * 把周数集合压缩成 Wakeup 风格字符串。
 * 连续 -> "1-5"；等差 2 -> "1-15单" / "2-16双"；孤立 -> "3"
 */
export function formatWeeks(weekSet) {
  const weeks = [...(weekSet instanceof Set ? weekSet : new Set(weekSet))]
    .filter((w) => Number.isFinite(w))
    .sort((a, b) => a - b)
  if (!weeks.length) return ''
  const inSet = new Set(weeks)
  const used = new Set()
  const chunks = []
  for (const w of weeks) {
    if (used.has(w)) continue
    let step = 1
    if (!inSet.has(w + 1) && inSet.has(w + 2)) step = 2
    const run = [w]
    used.add(w)
    let cur = w
    while (inSet.has(cur + step)) {
      cur += step
      run.push(cur)
      used.add(cur)
    }
    if (run.length === 1) {
      chunks.push(String(run[0]))
    } else if (step === 1) {
      chunks.push(`${run[0]}-${run[run.length - 1]}`)
    } else {
      chunks.push(`${run[0]}-${run[run.length - 1]}${run[0] % 2 === 1 ? '单' : '双'}`)
    }
  }
  return chunks.join('、')
}

/** 生成 1..n 的周集合，可按单双周过滤 */
export function buildWeekRange(from, to, parity = 'all') {
  const set = new Set()
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  for (let w = lo; w <= hi; w++) {
    if (parity === 'odd' && w % 2 === 0) continue
    if (parity === 'even' && w % 2 === 1) continue
    set.add(w)
  }
  return set
}

/** 从「单双周」列文本推断 单/双/全部 */
export function detectParity(text) {
  const s = String(text || '')
  if (!s) return 'all'
  if (s.includes('单周')) return 'odd'
  if (s.includes('双周')) return 'even'
  if (/^单$/.test(s.trim())) return 'odd'
  if (/^双$/.test(s.trim())) return 'even'
  if (s.includes('全') || s.includes('每周')) return 'all'
  return 'all'
}
