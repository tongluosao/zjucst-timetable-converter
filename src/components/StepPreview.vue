<script setup>
import { ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { state, scheduleResult, csvText } from '../store.js'
import { buildCsv, downloadCsv } from '../lib/csv.js'
import { parseDate, formatDate, addDays, WEEKDAY_NAMES, describePeriods } from '../lib/periods.js'
import { buildCalendar } from '../lib/holiday.js'

const PALETTE = [
  '#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1',
  '#13c2c2', '#2f54eb', '#f5222d', '#7cb305', '#faad14',
]

function colorOf(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const week = computed({
  get: () => state.previewWeek,
  set: (v) => (state.previewWeek = v),
})

const weekOptions = computed(() =>
  Array.from({ length: state.semester.totalWeeks || 16 }, (_, i) => ({
    value: i + 1,
    label: `第 ${i + 1} 周`,
  })),
)

const weekDates = computed(() => {
  const start = parseDate(state.semester.startDate)
  if (!start) return []
  const base = addDays(start, 7 * (week.value - 1))
  return Array.from({ length: 7 }, (_, i) => addDays(base, i))
})

const cal = computed(() => buildCalendar(state.rules))

const sessionsByDate = computed(() => {
  const map = new Map()
  for (const s of scheduleResult.value.sessions) {
    if (!map.has(s.date)) map.set(s.date, [])
    map.get(s.date).push(s)
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start)
  return map
})

const maxPeriod = computed(() => {
  let m = 12
  for (const s of scheduleResult.value.sessions) m = Math.max(m, s.end)
  return Math.min(m, 14)
})

function cellSessions(dayIndex) {
  const d = weekDates.value[dayIndex]
  if (!d) return []
  return sessionsByDate.value.get(formatDate(d)) || []
}

function isHoliday(dayIndex) {
  const d = weekDates.value[dayIndex]
  if (!d) return false
  return cal.value.cancelled.has(formatDate(d))
}

/**
 * 构建周视图网格：跨多个节次的课程用 rowspan 贯通整段（如第 1-4 节占 4 行）。
 * 单元格类型：
 *   block  —— 课程块起点，rowspan = 跨越的节次数
 *   skip   —— 被上方 rowspan 占用，不渲染 <td>
 *   empty  —— 空格
 */
const grid = computed(() => {
  const total = maxPeriod.value
  const rows = []
  const remaining = new Array(7).fill(0) // 每天还剩多少行被上方 rowspan 占用
  for (let p = 1; p <= total; p++) {
    const cells = []
    for (let i = 0; i < 7; i++) {
      if (remaining[i] > 0) {
        remaining[i] -= 1
        cells.push({ kind: 'skip' })
        continue
      }
      const day = cellSessions(i)
      const starts = day.filter((s) => s.start === p)
      if (!starts.length) {
        cells.push({ kind: 'empty' })
        continue
      }
      // 把与本课程区间重叠的其它课程也合并进同一格，避免被 rowspan 遮住
      const group = [...starts]
      let end = Math.max(...starts.map((s) => s.end))
      let changed = true
      while (changed) {
        changed = false
        for (const s of day) {
          if (s.start > p && s.start <= end && !group.includes(s)) {
            group.push(s)
            end = Math.max(end, s.end)
            changed = true
          }
        }
      }
      const span = Math.max(1, Math.min(end, total) - p + 1)
      group.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name, 'zh'))
      cells.push({ kind: 'block', sessions: group, span })
      remaining[i] = span - 1
    }
    rows.push({ period: p, cells })
  }
  return rows
})

const cancelledRows = computed(() => scheduleResult.value.cancelled)
const conflicts = computed(() => scheduleResult.value.conflicts)

function doExport() {
  if (!scheduleResult.value.rows.length) {
    message.warning('暂无可导出课程')
    return
  }
  downloadCsv(buildCsv(scheduleResult.value.rows, { bom: state.csvBom }), 'Wakeup课程表.csv')
  message.success('已导出')
}

async function copyCsv() {
  try {
    await navigator.clipboard.writeText(csvText.value)
    message.success('已复制')
  } catch (e) {
    message.warning('复制失败，请手动复制下方文本')
  }
}

const colourLegend = computed(() => {
  const names = [...new Set(scheduleResult.value.sessions.map((s) => s.name))]
  return names.map((n) => ({ name: n, color: colorOf(n) }))
})
</script>

<template>
  <div>
    <div class="panel-card">
      <h3 class="section-title">周课表预览</h3>
      <p class="section-desc">
        预览已把节假日与调休计算进去：某一天若承接了别的日期的课，会显示「改期」标记；放假中的格子会用斜纹标出。
      </p>
      <a-space wrap style="margin-bottom: 12px">
        <a-select v-model:value="week" :options="weekOptions" style="width: 120px" />
        <span style="color: #6b7a90; font-size: 12.5px">
          {{ weekDates.length ? formatDate(weekDates[0]) : '' }} ~
          {{ weekDates.length ? formatDate(weekDates[6]) : '' }}
        </span>
        <a-tag v-if="cancelledRows.length" color="red">全学期停课 {{ cancelledRows.length }} 节</a-tag>
        <a-tag v-if="conflicts.length" color="volcano">冲突 {{ conflicts.length }} 处</a-tag>
      </a-space>

      <div style="overflow-x: auto">
        <table class="week-grid">
          <thead>
            <tr>
              <th class="period-cell">节次</th>
              <th v-for="(d, i) in weekDates" :key="i" :class="isHoliday(i) ? 'holiday-col' : ''">
                <div>{{ WEEKDAY_NAMES[i] }}</div>
                <div style="font-weight: 400; font-size: 11px">{{ d ? `${d.getMonth() + 1}/${d.getDate()}` : '' }}</div>
                <div v-if="isHoliday(i)" style="font-size: 10px; color: #c0392b">放假</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in grid" :key="row.period">
              <td class="period-cell">{{ row.period }}</td>
              <template v-for="(cell, i) in row.cells" :key="i">
                <!-- 课程块：rowspan 贯通整个节次区间 -->
                <td
                  v-if="cell.kind === 'block'"
                  :rowspan="cell.span"
                  :class="['block-cell', isHoliday(i) ? 'holiday-cell' : '']"
                >
                  <div class="block-stack" :style="{ '--span': cell.span }">
                    <div
                      v-for="s in cell.sessions"
                      :key="s.name + s.start"
                      class="course-block"
                      :style="{ background: colorOf(s.name) }"
                    >
                      <span class="cb-name">{{ s.name }}</span>
                      <span class="cb-meta">{{ s.location || '地点待定' }}</span>
                      <span class="cb-meta">{{ describePeriods(s.start, s.end) }}</span>
                      <span v-if="s.moved" class="cb-moved">
                        改期：原第{{ s.nominalWeek }}周 {{ WEEKDAY_NAMES[s.nominalWeekday - 1] }}
                      </span>
                    </div>
                  </div>
                </td>
                <!-- 被 rowspan 占用的格子不渲染 -->
                <td v-else-if="cell.kind === 'empty'" :class="isHoliday(i) ? 'holiday-cell' : ''"></td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="legend">
        <span v-for="l in colourLegend" :key="l.name">
          <i :style="{ background: l.color }"></i>{{ l.name }}
        </span>
      </div>
    </div>

    <div class="panel-card">
      <h3 class="section-title">停课 / 改期明细</h3>
      <a-row :gutter="14">
        <a-col :xs="24" :md="12">
          <h4 style="font-size: 13px; margin: 0 0 8px">因假期或调休停上的节次（{{ cancelledRows.length }}）</h4>
          <a-table
            :columns="[
              { title: '课程', dataIndex: 'course', ellipsis: true },
              { title: '原日期', dataIndex: 'nominalDate', width: 100 },
              { title: '周次', dataIndex: 'week', width: 60 },
              { title: '原因', dataIndex: 'reason', width: 100 },
            ]"
            :data-source="cancelledRows"
            size="small"
            row-key="course + nominalDate + start"
            :pagination="{ pageSize: 8, size: 'small' }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'week'">第{{ record.week }}周</template>
            </template>
          </a-table>
        </a-col>
        <a-col :xs="24" :md="12">
          <h4 style="font-size: 13px; margin: 0 0 8px">改期后的节次</h4>
          <a-table
            :columns="[
              { title: '课程', dataIndex: 'name', ellipsis: true },
              { title: '原日期', dataIndex: 'nominalDate', width: 100 },
              { title: '实际上课日', dataIndex: 'date', width: 110 },
              { title: '周次', key: 'week', width: 90 },
            ]"
            :data-source="scheduleResult.sessions.filter((s) => s.moved)"
            size="small"
            row-key="name + nominalDate + date + start"
            :pagination="{ pageSize: 8, size: 'small' }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'week'">
                <a-tag color="orange">第{{ record.week }}周</a-tag>
              </template>
            </template>
          </a-table>
        </a-col>
      </a-row>

      <a-alert
        v-if="conflicts.length"
        type="warning"
        show-icon
        style="margin-top: 12px"
        message="检测到同一时段有多门课程"
        :description="conflicts.map((c) => `${c.date}：${c.a.name} × ${c.b.name}`).join('；')"
      />
    </div>

    <div class="panel-card">
      <h3 class="section-title">Wakeup 课程表 CSV</h3>
      <p class="section-desc">
        格式：<code>课程名称,星期,开始节数,结束节数,老师,地点,周数</code>。星期 1=周一 …… 7=周日；周数支持
        <code>1-5、7-11单、12-16双</code> 写法。
      </p>
      <a-space wrap style="margin-bottom: 10px">
        <a-button type="primary" @click="doExport">导出 CSV</a-button>
        <a-button @click="copyCsv">复制内容</a-button>
        <a-checkbox v-model:checked="state.csvBom">带 BOM 头</a-checkbox>
        <span style="color: #6b7a90; font-size: 12.5px">共 {{ scheduleResult.rows.length }} 条</span>
      </a-space>
      <pre class="csv-preview">{{ csvText }}</pre>
    </div>
  </div>
</template>
