import { reactive, computed } from 'vue'
import builtinTables from './data/builtinElective.json'
import { parseTimetableFile } from './lib/parseTimetable.js'
import { parseElectiveFile } from './lib/parseElective.js'
import { defaultSemester, termKeyOf, matchElective, buildSessions, toCsvRows, findConflicts } from './lib/schedule.js'
import { defaultRules as holidayRules } from './lib/holiday.js'
import { isPlaceholderLocation } from './lib/parseTimetable.js'
import { buildCsv } from './lib/csv.js'

const STORAGE_KEY = 'zju-timetable-converter:v1'

export const state = reactive({
  /** 两个季度学期的课表 */
  files: [null, null],
  /** 选修课程时间表（内置 + 用户上传） */
  electiveTables: [],
  semester: defaultSemester(),
  rules: holidayRules(),
  /** 教室前缀是否参与地点拼接 */
  useRoomPrefix: true,
  roomSeparator: '-',
  /** 导出选项 */
  csvBom: true,
  activeTab: '1',
  previewWeek: 1,
})

let builtinLoaded = false

export function ensureBuiltin() {
  if (builtinLoaded) return
  builtinLoaded = true
  for (const t of builtinTables) {
    if (!state.electiveTables.some((x) => x.id === t.id)) {
      state.electiveTables.push(JSON.parse(JSON.stringify(t)))
    }
  }
}

export function enabledElectiveTables() {
  return state.electiveTables.filter((t) => t.enabled !== false)
}

export function roomTextOf(entry, tableId) {
  const table = state.electiveTables.find((t) => t.id === tableId)
  const prefix = state.useRoomPrefix && table?.roomPrefix ? table.roomPrefix : ''
  const room = String(entry.room || '').trim()
  if (!room) {
    const remark = String(entry.remark || '')
    if (remark.includes('钉钉')) return '钉钉直播'
    return ''
  }
  return [prefix, room].filter(Boolean).join(state.roomSeparator || '')
}

/* ------------------------------ 课表上传 ------------------------------ */

export async function loadTimetable(slotIndex, file) {
  const parsed = await parseTimetableFile(file)
  const termKey = termKeyOf(parsed.termLabel) || (slotIndex === 0 ? '秋' : '冬')
  const courses = parsed.courses.map((c) => ({
    ...c,
    termKey: termKeyOf(c.term) || termKey,
    status: c.slots.length && !isPlaceholderLocation(c.location) ? 'ok' : 'pending',
    entryId: '',
    fillOptions: [],
    edited: false,
    excluded: false,
  }))
  state.files[slotIndex] = {
    id: `f${slotIndex}-${Date.now()}`,
    fileName: file.name,
    sheetName: parsed.sheetName,
    termLabel: parsed.termLabel,
    termKey,
    courses,
  }
  autoFill()
  return state.files[slotIndex]
}

export function clearTimetable(slotIndex) {
  state.files[slotIndex] = null
}

export function setFileTerm(slotIndex, termKey) {
  const f = state.files[slotIndex]
  if (!f) return
  f.termKey = termKey
  for (const c of f.courses) if (!c.edited) c.termKey = termKey
}

/* --------------------------- 选修课程时间表 --------------------------- */

export async function loadElectiveTable(file) {
  const parsed = await parseElectiveFile(file, file.name)
  const table = {
    id: `u${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
    name: file.name,
    builtin: false,
    enabled: true,
    roomPrefix: parsed.roomPrefix,
    sheetName: parsed.sheetName,
    entries: parsed.entries,
  }
  state.electiveTables.push(table)
  autoFill()
  return table
}

export function removeElectiveTable(id) {
  const i = state.electiveTables.findIndex((t) => t.id === id)
  if (i >= 0) state.electiveTables.splice(i, 1)
  autoFill()
}

export function toggleElectiveTable(id, enabled) {
  const t = state.electiveTables.find((x) => x.id === id)
  if (t) t.enabled = enabled
  autoFill()
}

export function restoreBuiltin() {
  for (const t of builtinTables) {
    if (!state.electiveTables.some((x) => x.id === t.id)) {
      state.electiveTables.push(JSON.parse(JSON.stringify(t)))
    } else {
      const cur = state.electiveTables.find((x) => x.id === t.id)
      cur.enabled = true
    }
  }
  autoFill()
}

/* ------------------------------ 自动补全 ------------------------------ */

export function autoFill() {
  for (const f of state.files) {
    if (!f) continue
    for (const c of f.courses) {
      const placementOk = !isPlaceholderLocation(c.location)
      if (c.edited) {
        c.status = c.slots.length ? 'manual' : 'unresolved'
        c.fillOptions = matchElective(c, enabledElectiveTables())
        continue
      }
      if (c.slots.length && placementOk) {
        c.status = 'ok'
        c.fillOptions = matchElective(c, enabledElectiveTables())
        continue
      }
      const opts = matchElective(c, enabledElectiveTables())
      c.fillOptions = opts
      if (!opts.length) {
        c.status = c.slots.length ? 'ok' : 'unresolved'
        continue
      }
      const best = opts[0]
      const e = best.entry
      const hadSlots = c.slots.length > 0
      const nextLocation = placementOk ? c.location : roomTextOf(e, best.tableId) || c.location
      c.slots = hadSlots ? c.slots : e.slot ? [{ ...e.slot }] : []
      c.location = nextLocation
      c.teacher = c.teacher || e.teacher || ''
      // entryId 只记录「时间取自哪一条」；已有时间的课程只借用地点，不算采用
      c.locationEntryId = e.id
      c.entryId = hadSlots ? '' : e.id
      c.status = c.slots.length ? (hadSlots ? 'ok' : 'filled') : 'unresolved'
    }
  }
}

export function applyEntry(course, entryId) {
  const opt = (course.fillOptions || []).find((o) => o.entry.id === entryId)
  if (!opt) return
  const e = opt.entry
  course.slots = e.slot ? [{ ...e.slot }] : []
  course.location = roomTextOf(e, opt.tableId) || course.location
  course.teacher = course.teacher || e.teacher || ''
  course.entryId = e.id
  course.edited = true
  course.status = e.slot ? 'manual' : 'unresolved'
}

export function updateCourse(course, patch) {
  Object.assign(course, patch)
  course.edited = true
  course.status = course.slots.length ? 'manual' : 'unresolved'
}

export function resetCourse(course) {
  course.edited = false
  autoFill()
}

/* ------------------------------ 派生数据 ------------------------------ */

export const allCourses = computed(() => {
  const out = []
  state.files.forEach((f, i) => {
    if (!f) return
    for (const c of f.courses) out.push({ ...c, fileIndex: i, fileTerm: f.termKey })
  })
  return out
})

export const termWeekRange = computed(() => {
  const map = {}
  for (const t of state.semester.terms) map[t.key] = [t.weekFrom, t.weekTo]
  return map
})

export const scheduleResult = computed(() => {
  const courses = allCourses.value.filter((c) => !c.excluded)
  const { sessions, cancelled } = buildSessions(courses, state.semester, state.rules)
  const rows = toCsvRows(sessions)
  const conflicts = findConflicts(sessions)
  return { sessions, cancelled, rows, conflicts }
})

export const csvText = computed(() => buildCsv(scheduleResult.value.rows, { bom: state.csvBom }))

export const stats = computed(() => {
  const list = allCourses.value
  return {
    total: list.length,
    filled: list.filter((c) => c.status === 'filled').length,
    unresolved: list.filter((c) => c.status === 'unresolved').length,
    manual: list.filter((c) => c.status === 'manual').length,
    ok: list.filter((c) => c.status === 'ok').length,
  }
})

/* ------------------------------ 本地持久化 ------------------------------ */

export function saveLocal() {
  try {
    const data = {
      version: 1,
      semester: state.semester,
      rules: state.rules,
      useRoomPrefix: state.useRoomPrefix,
      roomSeparator: state.roomSeparator,
      csvBom: state.csvBom,
      files: state.files.map((f) => (f ? { ...f } : null)),
      userTables: state.electiveTables.filter((t) => !t.builtin),
      builtinState: state.electiveTables.filter((t) => t.builtin).map((t) => ({ id: t.id, enabled: t.enabled })),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('保存本地状态失败', e)
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (data.semester) Object.assign(state.semester, data.semester)
    if (Array.isArray(data.rules)) state.rules = data.rules
    if (typeof data.useRoomPrefix === 'boolean') state.useRoomPrefix = data.useRoomPrefix
    if (typeof data.roomSeparator === 'string') state.roomSeparator = data.roomSeparator
    if (typeof data.csvBom === 'boolean') state.csvBom = data.csvBom
    if (Array.isArray(data.files)) {
      state.files = [data.files[0] || null, data.files[1] || null]
    }
    ensureBuiltin()
    if (Array.isArray(data.builtinState)) {
      for (const b of data.builtinState) {
        const t = state.electiveTables.find((x) => x.id === b.id)
        if (t) t.enabled = b.enabled
      }
    }
    if (Array.isArray(data.userTables)) {
      for (const t of data.userTables) {
        if (!state.electiveTables.some((x) => x.id === t.id)) state.electiveTables.push(t)
      }
    }
    autoFill()
    return true
  } catch (e) {
    console.warn('读取本地状态失败', e)
    return false
  }
}

export function clearLocal() {
  localStorage.removeItem(STORAGE_KEY)
}

export { holidayRules as defaultRules }
