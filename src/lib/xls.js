import * as XLSX from 'xlsx'

/**
 * 读取 xls / xlsx 文件为「二维数组」。
 * 兼容老版 BIFF(.xls) 与 OOXML(.xlsx)。
 */
export async function readWorkbook(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  return wb
}

export function sheetToRows(worksheet) {
  if (!worksheet) return []
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: true,
  })
  return rows.map((r) => r.map((c) => normalizeCell(c)))
}

export function normalizeCell(v) {
  if (v == null) return ''
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  if (typeof v === 'number') return String(v)
  return String(v).replace(/\s+/g, ' ').trim()
}

/**
 * 在表格前若干行中找到表头行。
 * matchKeys 中的关键字全部命中（或达到阈值）即认为是表头。
 */
export function findHeaderRow(rows, matchKeys, scanLimit = 12) {
  const limit = Math.min(rows.length, scanLimit)
  let best = -1
  let bestScore = 0
  for (let i = 0; i < limit; i++) {
    const joined = rows[i].join('|')
    let score = 0
    for (const k of matchKeys) {
      if (rows[i].some((c) => c && c.includes(k))) score++
    }
    if (score > bestScore) {
      bestScore = score
      best = i
    }
    if (joined.length > 200) break
  }
  return bestScore >= Math.max(1, Math.ceil(matchKeys.length / 2)) ? best : -1
}

/**
 * 依据表头行建立 列名 -> 列号 映射。
 * 分三轮，避免「课程编号」被子串别名「课程」抢走：
 *   1) 完全相等  2) 长度≥2 的子串  3) 单字子串
 * 每一列最多被一个字段占用。
 */
export function buildColumnMap(headerRow, aliases) {
  const map = {}
  const norm = (s) => String(s || '').replace(/[\s:：（）()]/g, '')
  const cells = headerRow.map(norm)
  const usedCols = new Set()

  const pass = (minLen) => {
    for (const [key, names] of Object.entries(aliases)) {
      if (map[key] !== undefined) continue
      for (let c = 0; c < cells.length; c++) {
        if (!cells[c] || usedCols.has(c)) continue
        const hit = names.some((n) => {
          const nn = norm(n)
          if (nn.length < minLen) return false
          return minLen === 0 ? nn === cells[c] : cells[c].includes(nn)
        })
        if (hit) {
          map[key] = c
          usedCols.add(c)
          break
        }
      }
    }
  }

  pass(0) // 精确相等
  pass(2) // 多字子串
  pass(1) // 单字兜底
  return map
}

export function cell(row, idx) {
  if (idx === undefined || idx < 0) return ''
  return row[idx] ?? ''
}
