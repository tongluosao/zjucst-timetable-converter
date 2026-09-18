import { describePeriods } from './periods.js'

export const CSV_HEADER = ['课程名称', '星期', '开始节数', '结束节数', '老师', '地点', '周数']

function escapeField(v) {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * 生成 Wakeup 课程表导入用 CSV
 * @param {Array} rows toCsvRows() 的结果
 * @param {Object} opts { bom:boolean, newline:'\r\n'|'\n' }
 */
export function buildCsv(rows, opts = {}) {
  const { bom = true, newline = '\r\n' } = opts
  const lines = [CSV_HEADER.join(',')]
  for (const r of rows) {
    lines.push(
      [
        escapeField(r.name),
        escapeField(r.weekday),
        escapeField(r.start),
        escapeField(r.end),
        escapeField(r.teacher),
        escapeField(r.location),
        escapeField(r.weeksText),
      ].join(','),
    )
  }
  const text = lines.join(newline) + newline
  return (bom ? '﻿' : '') + text
}

export function downloadCsv(text, filename = 'wakeup课程表.csv') {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 供界面预览使用的简要描述 */
export function rowSummary(r) {
  return `周${['一', '二', '三', '四', '五', '六', '日'][r.weekday - 1]} ${describePeriods(r.start, r.end)} · ${r.weeksText}`
}
