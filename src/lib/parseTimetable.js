import { readWorkbook, sheetToRows, findHeaderRow, buildColumnMap, cell } from './xls.js'
import { cnCharToWeekday } from './periods.js'
import { detectParity } from './weeks.js'

/** 教务系统导出的个人课表：学期 | 单双周 | 上课时间 | 课程名称 | 主讲教师 | 上课地点 */
const ALIASES = {
  term: ['学期', '上课学季', '学季'],
  parity: ['单双周', '单双', '周次'],
  time: ['上课时间', '时间'],
  name: ['课程名称', '课程'],
  teacher: ['主讲教师', '教师', '任课教师'],
  location: ['上课地点', '地点', '教室'],
}

const PLACEHOLDER_LOCATION = ['具体上课时间', '由学院通知', '由任课教师通知', '待定', '待通知', '另行通知']

export function isPlaceholderLocation(text) {
  const s = String(text || '')
  return !s || PLACEHOLDER_LOCATION.some((p) => s.includes(p))
}

/**
 * 解析「星期六 第11-12节」「星期一 第11-14节」这类文本
 * 支持一段文本中包含多个时间段（分号 / 换行 / 逗号分隔）
 */
export function parseSlots(text) {
  const raw = String(text || '').trim()
  if (!raw) return []
  const segs = raw.split(/[;；\n\r]+|(?<=节)\s*[,，]\s*(?=星期)/).filter(Boolean)
  const slots = []
  for (const seg of segs) {
    const wm = /星期\s*([一二三四五六日天])/.exec(seg)
    if (!wm) continue
    const weekday = cnCharToWeekday(wm[1])
    if (!weekday) continue
    const pm = /第?\s*(\d+)\s*[-~－—]\s*(\d+)\s*节/.exec(seg)
    if (pm) {
      slots.push({ weekday, start: Number(pm[1]), end: Number(pm[2]) })
      continue
    }
    const pm2 = /第?\s*(\d+)\s*节/.exec(seg)
    if (pm2) slots.push({ weekday, start: Number(pm2[1]), end: Number(pm2[1]) })
  }
  return slots
}

/** 从上课时间里抽取自带的周数描述，如「第1-8周」 */
export function parseWeeksText(text) {
  const m = /第\s*([\d]+(?:[-~－—]\d+)?(?:\s*[、,，]\s*\d+(?:[-~－—]\d+)?)*)\s*周(?!数)/.exec(String(text || ''))
  return m ? m[1] : ''
}

/**
 * 解析教务系统课表文件
 * @returns {{ termLabel:string, sheetName:string, courses:Array }}
 */
export async function parseTimetableFile(file) {
  const wb = await readWorkbook(file)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = sheetToRows(sheet)
  if (!rows.length) throw new Error('文件为空或无法识别')

  const headerIdx = findHeaderRow(rows, ['课程名称', '上课时间'])
  if (headerIdx < 0) throw new Error('未找到表头行，请确认上传的是教务系统导出的课表')
  const col = buildColumnMap(rows[headerIdx], ALIASES)
  if (col.name === undefined) throw new Error('未找到「课程名称」列')

  const courses = []
  const seen = new Set()
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const name = cell(row, col.name)
    if (!name || name.includes('导出人') || name.includes('注：')) continue
    const rawTime = cell(row, col.time)
    const parityText = cell(row, col.parity)
    const location = cell(row, col.location)
    const slots = parseSlots(rawTime)
    const item = {
      id: `t${r}-${Math.random().toString(36).slice(2, 7)}`,
      term: cell(row, col.term) || '',
      parityText,
      parity: detectParity(parityText),
      name,
      teacher: cell(row, col.teacher),
      location,
      rawTime,
      slots,
      weeksText: parseWeeksText(rawTime),
      needsFill: slots.length === 0 || isPlaceholderLocation(location),
      source: 'timetable',
    }
    const key = [item.term, item.name, item.teacher, item.rawTime, item.location].join('')
    if (seen.has(key)) continue
    seen.add(key)
    courses.push(item)
  }
  const termLabel = courses.find((c) => c.term)?.term || ''
  return { sheetName: wb.SheetNames[0], termLabel, courses }
}
