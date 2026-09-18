import { parseDate, formatDate, addDays, diffDays, weekdayOf, describePeriods } from './periods.js'
import { parseWeeks, formatWeeks, buildWeekRange } from './weeks.js'
import { buildCalendar, resolveDate } from './holiday.js'

/** 从「秋学期 / 冬学期 / 春夏」等文本推断学季关键字 */
export function termKeyOf(term) {
  const s = String(term || '')
  if (s.includes('冬')) return '冬'
  if (s.includes('夏')) return '夏'
  if (s.includes('春')) return '春'
  if (s.includes('秋')) return '秋'
  return ''
}

export function normalizeName(s) {
  return String(s || '').replace(/[\s（）()·、,，.。:：]/g, '')
}

/** 默认学期配置：2026-2027 学年秋冬学期 */
export function defaultSemester() {
  return {
    startDate: '2026-09-14',
    totalWeeks: 17,
    terms: [
      { key: '秋', label: '秋学期', weekFrom: 1, weekTo: 8 },
      { key: '冬', label: '冬学期', weekFrom: 9, weekTo: 16 },
    ],
  }
}

/**
 * 为课程寻找选修课程时间表中的候选（用于补全时间/地点）
 */
export function matchElective(course, tables = []) {
  const key = course.termKey || termKeyOf(course.term)
  const target = normalizeName(course.name)
  const options = []
  for (const table of tables) {
    if (table.enabled === false) continue
    for (const e of table.entries || []) {
      if (normalizeName(e.name) !== target) continue
      let score = 0
      const season = String(e.season || '')
      if (key && (season.includes(key) || season.includes('秋冬') || season.includes('春夏'))) score += 2
      else if (!season) score += 0.5
      if (course.teacher && e.teacher && course.teacher === e.teacher) score += 3
      if (e.slot) score += 1
      options.push({ tableId: table.id, tableName: table.name, entry: e, score })
    }
  }
  options.sort((a, b) => b.score - a.score)
  return options
}

/** 用选修表条目回填课程 */
export function fillFromEntry(course, option, roomPrefix = '') {
  const e = option.entry
  const room = [roomPrefix, e.room].filter((x) => String(x || '').trim()).join('')
  return {
    ...course,
    slots: e.slot ? [{ ...e.slot }] : [],
    location: room || course.location,
    teacher: course.teacher || e.teacher || '',
    entryId: e.id,
    status: e.slot ? 'filled' : 'unresolved',
  }
}

/** 课程的周集合 */
export function courseWeeks(course, semester) {
  const total = semester.totalWeeks || 20
  let set
  if (course.weeksText) {
    set = parseWeeks(course.weeksText, total)
    if (!set.size) set = null
  }
  if (!set) {
    const t = semester.terms.find((x) => x.key === course.termKey) || semester.terms[0]
    set = buildWeekRange(t?.weekFrom ?? 1, t?.weekTo ?? total, 'all')
  }
  if (course.parity && course.parity !== 'all') {
    set = new Set([...set].filter((w) => (course.parity === 'odd' ? w % 2 === 1 : w % 2 === 0)))
  }
  return set
}

export function weekNumberOn(date, semester) {
  const start = parseDate(semester.startDate)
  return Math.floor(diffDays(start, date) / 7) + 1
}

export function nominalDateOf(week, weekday, semester) {
  const start = parseDate(semester.startDate)
  return addDays(start, 7 * (week - 1) + (weekday - 1))
}

/**
 * 生成所有「实际上课节次」
 * @returns {{ sessions:Array, cancelled:Array }}
 */
export function buildSessions(courses, semester, rules) {
  const cal = buildCalendar(rules)
  const start = parseDate(semester.startDate)
  const sessions = []
  const cancelled = []

  for (const course of courses) {
    if (course.excluded) continue
    if (!course.slots || !course.slots.length) continue
    const weeks = courseWeeks(course, semester)
    for (const week of [...weeks].sort((a, b) => a - b)) {
      for (const slot of course.slots) {
        const nominal = nominalDateOf(week, slot.weekday, semester)
        const nominalStr = formatDate(nominal)
        const actualStr = resolveDate(nominalStr, cal)
        if (!actualStr) {
          cancelled.push({
            course: course.name,
            teacher: course.teacher,
            nominalDate: nominalStr,
            week,
            weekday: slot.weekday,
            start: slot.start,
            end: slot.end,
            reason: cal.cancelled.has(nominalStr) ? '放假停课' : '调休替换',
          })
          continue
        }
        const actual = parseDate(actualStr)
        sessions.push({
          courseId: course.id,
          name: course.name,
          teacher: course.teacher,
          location: course.location,
          term: course.term,
          start: slot.start,
          end: slot.end,
          nominalWeek: week,
          nominalWeekday: slot.weekday,
          nominalDate: nominalStr,
          date: actualStr,
          week: weekNumberOn(actual, semester),
          weekday: weekdayOf(actual),
          moved: actualStr !== nominalStr,
          dayIndex: diffDays(start, actual),
        })
      }
    }
  }
  sessions.sort((a, b) => a.dayIndex - b.dayIndex || a.start - b.start)
  return { sessions, cancelled }
}

/**
 * 会话 -> Wakeup CSV 行（按 课程/星期/节次/教师/地点 合并周数）
 */
export function toCsvRows(sessions) {
  const map = new Map()
  for (const s of sessions) {
    const key = [s.name, s.weekday, s.start, s.end, s.teacher, s.location].join('')
    if (!map.has(key)) {
      map.set(key, {
        name: s.name,
        weekday: s.weekday,
        start: s.start,
        end: s.end,
        teacher: s.teacher,
        location: s.location,
        weeks: new Set(),
        dates: [],
      })
    }
    const row = map.get(key)
    row.weeks.add(s.week)
    row.dates.push(s.date)
  }
  return [...map.values()]
    .map((r) => ({ ...r, weeks: new Set([...r.weeks].sort((a, b) => a - b)), weeksText: formatWeeks(r.weeks) }))
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start || a.name.localeCompare(b.name, 'zh'))
}

/** 冲突检测：同一天同一时段有多门课 */
export function findConflicts(sessions) {
  const byDate = new Map()
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, [])
    byDate.get(s.date).push(s)
  }
  const conflicts = []
  for (const [date, list] of byDate) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        if (a.name === b.name) continue
        if (a.start <= b.end && b.start <= a.end) {
          conflicts.push({ date, a, b, reason: '同一时段多门课程' })
        }
      }
    }
  }
  return conflicts
}

export function sessionLabel(s) {
  return `${s.name} · 第${s.week}周 ${['周一', '周二', '周三', '周四', '周五', '周六', '周日'][s.weekday - 1]} ${describePeriods(s.start, s.end)}`
}
