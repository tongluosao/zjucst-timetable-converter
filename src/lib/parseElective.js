import { readWorkbook, sheetToRows, findHeaderRow, buildColumnMap, cell } from './xls.js'
import { cnCharToWeekday, timeRangeToPeriods, DEFAULT_PERIODS } from './periods.js'

/** 学院发布的完整选修课程时间表 */
const ALIASES = {
  year: ['排课学年', '学年'],
  season: ['上课学季', '学季', '学期'],
  code: ['课程编号', '课程号'],
  name: ['课程名称', '课程'],
  nature: ['课程性质', '性质'],
  credit: ['学分'],
  hours: ['学时'],
  classCode: ['班级编号', '班级'],
  language: ['上课语言', '语言'],
  teacher: ['主讲教师姓名', '主讲教师', '教师', '任课教师'],
  campus: ['上课校区', '校区'],
  time: ['上课时间', '时间'],
  room: ['上课教室', '教室', '上课地点', '地点'],
  remark: ['备注'],
}

const NO_TIME_HINT = ['具体上课时间', '由任课教师通知', '待定', '待通知', '另行通知', '另行安排']

export function hasNoTimeInfo(text) {
  const s = String(text || '').trim()
  if (!s) return true
  return NO_TIME_HINT.some((p) => s.includes(p))
}

/**
 * 解析选修课程时间表的「上课时间」
 * 支持：每周一5-8节 / 每周三18:50~20:25 / 每周三 18:50-20:25
 */
export function parseElectiveTime(text, periods = DEFAULT_PERIODS) {
  const raw = String(text || '').trim()
  if (!raw || hasNoTimeInfo(raw)) return null
  const wm = /每?周\s*([一二三四五六日天])/.exec(raw)
  if (!wm) return null
  const weekday = cnCharToWeekday(wm[1])
  if (!weekday) return null

  // 1) 直接写节次：每周一5-8节
  let pm = /(\d+)\s*[-~－—]\s*(\d+)\s*节/.exec(raw)
  if (pm) return { weekday, start: Number(pm[1]), end: Number(pm[2]) }
  let pm1 = /(\d+)\s*节/.exec(raw)
  if (pm1) return { weekday, start: Number(pm1[1]), end: Number(pm1[1]) }

  // 2) 写时间区间：每周三18:50~20:25
  const tm = /(\d{1,2}\s*[:：]\s*\d{2})\s*[-~－—至到]\s*(\d{1,2}\s*[:：]\s*\d{2})/.exec(raw)
  if (tm) {
    const r = timeRangeToPeriods(tm[1], tm[2], periods)
    if (r) return { weekday, start: r.start, end: r.end }
  }
  return null
}

/**
 * 解析选修课程时间表
 * @returns {{ name:string, sheetName:string, roomPrefix:string, entries:Array }}
 */
export async function parseElectiveFile(file, fileName = '') {
  const wb = await readWorkbook(file)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = sheetToRows(sheet)
  if (!rows.length) throw new Error('文件为空或无法识别')

  const headerIdx = findHeaderRow(rows, ['课程名称', '上课时间', '主讲教师'])
  if (headerIdx < 0) throw new Error('未找到表头行，请确认上传的是学院选修课程时间表')
  const col = buildColumnMap(rows[headerIdx], ALIASES)
  if (col.name === undefined) throw new Error('未找到「课程名称」列')

  const entries = []
  let roomPrefix = ''
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const line = row.join(' ')
    // 表尾「注：上课教室均在5号楼」这类说明，用于补全教室前缀
    if (!roomPrefix) {
      const m = /上课教室均在\s*([^\s，,。;；]+)/.exec(line)
      if (m) roomPrefix = m[1]
    }
    const name = cell(row, col.name)
    if (!name) continue
    if (/^注[:：]/.test(name) || name.includes('注：')) continue

    const timeText = cell(row, col.time)
    entries.push({
      id: `e${r}-${Math.random().toString(36).slice(2, 7)}`,
      year: col.year !== undefined ? cell(row, col.year) : '',
      season: col.season !== undefined ? cell(row, col.season) : '',
      code: col.code !== undefined ? cell(row, col.code) : '',
      name,
      nature: col.nature !== undefined ? cell(row, col.nature) : '',
      credit: col.credit !== undefined ? cell(row, col.credit) : '',
      hours: col.hours !== undefined ? cell(row, col.hours) : '',
      classCode: col.classCode !== undefined ? cell(row, col.classCode) : '',
      language: col.language !== undefined ? cell(row, col.language) : '',
      teacher: col.teacher !== undefined ? cell(row, col.teacher) : '',
      campus: col.campus !== undefined ? cell(row, col.campus) : '',
      timeText,
      room: col.room !== undefined ? cell(row, col.room) : '',
      remark: col.remark !== undefined ? cell(row, col.remark) : '',
      slot: parseElectiveTime(timeText),
      _row: r + 1,
    })
  }

  return {
    name: fileName || wb.SheetNames[0],
    sheetName: wb.SheetNames[0],
    roomPrefix,
    entries,
  }
}
