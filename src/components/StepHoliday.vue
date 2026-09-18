<script setup>
import { ref, computed } from 'vue'
import { message } from 'ant-design-vue'
import { state, defaultRules } from '../store.js'
import { makeRule, RULE_KIND_TEXT, buildCalendar, resolveDate, teachMapOf, summarizeCalendar } from '../lib/holiday.js'
import { parseDate, formatDate, addDays, diffDays, weekdayOf, WEEKDAY_NAMES } from '../lib/periods.js'

const showAll = ref(false)

const ruleColumns = [
  { title: '类型', key: 'kind', width: 100 },
  { title: '名称', key: 'name', width: 220 },
  { title: '日期', key: 'dates', width: 300 },
  { title: '说明', key: 'hint', width: 260 },
  { title: '启用', key: 'enabled', width: 70 },
  { title: '操作', key: 'action', width: 70 },
]

const kindOptions = [
  { value: 'holiday', label: '放假停课' },
  { value: 'swap', label: '对调' },
  { value: 'makeup', label: '补课' },
]

function addRule(kind) {
  state.rules.push(makeRule(kind, { name: kind === 'holiday' ? '新增假期' : kind === 'swap' ? '新增对调' : '新增补课' }))
}

function delRule(id) {
  const i = state.rules.findIndex((r) => r.id === id)
  if (i >= 0) state.rules.splice(i, 1)
}

function resetRules() {
  state.rules = defaultRules()
  message.success('已载入 2026-2027 学年秋冬学期默认规则')
}

function setTermWeek(idx, field, v) {
  state.semester.terms[idx][field] = Number(v) || 1
}

const range = computed(() => {
  const start = parseDate(state.semester.startDate)
  if (!start) return { start: '', end: '' }
  const end = addDays(start, (state.semester.totalWeeks + 1) * 7 - 1)
  return { start: formatDate(start), end: formatDate(end) }
})

const calendar = computed(() => buildCalendar(state.rules))

/** 每天实际承担了哪些「星期」的课 */
const teachMap = computed(() => teachMapOf(calendar.value, range.value.start, range.value.end))

const dayRows = computed(() => {
  const list = summarizeCalendar(calendar.value, range.value.start, range.value.end)
  return list
    .map((d) => {
      const incoming = (teachMap.value.get(d.date) || []).filter((x) => x.nominalDate !== d.date)
      return { ...d, incoming }
    })
    .filter((d) => showAll.value || d.holiday || d.cancelled || d.movedTo || d.incoming.length)
})

function weekLabel(d) {
  const start = parseDate(state.semester.startDate)
  if (!start) return ''
  return `第${Math.floor(diffDays(start, parseDate(d.date)) / 7) + 1}周`
}

function teachText(d) {
  const extra = d.incoming.map((x) => `${WEEKDAY_NAMES[x.weekday - 1]}的课(${x.nominalDate.slice(5)})`)
  // 放假、或当天自己的课被调走时，只显示承接部分（没有承接就是停课）
  if (d.holiday || d.cancelled) return extra.length ? extra.join(' + ') : '停课'
  return [WEEKDAY_NAMES[d.weekday - 1], ...extra].join(' + ')
}
</script>

<template>
  <div>
    <div class="panel-card">
      <h3 class="section-title">学期与周次设置</h3>
      <p class="section-desc">
        第 1 周的周一即「学期起始日期」。Wakeup 课程表使用「周数」而非具体日期排课，因此起始日期必须与 App 中设置的学期起始日一致。
      </p>
      <a-space wrap size="middle">
        <a-space>
          <span>学期起始日（第1周周一）</span>
          <a-date-picker v-model:value="state.semester.startDate" value-format="YYYY-MM-DD" style="width: 150px" />
        </a-space>
        <a-space>
          <span>总周数</span>
          <a-input-number v-model:value="state.semester.totalWeeks" :min="1" :max="30" style="width: 90px" />
        </a-space>
      </a-space>

      <a-divider style="margin: 14px 0" />

      <a-space wrap size="large">
        <a-space v-for="(t, i) in state.semester.terms" :key="i">
          <a-tag :color="i === 0 ? 'blue' : 'geekblue'">{{ t.label }}</a-tag>
          <span style="font-size: 12.5px; color: #6b7a90">第</span>
          <a-input-number :value="t.weekFrom" :min="1" :max="30" size="small" style="width: 62px" @change="(v) => setTermWeek(i, 'weekFrom', v)" />
          <span style="font-size: 12.5px; color: #6b7a90">~ 第</span>
          <a-input-number :value="t.weekTo" :min="1" :max="30" size="small" style="width: 62px" @change="(v) => setTermWeek(i, 'weekTo', v)" />
          <span style="font-size: 12.5px; color: #6b7a90">周</span>
        </a-space>
      </a-space>
    </div>

    <div class="panel-card">
      <h3 class="section-title">
        节假日与调休规则
        <a-popover trigger="hover" placement="rightTop" :overlay-inner-style="{ maxWidth: '420px' }">
          <template #content>
            <div style="line-height: 1.7">
              <div style="font-weight: 600; margin-bottom: 6px">关于默认规则</div>
              <div>
                系统默认按照
                <a href="https://ugrs.zju.edu.cn/2026/0710/c28218a3187939/page.htm" target="_blank" rel="noopener">
                  浙江大学 2026-2027 学年校历
                </a>
                安排节假日与调休，并已自动载入到下方表格。如学校有临时调整，请直接在此页增删规则；点「载入默认规则」可恢复。
              </div>
            </div>
          </template>
          <a class="help-dot" aria-label="关于默认调休规则">?</a>
        </a-popover>
      </h3>
      <p class="section-desc">
        <b>放假停课</b>：该日期范围内原本的课全部取消。<br />
        <b>对调</b>：两个日期互换课表（例如 10 月 6 日与 9 月 20 日对调，则 9 月 20 日上星期二的课，而 9 月 20 日原本的课改到 10 月 6 日——后者若处于假期则实际停课）。<br />
        <b>补课</b>：把某天的课挪到另一天上。勾选「目标日保留原课程」表示追加（目标日本身的课照常上），不勾选表示替换。
      </p>

      <a-space wrap style="margin-bottom: 12px">
        <a-button @click="addRule('holiday')">+ 放假</a-button>
        <a-button @click="addRule('swap')">+ 对调</a-button>
        <a-button @click="addRule('makeup')">+ 补课</a-button>
        <a-button type="primary" ghost @click="resetRules">载入默认规则（2026-2027 秋冬）</a-button>
      </a-space>

      <a-table :columns="ruleColumns" :data-source="state.rules" :pagination="false" size="small" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'kind'">
            <a-select v-model:value="record.kind" size="small" style="width: 92px" :options="kindOptions" />
          </template>

          <template v-else-if="column.key === 'name'">
            <a-input v-model:value="record.name" size="small" placeholder="规则名称" />
          </template>

          <template v-else-if="column.key === 'dates'">
            <a-space size="small" wrap>
              <template v-if="record.kind === 'holiday'">
                <a-date-picker v-model:value="record.start" value-format="YYYY-MM-DD" size="small" style="width: 128px" />
                <span style="color: #8a97a8">~</span>
                <a-date-picker v-model:value="record.end" value-format="YYYY-MM-DD" size="small" style="width: 128px" />
              </template>
              <template v-else>
                <a-date-picker v-model:value="record.from" value-format="YYYY-MM-DD" size="small" style="width: 128px" />
                <span style="color: #8a97a8">{{ record.kind === 'swap' ? '↔' : '→' }}</span>
                <a-date-picker v-model:value="record.to" value-format="YYYY-MM-DD" size="small" style="width: 128px" />
              </template>
            </a-space>
          </template>

          <template v-else-if="column.key === 'hint'">
            <span v-if="record.kind === 'holiday'" style="color: #6b7a90; font-size: 12px">区间内所有课停上</span>
            <a-checkbox
              v-else-if="record.kind === 'makeup'"
              v-model:checked="record.keepTargetOwn"
              style="font-size: 12px"
            >
              目标日保留原课程
            </a-checkbox>
            <span v-else style="color: #6b7a90; font-size: 12px">两日课表互换</span>
          </template>

          <template v-else-if="column.key === 'enabled'">
            <a-switch v-model:checked="record.enabled" size="small" />
          </template>

          <template v-else-if="column.key === 'action'">
            <a-button size="small" type="link" danger @click="delRule(record.id)">删除</a-button>
          </template>
        </template>
      </a-table>
    </div>

    <div class="panel-card">
      <h3 class="section-title">
        调休结果日历
        <a-switch v-model:checked="showAll" size="small" checked-children="全部日期" un-checked-children="仅变动" />
      </h3>
      <p class="section-desc">
        下表展示每个日期实际「上的是星期几的课」。范围：{{ range.start }} ~ {{ range.end }}。
      </p>
      <a-table
        :columns="[
          { title: '日期', dataIndex: 'date', width: 120 },
          { title: '周次', key: 'week', width: 80 },
          { title: '星期', dataIndex: 'weekdayName', width: 80 },
          { title: '实际上', key: 'teach', width: 320 },
          { title: '备注', key: 'note', width: 220 },
        ]"
        :data-source="dayRows"
        size="small"
        row-key="date"
        :pagination="{ pageSize: 15, size: 'small' }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'week'">
            <a-tag>{{ weekLabel(record) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'teach'">
            <span :style="record.cancelled ? 'color:#c0392b;font-weight:600' : ''">{{ teachText(record) }}</span>
          </template>
          <template v-else-if="column.key === 'note'">
            <a-tag v-if="record.holiday" color="red">放假</a-tag>
            <a-tag v-if="record.movedTo" color="orange">本日课程改到 {{ record.movedTo }}</a-tag>
            <a-tag v-for="x in record.incoming" :key="x.nominalDate" color="blue">
              承接 {{ x.nominalDate }} 的课
            </a-tag>
          </template>
        </template>
      </a-table>
    </div>
  </div>
</template>
