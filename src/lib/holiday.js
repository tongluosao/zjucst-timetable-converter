import { parseDate, formatDate, addDays, diffDays, weekdayOf, weekdayName } from './periods.js'

/** 把 [start, end] 展开成日期字符串数组（闭区间） */
export function expandRange(start, end) {
  const a = parseDate(start)
  const b = parseDate(end || start)
  if (!a || !b) return []
  const out = []
  const n = diffDays(a, b)
  const from = n >= 0 ? a : b
  const to = n >= 0 ? b : a
  for (let d = new Date(from); diffDays(d, to) >= 0; d = addDays(d, 1)) {
    out.push(formatDate(d))
  }
  return out
}

export const RULE_KIND_TEXT = {
  holiday: '放假停课',
  swap: '对调',
  makeup: '补课',
}

let seq = 0
export function makeRule(kind, partial = {}) {
  seq += 1
  return {
    id: `r${Date.now().toString(36)}${seq}`,
    kind,
    name: '',
    enabled: true,
    start: '',
    end: '',
    from: '',
    to: '',
    keepTargetOwn: true,
    ...partial,
  }
}

/**
 * 2026-2027 学年秋冬学期默认节假日 / 调休规则
 * 依据学校通知整理（不含正常周末）。
 */
export function defaultRules() {
  return [
    makeRule('holiday', {
      name: '中秋节',
      start: '2026-09-25',
      end: '2026-09-27',
    }),
    makeRule('holiday', {
      name: '国庆节',
      start: '2026-10-01',
      end: '2026-10-07',
    }),
    makeRule('swap', {
      name: '国庆调课：10月6日 ↔ 9月20日',
      from: '2026-10-06',
      to: '2026-09-20',
    }),
    makeRule('swap', {
      name: '国庆调课：10月7日 ↔ 10月10日',
      from: '2026-10-07',
      to: '2026-10-10',
    }),
    makeRule('makeup', {
      name: '10月17日补10月2日的课',
      from: '2026-10-02',
      to: '2026-10-17',
      keepTargetOwn: true,
    }),
    makeRule('holiday', {
      name: '浙江大学学生节',
      start: '2026-12-31',
      end: '2026-12-31',
    }),
    makeRule('makeup', {
      name: '2027年1月4日补12月31日的课',
      from: '2026-12-31',
      to: '2027-01-04',
      keepTargetOwn: true,
    }),
    makeRule('holiday', {
      name: '元旦',
      start: '2027-01-01',
      end: '2027-01-01',
    }),
    makeRule('holiday', {
      name: '寒假',
      start: '2027-01-16',
      end: '2027-02-28',
    }),
  ]
}

/**
 * 由规则列表编译出日历：
 *  - cancelled: 停课日期
 *  - redirect:  名义日期 -> 实际上课日期
 *  - replaceTargets: 目标日不再上自己原本的课（对调 / 替换式补课）
 */
export function buildCalendar(rules = []) {
  const cancelled = new Set()
  const redirect = new Map()
  const replaceTargets = new Set()

  for (const r of rules) {
    if (!r || r.enabled === false) continue
    if (r.kind === 'holiday') {
      for (const d of expandRange(r.start, r.end)) cancelled.add(d)
    } else if (r.kind === 'swap') {
      if (!r.from || !r.to) continue
      redirect.set(r.from, r.to)
      redirect.set(r.to, r.from)
      replaceTargets.add(r.from)
      replaceTargets.add(r.to)
    } else if (r.kind === 'makeup') {
      if (!r.from || !r.to) continue
      redirect.set(r.from, r.to)
      if (r.keepTargetOwn === false) replaceTargets.add(r.to)
    }
  }
  return { cancelled, redirect, replaceTargets }
}

/**
 * 计算某个「名义上课日期」在调休后的实际上课日期；返回 null 表示停课。
 */
export function resolveDate(nominalDate, cal) {
  if (!nominalDate) return null
  // 该日原本的课被替换掉，且它本身不是被迁出的源 -> 取消
  if (cal.replaceTargets.has(nominalDate) && !cal.redirect.has(nominalDate)) return null
  // 只走一跳：对调是双向映射，走两跳会绕回原点
  const d = cal.redirect.get(nominalDate) ?? nominalDate
  if (cal.cancelled.has(d)) return null
  return d
}

/**
 * 统计一段日期区间内，每一天实际「上的是星期几的课」。
 * @returns Array<{date, weekday, holiday:boolean, teaches:number[], sources:number[]}>
 */
export function summarizeCalendar(cal, rangeStart, rangeEnd) {
  const a = parseDate(rangeStart)
  const b = parseDate(rangeEnd)
  if (!a || !b) return []
  const out = []
  for (let d = new Date(a); diffDays(d, b) >= 0; d = addDays(d, 1)) {
    const ds = formatDate(d)
    const nominal = resolveDate(ds, cal)
    out.push({
      date: ds,
      weekday: weekdayOf(d),
      weekdayName: weekdayName(d),
      holiday: cal.cancelled.has(ds),
      movedTo: nominal && nominal !== ds ? nominal : '',
      cancelled: !nominal,
    })
  }
  return out
}

/** 反查：某一天实际承担了哪些「星期」的课（含当天自己的） */
export function teachMapOf(cal, rangeStart, rangeEnd) {
  const a = parseDate(rangeStart)
  const b = parseDate(rangeEnd)
  const map = new Map()
  if (!a || !b) return map
  for (let d = new Date(a); diffDays(d, b) >= 0; d = addDays(d, 1)) {
    const ds = formatDate(d)
    const actual = resolveDate(ds, cal)
    if (!actual) continue
    if (!map.has(actual)) map.set(actual, [])
    map.get(actual).push({ nominalDate: ds, weekday: weekdayOf(d) })
  }
  return map
}
