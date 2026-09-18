<script setup>
import { computed } from 'vue'
import { message } from 'ant-design-vue'
import { state, allCourses, applyEntry, updateCourse, resetCourse, autoFill } from '../store.js'
import { WEEKDAY_NAMES, describePeriods } from '../lib/periods.js'

/**
 * `allCourses` 里的行是 `{...c}` 的展开快照，直接 mutate 不会写回源对象。
 * 所有编辑/补全动作必须先通过 id 找回真正的响应式课程对象。
 */
function liveCourse(row) {
  for (const f of state.files) {
    if (!f) continue
    const found = f.courses.find((x) => x.id === row.id)
    if (found) return found
  }
  return row
}

const statusMeta = {
  ok: { color: 'green', text: '完整' },
  filled: { color: 'blue', text: '已补全' },
  manual: { color: 'orange', text: '手动' },
  unresolved: { color: 'red', text: '待补全' },
  pending: { color: 'default', text: '未处理' },
}

const weekdayOptions = WEEKDAY_NAMES.map((n, i) => ({ value: i + 1, label: n }))

const columns = [
  { title: '季度', key: 'term', width: 78 },
  { title: '课程 / 教师', key: 'course', width: 210 },
  { title: '选修表候选', key: 'pick', width: 300 },
  { title: '星期', key: 'weekday', width: 100 },
  { title: '节次', key: 'periods', width: 150 },
  { title: '地点', key: 'location', width: 190 },
  { title: '周数', key: 'weeks', width: 130 },
  { title: '状态', key: 'status', width: 90 },
  { title: '操作', key: 'action', width: 130 },
]

const rows = computed(() => allCourses.value)

function defaultWeeksText(c) {
  const t = state.semester.terms.find((x) => x.key === c.termKey)
  if (!t) return ''
  return `${t.weekFrom}-${t.weekTo}`
}

function slotOf(c) {
  return c.slots && c.slots.length ? c.slots[0] : null
}

function optionLabel(opt) {
  const e = opt.entry
  const time = e.slot
    ? `${WEEKDAY_NAMES[e.slot.weekday - 1]} ${describePeriods(e.slot.start, e.slot.end)}`
    : '时间未定'
  const room = e.room ? ` · ${e.room}` : ''
  return `${time} · ${e.teacher || '—'}${room} · ${e.classCode || ''}`
}

function onPick(c, entryId) {
  const src = liveCourse(c)
  if (!entryId) {
    updateCourse(src, { entryId: '' })
    return
  }
  applyEntry(src, entryId)
  message.success(`已采用：${src.name}`)
}

/** 教务系统已有时间，但选修课程时间表中给出了不同的时间 —— 提示用户自行判断 */
function altEntry(record) {
  const cur = slotOf(record)
  if (!cur) return null
  return (record.fillOptions || []).find(
    (o) =>
      o.entry.slot &&
      (o.entry.slot.weekday !== cur.weekday || o.entry.slot.start !== cur.start || o.entry.slot.end !== cur.end),
  )?.entry || null
}

function altText(e) {
  return `${WEEKDAY_NAMES[e.slot.weekday - 1]} ${describePeriods(e.slot.start, e.slot.end)}`
}

function setWeekday(c, v) {
  const src = liveCourse(c)
  const s = slotOf(src)
  const base = s || { weekday: v, start: 1, end: 2 }
  updateCourse(src, { slots: [{ ...base, weekday: v }] })
}

function setPeriod(c, which, v) {
  const src = liveCourse(c)
  const s = slotOf(src)
  const base = s || { weekday: 1, start: 1, end: 2 }
  const next = { ...base }
  next[which] = Number(v) || 1
  if (next.end < next.start) next.end = next.start
  updateCourse(src, { slots: [next] })
}

function setLocation(c, v) {
  updateCourse(liveCourse(c), { location: v })
}

function setWeeks(c, v) {
  updateCourse(liveCourse(c), { weeksText: v })
}

function reset(c) {
  resetCourse(liveCourse(c))
  message.success('已恢复自动补全结果')
}

function toggleExclude(c) {
  const src = liveCourse(c)
  updateCourse(src, { excluded: !src.excluded })
}

const unresolved = computed(() => rows.value.filter((c) => c.status === 'unresolved'))
</script>

<template>
  <div>
    <div class="panel-card">
      <h3 class="section-title">时间补全与人工校对</h3>
      <p class="section-desc">
        系统已按「课程名称 + 主讲教师 + 上课学季」自动匹配学院选修课程时间表。
        若匹配有误（例如同一门课有多个平行班），可在<b>选修表候选</b>中切换；
        若学院表里也没有时间（如「职业能力发展与创业教育」），请直接在<b>星期 / 节次</b>中手动填写，或先留空稍后由学院通知补充。
        <b>周数</b>留空则默认使用该季度的周次范围。
      </p>

      <a-space wrap style="margin-bottom: 12px">
        <a-button @click="autoFill(); message.success('已重新匹配')">重新自动补全</a-button>
        <a-tag color="blue">选修表补全 {{ rows.filter((c) => c.status === 'filled').length }}</a-tag>
        <a-tag color="orange">手动指定 {{ rows.filter((c) => c.status === 'manual').length }}</a-tag>
        <a-tag :color="unresolved.length ? 'red' : 'green'">待补全 {{ unresolved.length }}</a-tag>
      </a-space>

      <a-alert
        v-if="unresolved.length"
        type="warning"
        show-icon
        style="margin-bottom: 12px"
        :message="`有 ${unresolved.length} 门课程仍缺少上课时间`"
        :description="unresolved.map((c) => c.name).join('、')"
      />

      <a-table
        :columns="columns"
        :data-source="rows"
        :pagination="false"
        size="small"
        row-key="id"
        :scroll="{ x: 1500 }"
        :row-class-name="(r) => (r.status === 'unresolved' ? 'row-warn' : '')"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'term'">
            <a-tag :color="record.termKey === '冬' || record.termKey === '夏' ? 'geekblue' : 'blue'">
              {{ record.termKey || '?' }}季
            </a-tag>
          </template>

          <template v-else-if="column.key === 'course'">
            <div style="font-weight: 600">{{ record.name }}</div>
            <div style="color: #8a97a8; font-size: 12px">{{ record.teacher || '—' }}</div>
          </template>

          <template v-else-if="column.key === 'pick'">
            <a-space direction="vertical" size="2" style="width: 100%">
              <a-select
                v-if="record.fillOptions && record.fillOptions.length"
                :value="record.entryId || undefined"
                size="small"
                style="width: 100%"
                placeholder="未采用选修表时间（保留教务系统时间）"
                allow-clear
                @change="(v) => onPick(record, v)"
              >
                <a-select-option v-for="o in record.fillOptions" :key="o.entry.id" :value="o.entry.id">
                  {{ optionLabel(o) }}
                </a-select-option>
              </a-select>
              <span v-else style="color: #a0aab8; font-size: 12px">选修表中无同名课程</span>
              <a-space v-if="altEntry(record)" size="4" wrap>
                <a-tag color="orange" style="margin: 0">
                  选修表为 {{ altText(altEntry(record)) }}
                </a-tag>
                <a-button size="small" type="link" style="padding: 0" @click="onPick(record, altEntry(record).id)">
                  采用
                </a-button>
              </a-space>
            </a-space>
          </template>

          <template v-else-if="column.key === 'weekday'">
            <a-select
              :value="slotOf(record)?.weekday"
              size="small"
              style="width: 90px"
              placeholder="星期"
              :options="weekdayOptions"
              @change="(v) => setWeekday(record, v)"
            />
          </template>

          <template v-else-if="column.key === 'periods'">
            <a-space size="small">
              <a-input-number
                :value="slotOf(record)?.start"
                size="small"
                :min="1"
                :max="14"
                style="width: 58px"
                @change="(v) => setPeriod(record, 'start', v)"
              />
              <span style="color: #8a97a8">-</span>
              <a-input-number
                :value="slotOf(record)?.end"
                size="small"
                :min="1"
                :max="14"
                style="width: 58px"
                @change="(v) => setPeriod(record, 'end', v)"
              />
            </a-space>
          </template>

          <template v-else-if="column.key === 'location'">
            <a-input
              :value="record.location"
              size="small"
              placeholder="上课地点"
              @change="(e) => setLocation(record, e.target.value)"
            />
          </template>

          <template v-else-if="column.key === 'weeks'">
            <a-input
              :value="record.weeksText"
              size="small"
              :placeholder="defaultWeeksText(record)"
              @change="(e) => setWeeks(record, e.target.value)"
            />
          </template>

          <template v-else-if="column.key === 'status'">
            <a-tag :color="statusMeta[record.status]?.color || 'default'">
              {{ statusMeta[record.status]?.text || record.status }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space size="small">
              <a-button size="small" type="link" @click="reset(record)">自动</a-button>
              <a-button size="small" type="link" :danger="!record.excluded" @click="toggleExclude(record)">
                {{ record.excluded ? '恢复' : '排除' }}
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>

<style>
.row-warn td {
  background: #fffaf0 !important;
}
</style>
