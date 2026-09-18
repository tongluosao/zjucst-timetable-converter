/**
 * 课表转换流水线自检脚本（Node 端，无需浏览器）
 * 用法：node scripts/verify.mjs [秋课表.xls] [冬课表.xls]
 * 默认读取示例路径 E:/download/我的课表 (2).xls / (3).xls
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import builtin from '../src/data/builtinElective.json' with { type: 'json' }
import { parseTimetableFile, isPlaceholderLocation } from '../src/lib/parseTimetable.js'
import {
  termKeyOf,
  matchElective,
  buildSessions,
  toCsvRows,
  findConflicts,
  defaultSemester,
} from '../src/lib/schedule.js'
import { defaultRules } from '../src/lib/holiday.js'
import { buildCsv } from '../src/lib/csv.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const DEFAULT_FILES = ['E:/download/我的课表 (2).xls', 'E:/download/我的课表 (3).xls']

function shim(file) {
  const buf = fs.readFileSync(file)
  return { name: path.basename(file), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
}

async function main() {
  const inputs = process.argv.slice(2)
  const files = inputs.length ? inputs : DEFAULT_FILES
  const tables = builtin
  const semester = defaultSemester()
  const rules = defaultRules()

  const all = []
  for (const [i, f] of files.entries()) {
    if (!fs.existsSync(f)) {
      console.warn(`跳过不存在的文件：${f}`)
      continue
    }
    const r = await parseTimetableFile(shim(f))
    const tk = termKeyOf(r.termLabel) || (i === 0 ? '秋' : '冬')
    for (const c of r.courses) {
      c.termKey = termKeyOf(c.term) || tk
      all.push(c)
    }
    console.log(`✔ ${path.basename(f)}  学期「${r.termLabel}」 课程 ${r.courses.length}`)
  }

  console.log('\n—— 选修课程时间表补全 ——')
  for (const c of all) {
    const placementOk = !isPlaceholderLocation(c.location)
    if (c.slots.length && placementOk) continue
    const opts = matchElective(c, tables)
    if (!opts.length) {
      console.log(`  ✖ 未匹配  ${c.termKey} ${c.name}`)
      continue
    }
    const e = opts[0].entry
    if (!c.slots.length && e.slot) c.slots = [{ ...e.slot }]
    if (!placementOk) {
      const room = String(e.room || '').trim()
      c.location = room
        ? [tables[0].roomPrefix, room].filter(Boolean).join('-')
        : String(e.remark || '').includes('钉钉')
          ? '钉钉直播'
          : ''
    }
    console.log(`  ✔ ${c.termKey} ${c.name} -> ${JSON.stringify(c.slots)}  地点「${c.location}」  候选 ${opts.length}`)
  }

  const { sessions, cancelled } = buildSessions(all, semester, rules)
  const rows = toCsvRows(sessions)
  const conflicts = findConflicts(sessions)

  console.log('\n—— Wakeup CSV ——')
  console.log(buildCsv(rows, { bom: false }))
  console.log(`会话 ${sessions.length} 节次，停课 ${cancelled.length}，冲突 ${conflicts.length}`)
  const moved = sessions.filter((s) => s.moved)
  if (moved.length) {
    console.log('\n—— 调休后改期的节次 ——')
    for (const s of moved) console.log(`  ${s.name} ${s.nominalDate}(第${s.nominalWeek}周) -> ${s.date}(第${s.week}周 周${s.weekday})`)
  }
  if (cancelled.length) {
    console.log('\n—— 停课节次 ——')
    for (const x of cancelled) console.log(`  ${x.course} ${x.nominalDate} 第${x.week}周 ${x.reason}`)
  }
  if (conflicts.length) {
    console.log('\n—— 冲突 ——')
    for (const c of conflicts) console.log(`  ${c.date} ${c.a.name} × ${c.b.name}`)
  }
}

main().catch((e) => {
  console.error('✖ 校验失败：', e)
  process.exit(1)
})
