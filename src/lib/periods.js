/**
 * 浙江大学作息节次表（默认，可在界面中修改）
 * 用于把「18:50~20:25」这样的时间区间换算成「第11-12节」。
 */
export const DEFAULT_PERIODS = [
  { index: 1, start: '08:00', end: '08:45' },
  { index: 2, start: '08:50', end: '09:35' },
  { index: 3, start: '09:50', end: '10:35' },
  { index: 4, start: '10:40', end: '11:25' },
  { index: 5, start: '11:30', end: '12:15' },
  { index: 6, start: '13:15', end: '14:00' },
  { index: 7, start: '14:05', end: '14:50' },
  { index: 8, start: '14:55', end: '15:40' },
  { index: 9, start: '15:55', end: '16:40' },
  { index: 10, start: '16:45', end: '17:30' },
  { index: 11, start: '18:50', end: '19:35' },
  { index: 12, start: '19:40', end: '20:25' },
  { index: 13, start: '20:30', end: '21:15' },
  { index: 14, start: '21:20', end: '22:05' },
]

export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
export const WEEKDAY_CN_CHARS = ['一', '二', '三', '四', '五', '六', '日']

/** '08:00' -> 480 */
export function timeToMinutes(hhmm) {
  if (!hhmm) return null
  const m = /^(\d{1,2})\s*[:：]\s*(\d{2})$/.exec(String(hhmm).trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 把上课时间区间换算成节次区间。
 * 规则：起点取「开始时间 >= 给定开始时间」的第一个节次；
 *       终点取「结束时间 <= 给定结束时间」的最后一个节次。
 * 例如 18:50~20:25 -> 11-12
 */
export function timeRangeToPeriods(startText, endText, periods = DEFAULT_PERIODS) {
  const s = timeToMinutes(startText)
  const e = timeToMinutes(endText)
  if (s == null || e == null) return null
  let start = null
  let end = null
  for (const p of periods) {
    const ps = timeToMinutes(p.start)
    const pe = timeToMinutes(p.end)
    if (ps == null || pe == null) continue
    // 允许 5 分钟误差（例如 18:50 vs 18:55）
    if (start === null && ps >= s - 6) start = p.index
    if (pe <= e + 6) end = p.index
  }
  if (start === null || end === null || end < start) return null
  return { start, end }
}

export function describePeriods(start, end) {
  return start === end ? `第${start}节` : `第${start}-${end}节`
}

/** '2026-09-14' -> Date（本地零点） */
export function parseDate(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate())
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s).trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function formatDate(d) {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

/** 两个日期相差天数（b - a） */
export function diffDays(a, b) {
  return Math.round((b - a) / 86400000)
}

/** 1=周一 ... 7=周日 */
export function weekdayOf(d) {
  const w = d.getDay()
  return w === 0 ? 7 : w
}

export function weekdayName(d) {
  return WEEKDAY_NAMES[weekdayOf(d) - 1]
}

/** 中文数字 '一'..'日' -> 1..7 */
export function cnCharToWeekday(ch) {
  const i = WEEKDAY_CN_CHARS.indexOf(ch)
  return i === -1 ? null : i + 1
}
